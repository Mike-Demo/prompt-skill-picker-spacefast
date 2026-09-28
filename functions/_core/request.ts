/**
 * Per-request context for SpaceFast function routes.
 *
 * The platform calls route modules as `GET/POST(request, context)` where
 * `context = { params, env, ctx }`. This module turns that into a typed
 * CoreContext carrying the database, secrets, and caller IP — `_core` never
 * touches `process.env` or framework request globals.
 */
import { ensureSchema, type SpacefastDb } from "./db";

export interface CoreEnv {
  db: SpacefastDb;
  HCAPTCHA_SITEKEY?: string | undefined;
  HCAPTCHA_SECRET_KEY?: string | undefined;
  GITHUB_GIST_TOKEN?: string | undefined;
  RATE_LIMIT_SALT?: string | undefined;
  /** "development" enables hCaptcha's test keys; anything else fails closed. */
  NODE_ENV?: string | undefined;
}

export interface CoreContext {
  env: CoreEnv;
  /** Caller IP as resolved from proxy headers, or "unknown". */
  ip: string;
}

export interface RouteContext {
  params: Record<string, string | string[] | undefined>;
  env: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Resolves the caller's IP from proxy headers; falls back to a shared bucket. */
export function getClientIp(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip");
  if (direct) return direct;
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

/**
 * Builds the CoreContext for a request: binds env.DB, reads secrets, resolves
 * the caller IP, and ensures the database schema exists.
 */
export async function initRequest(request: Request, context: RouteContext): Promise<CoreContext> {
  const rawDb = context.env["DB"];
  if (!rawDb || typeof (rawDb as { prepare?: unknown }).prepare !== "function") {
    throw new Error("The database binding (env.DB) is not configured for this space.");
  }
  const db = rawDb as SpacefastDb;
  await ensureSchema(db);
  return {
    env: {
      db,
      HCAPTCHA_SITEKEY: asString(context.env["HCAPTCHA_SITEKEY"]),
      HCAPTCHA_SECRET_KEY: asString(context.env["HCAPTCHA_SECRET_KEY"]),
      GITHUB_GIST_TOKEN: asString(context.env["GITHUB_GIST_TOKEN"]),
      RATE_LIMIT_SALT: asString(context.env["RATE_LIMIT_SALT"]),
      NODE_ENV: asString(context.env["NODE_ENV"]),
    },
    ip: getClientIp(request),
  };
}
