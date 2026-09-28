/**
 * Minimal wrapper around SpaceFast's env.DB (D1-shaped API over MySQL/MariaDB).
 *
 * Conventions: timestamps are epoch milliseconds stored as BIGINT, JSON
 * payloads are stored as text columns and parsed by callers.
 */

export interface DbStatement {
  bind(...params: unknown[]): DbResult;
}

export interface DbResult {
  all(): Promise<{ results: Record<string, unknown>[] }>;
  first(): Promise<Record<string, unknown> | null>;
  run(): Promise<unknown>;
}

export interface SpacefastDb {
  prepare(sql: string): DbStatement;
}

function toDbValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

export function q(db: SpacefastDb, sql: string, ...params: unknown[]): DbResult {
  return db.prepare(sql).bind(...params.map(toDbValue));
}

export async function all(
  db: SpacefastDb,
  sql: string,
  ...params: unknown[]
): Promise<Record<string, unknown>[]> {
  const res = await q(db, sql, ...params).all();
  return res.results ?? [];
}

export async function first(
  db: SpacefastDb,
  sql: string,
  ...params: unknown[]
): Promise<Record<string, unknown> | null> {
  return (await q(db, sql, ...params).first()) ?? null;
}

export async function run(db: SpacefastDb, sql: string, ...params: unknown[]): Promise<void> {
  await q(db, sql, ...params).run();
}

const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS saved_searches (
    token VARCHAR(32) PRIMARY KEY,
    prompt TEXT NOT NULL,
    results MEDIUMTEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    KEY idx_saved_searches_expires (expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS registry_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    payload MEDIUMTEXT NOT NULL,
    fetched_at BIGINT NOT NULL,
    KEY idx_registry_cache_fetched (fetched_at)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limit_hits (
    bucket VARCHAR(255) PRIMARY KEY,
    count INT NOT NULL,
    window_start BIGINT NOT NULL,
    KEY idx_rate_limit_window (window_start)
  )`,
];

let schemaPromise: Promise<void> | null = null;

/**
 * Creates the three worker tables when they do not exist yet. Idempotent and
 * safe to call on every request; the DDL only runs once per isolate.
 */
export function ensureSchema(db: SpacefastDb): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const sql of SCHEMA_STATEMENTS) {
        await run(db, sql);
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
