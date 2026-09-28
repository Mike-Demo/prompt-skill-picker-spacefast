/**
 * Hourly maintenance: deletes expired shared searches, rate-limit windows
 * older than one day, and registry cache rows older than seven days.
 */
import { first, run } from "./db";
import type { CoreContext } from "./request";

export interface CleanupResult {
  savedSearches: number;
  rateLimitHits: number;
  registryCache: number;
}

async function deleteOlderThan(ctx: CoreContext, table: string, column: string, cutoff: number): Promise<number> {
  const countRow = await first(
    ctx.env.db,
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} < ?`,
    cutoff,
  ).catch(() => null);
  await run(ctx.env.db, `DELETE FROM ${table} WHERE ${column} < ?`, cutoff);
  const n = countRow?.["n"];
  return typeof n === "number" ? n : Number(n ?? 0);
}

export async function runCleanup(ctx: CoreContext): Promise<CleanupResult> {
  const now = Date.now();
  const savedSearches = await deleteOlderThan(ctx, "saved_searches", "expires_at", now);
  const rateLimitHits = await deleteOlderThan(
    ctx,
    "rate_limit_hits",
    "window_start",
    Math.floor(now / 1000) - 24 * 60 * 60,
  );
  const registryCache = await deleteOlderThan(
    ctx,
    "registry_cache",
    "fetched_at",
    now - 7 * 24 * 60 * 60 * 1000,
  );
  return { savedSearches, rateLimitHits, registryCache };
}
