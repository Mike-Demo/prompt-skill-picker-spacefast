/**
 * Public JSON API helpers: CORS, the versioned `{ data, meta }` /
 * `{ error: { code, message } }` envelope, the legacy flat payloads, and the
 * per-visitor API quota.
 */
import { enforceRateLimit, RateLimitError } from "./rate-limit";
import type { CoreContext } from "./request";
import type { PublicSkill, SkillLibraryEntry, SkillLibraryResponse } from "./types";

export type { PublicSkill };

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const toPublicSkill = (entry: SkillLibraryEntry): PublicSkill => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  source: entry.source,
  installs: entry.installs,
  installCommand: `npx skills use "https://github.com/${entry.source}" --skill "${entry.skillId}"`,
  url: entry.htmlUrl,
});

export const jsonResponse = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response =>
  Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300", ...extra },
  });

export const errorResponse = (
  status: number,
  code: string,
  error: string,
  extra: Record<string, string> = {},
): Response =>
  Response.json(
    { error, code },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra } },
  );

export const optionsResponse = (): Response =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

/** Standard success envelope: { data, meta }. */
export const dataResponse = (data: unknown, meta: Record<string, unknown> = {}): Response =>
  Response.json(
    { data, meta: { apiVersion: "1", ...meta } },
    { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );

/** Standard failure envelope: { error: { code, message } }. */
export const envelopeError = (
  status: number,
  code: string,
  message: string,
  extra: Record<string, string> = {},
): Response =>
  Response.json(
    { error: { code, message } },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...extra } },
  );

/** Applies the per-visitor API quota; returns a flat 429 when exceeded. */
export async function checkApiLimit(ctx: CoreContext): Promise<Response | null> {
  try {
    await enforceRateLimit(ctx.ip, "api", ctx);
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return errorResponse(429, "rate_limited", error.message, {
        "Retry-After": String(error.retryAfterSeconds),
      });
    }
    return null;
  }
}

/** Applies the per-visitor API quota; returns an enveloped 429 when exceeded. */
export async function checkEnvelopeLimit(ctx: CoreContext): Promise<Response | null> {
  try {
    await enforceRateLimit(ctx.ip, "api", ctx);
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) {
      return envelopeError(429, "rate_limited", error.message, {
        "Retry-After": String(error.retryAfterSeconds),
      });
    }
    return null;
  }
}

export function libraryPayload(response: SkillLibraryResponse, skills: PublicSkill[]) {
  return { count: skills.length, stale: response.stale, skills };
}
