/**
 * Durable cache for public skills-registry and GitHub responses.
 *
 * The worker's in-memory caches vanish when the isolate recycles, which turned
 * a slow upstream registry into an empty page. This table keeps the last good
 * response so the app can serve recent data while the registry is unavailable.
 */
import { first, run } from "./db";
import type { CoreContext } from "./request";
import type { CacheEntry } from "./types";

function parseRow<T>(row: Record<string, unknown> | null, freshMs: number): CacheEntry<T> | null {
  if (!row) return null;
  const raw = row["payload"];
  if (typeof raw !== "string") return null;
  let payload: T;
  try {
    payload = JSON.parse(raw) as T;
  } catch {
    return null;
  }
  const fetchedAt = row["fetched_at"];
  if (typeof fetchedAt !== "number") return null;
  return { payload, fetchedAt, stale: Date.now() - fetchedAt > freshMs };
}

export async function readRegistryCache<T>(
  ctx: CoreContext,
  key: string,
  freshMs: number,
): Promise<CacheEntry<T> | null> {
  try {
    const row = await first(
      ctx.env.db,
      `SELECT payload, fetched_at FROM registry_cache WHERE cache_key = ?`,
      key,
    );
    return parseRow<T>(row, freshMs);
  } catch {
    return null;
  }
}

export async function writeRegistryCache<T>(
  ctx: CoreContext,
  key: string,
  payload: T,
): Promise<void> {
  try {
    await run(
      ctx.env.db,
      `INSERT INTO registry_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), fetched_at = VALUES(fetched_at)`,
      key,
      JSON.stringify(payload),
      Date.now(),
    );
  } catch {
    // A cache write failure must never break the request it was helping.
  }
}
