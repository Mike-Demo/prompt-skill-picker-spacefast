/**
 * Per-IP rate limiting.
 *
 * Durable quotas live in the `rate_limit_hits` table: one row per
 * (ip-hash, action, window) bucket, consumed with an atomic
 * INSERT ... ON DUPLICATE KEY UPDATE. Cheap cache-backed actions ("library",
 * "api") are enforced in memory instead and never write a row.
 *
 * IPs are hashed with a server-side salt before storage, so raw addresses are
 * never persisted.
 */
import { first, run, type SpacefastDb } from "./db";
import type { CoreContext } from "./request";

export type RateLimitAction = "search" | "enhance" | "download" | "library" | "gist" | "api";

interface Window {
  readonly seconds: number;
  readonly max: number;
}

const LIMITS: Record<RateLimitAction, readonly Window[]> = {
  search: [
    { seconds: 60, max: 3 },
    { seconds: 24 * 60 * 60, max: 30 },
  ],
  enhance: [
    { seconds: 60, max: 3 },
    { seconds: 24 * 60 * 60, max: 30 },
  ],
  download: [
    { seconds: 60, max: 10 },
    { seconds: 24 * 60 * 60, max: 200 },
  ],
  // Publishing a gist writes to GitHub under the project's own token, so it
  // gets its own, much tighter quota than a read-only download.
  gist: [
    { seconds: 60, max: 2 },
    { seconds: 24 * 60 * 60, max: 20 },
  ],
  // The library is served from a shared server cache, so its limit is enforced
  // in memory and never writes a database row.
  library: [
    { seconds: 60, max: 20 },
    { seconds: 60 * 60, max: 200 },
  ],
  // Read-only public JSON API for agents, served from the shared cache.
  api: [
    { seconds: 60, max: 30 },
    { seconds: 24 * 60 * 60, max: 500 },
  ],
};

/** Actions counted in memory instead of in the database. */
const IN_MEMORY_ACTIONS: ReadonlySet<RateLimitAction> = new Set<RateLimitAction>(["library", "api"]);

const ACTION_LABELS: Record<RateLimitAction, string> = {
  search: "search again",
  enhance: "enhance again",
  download: "download again",
  library: "reload the library",
  gist: "publish another gist",
  api: "call the API again",
};

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// In-memory sliding window for cheap, cache-backed actions.
// ---------------------------------------------------------------------------

const MEMORY_MAX_KEYS = 5000;
const memoryHits = new Map<string, number[]>();

function pruneMemory(): void {
  if (memoryHits.size <= MEMORY_MAX_KEYS) return;
  for (const key of memoryHits.keys()) {
    memoryHits.delete(key);
    if (memoryHits.size <= MEMORY_MAX_KEYS) break;
  }
}

function enforceInMemory(key: string, action: RateLimitAction): void {
  const now = Date.now();
  const longest = Math.max(...LIMITS[action].map((w) => w.seconds));
  const hits = (memoryHits.get(key) ?? []).filter((at) => at > now - longest * 1000);

  for (const window of LIMITS[action]) {
    const used = hits.filter((at) => at > now - window.seconds * 1000).length;
    if (used < window.max) continue;
    memoryHits.set(key, hits);
    throw new RateLimitError(
      `Too many requests. You can ${ACTION_LABELS[action]} in ${window.seconds}s.`,
      window.seconds,
    );
  }

  hits.push(now);
  memoryHits.set(key, hits);
  pruneMemory();
}

// ---------------------------------------------------------------------------
// Durable limiter (MySQL)
// ---------------------------------------------------------------------------

/**
 * Atomically consumes one hit from the bucket and returns the new count.
 * The INSERT ... ON DUPLICATE KEY UPDATE is a single atomic statement, so
 * concurrent requests cannot both slip under the quota.
 */
async function consume(db: SpacefastDb, bucket: string, windowStart: number): Promise<number> {
  await run(
    db,
    `INSERT INTO rate_limit_hits (bucket, count, window_start) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE count = count + 1`,
    bucket,
    windowStart,
  );
  const row = await first(db, `SELECT count AS count FROM rate_limit_hits WHERE bucket = ?`, bucket);
  const count = row?.["count"];
  return typeof count === "number" ? count : Number(count ?? 1);
}

/**
 * Rejects callers over their quota. Throws RateLimitError.
 * Fails open when the store is unreachable, so an outage cannot lock everyone out.
 */
export async function enforceRateLimit(
  ip: string,
  action: RateLimitAction,
  ctx: CoreContext,
): Promise<void> {
  let ipHash: string;
  try {
    ipHash = await hashIp(ip, ctx.env.RATE_LIMIT_SALT ?? "skill-finder-default-salt");
  } catch {
    return;
  }

  if (IN_MEMORY_ACTIONS.has(action)) {
    enforceInMemory(ipHash, action);
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  for (const window of LIMITS[action]) {
    const windowStart = Math.floor(nowSec / window.seconds);
    const bucket = `${ipHash}:${action}:${window.seconds}:${windowStart}`;
    let count: number;
    try {
      count = await consume(ctx.env.db, bucket, windowStart);
    } catch {
      return;
    }
    if (count <= window.max) continue;
    const retryAfter = Math.max(1, (windowStart + 1) * window.seconds - nowSec);
    throw new RateLimitError(
      `Too many requests. You can ${ACTION_LABELS[action]} in ${retryAfter}s.`,
      retryAfter,
    );
  }
}
