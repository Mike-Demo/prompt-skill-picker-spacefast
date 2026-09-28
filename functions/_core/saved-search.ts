/**
 * Persistence for shared searches (the /s/:token links).
 */
import { all, first, run } from "./db";
import type { CoreContext } from "./request";
import type { SavedSearchResponse, SkillSuggestion } from "./types";

/** Shared searches stay retrievable for three days, then expire. */
const TTL_MS = 72 * 60 * 60 * 1000;
const TOKEN_BYTES = 6;
const PRUNE_CHANCE = 0.05;

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Share tokens are hex-only, so keep validation strict. */
export function isWellFormedToken(token: string): boolean {
  return /^[0-9a-f]{4,32}$/.test(token);
}

function parseResults(raw: unknown): SkillSuggestion[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SkillSuggestion[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persists a completed search so it can be replayed from a link without
 * re-running the AI. Returns the share token, or null when the write fails —
 * a failed save must never break the search that produced it.
 */
export async function saveSearch(
  ctx: CoreContext,
  prompt: string,
  results: readonly SkillSuggestion[],
): Promise<string | null> {
  try {
    const token = randomToken();
    const now = Date.now();
    await run(
      ctx.env.db,
      `INSERT INTO saved_searches (token, prompt, results, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      token,
      prompt,
      JSON.stringify(results),
      now,
      now + TTL_MS,
    );

    if (Math.random() < PRUNE_CHANCE) {
      await run(ctx.env.db, `DELETE FROM saved_searches WHERE expires_at < ?`, now);
    }
    return token;
  } catch {
    return null;
  }
}

/** Reads a shared search, treating expired or unknown tokens as missing. */
export async function loadSavedSearch(
  ctx: CoreContext,
  token: string,
): Promise<SavedSearchResponse | null> {
  if (!isWellFormedToken(token)) return null;

  const now = Date.now();
  const row = await first(
    ctx.env.db,
    `SELECT prompt, results, expires_at FROM saved_searches
     WHERE token = ? AND expires_at > ?`,
    token,
    now,
  );
  if (!row || typeof row["prompt"] !== "string") return null;
  const expiresAt = row["expires_at"];
  return {
    prompt: row["prompt"],
    results: parseResults(row["results"]),
    expiresAt: typeof expiresAt === "number" ? new Date(expiresAt).toISOString() : "",
  };
}

/**
 * True when a skill id appears in any unexpired shared search. Search results
 * live longer than the in-memory allowlist (and are not tied to one worker
 * isolate), so this is the durable proof that the app itself surfaced the id.
 */
export async function isSkillIdInSavedSearch(ctx: CoreContext, id: string): Promise<boolean> {
  try {
    const rows = await all(
      ctx.env.db,
      `SELECT token FROM saved_searches
       WHERE expires_at > ? AND JSON_CONTAINS(results, JSON_OBJECT('id', ?))
       LIMIT 1`,
      Date.now(),
      id,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
