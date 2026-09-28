/**
 * HTTP helpers for the worker routes: JSON responses, the flat
 * `{ error, code, retryAfter? }` envelope, and central error mapping.
 */
import { RateLimitError } from "./rate-limit";
import { RegistryUnavailableError } from "./registry";
import { GistNotConfiguredError } from "./gist";
import { InvalidOpenAiKeyError } from "./ai-provider";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export interface ApiErrorBody {
  error: string;
  code: string;
  retryAfter?: number | undefined;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra: { retryAfter?: number | undefined; headers?: Record<string, string> | undefined } = {},
): Response {
  const body: ApiErrorBody = { error: message, code };
  if (extra.retryAfter !== undefined) body.retryAfter = extra.retryAfter;
  const headers: Record<string, string> = { ...(extra.headers ?? {}) };
  if (extra.retryAfter !== undefined) headers["Retry-After"] = String(extra.retryAfter);
  return json(body, status, headers);
}

export class InputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "InputError";
    this.code = code;
  }
}

/**
 * Maps a thrown error to an HTTP response. Unknown errors become a generic
 * 500; their detail stays in the worker log, never in the response body.
 */
export function handleRouteError(error: unknown): Response {
  if (error instanceof InputError) {
    return apiError(400, error.code, error.message);
  }
  if (error instanceof RateLimitError) {
    // The message carries "in Ns" so the frontend cooldown hook keeps working.
    return apiError(429, "rate_limited", error.message, {
      retryAfter: error.retryAfterSeconds,
    });
  }
  if (error instanceof RegistryUnavailableError) {
    return apiError(503, "registry_unavailable", error.message, { retryAfter: 60 });
  }
  if (error instanceof GistNotConfiguredError) {
    return apiError(503, "gist_not_configured", error.message);
  }
  if (error instanceof InvalidOpenAiKeyError) {
    return apiError(502, "invalid_openai_key", error.message);
  }
  if (error instanceof Error && /captcha/i.test(error.message)) {
    return apiError(400, "captcha_failed", error.message);
  }
  console.error("Unhandled route error:", error);
  return apiError(500, "internal_error", "Something went wrong. Please try again.");
}

/** Wraps a route handler with central error mapping. */
export function withErrors<C>(
  handler: (request: Request, context: C) => Promise<Response>,
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleRouteError(error);
    }
  };
}
