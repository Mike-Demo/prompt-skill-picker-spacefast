/**
 * hCaptcha server-side verification.
 *
 * Secrets come from the request context env (never process.env). Outside
 * development, hCaptcha's official test pair is NOT used: a deployed worker
 * with no secret configured fails closed.
 */
import type { CoreEnv } from "./request";

const TEST_SECRET = "0x0000000000000000000000000000000000000000";
const TEST_SITEKEY = "10000000-ffff-ffff-ffff-000000000001";

function isDevelopment(env: CoreEnv): boolean {
  return env.NODE_ENV === "development";
}

export function getCaptchaSitekey(env: CoreEnv): string {
  if (env.HCAPTCHA_SITEKEY) return env.HCAPTCHA_SITEKEY;
  if (isDevelopment(env)) return TEST_SITEKEY;
  throw new Error("Captcha is not configured.");
}

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

// hCaptcha tokens are single-use at siteverify. Remember a verified token
// (hashed, never logged) for a short window so one captcha solve can cover
// consecutive actions, e.g. "Enhance" followed by "Find skills".
const VERIFIED_TOKEN_TTL_MS = 5 * 60 * 1000;
const verifiedTokens = new Map<string, number>();

async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pruneVerifiedTokens(now: number): void {
  for (const [key, expiry] of verifiedTokens) {
    if (expiry <= now) verifiedTokens.delete(key);
  }
}

export async function verifyCaptchaToken(token: string, env: CoreEnv): Promise<void> {
  const now = Date.now();
  pruneVerifiedTokens(now);

  const key = await tokenKey(token);
  const cachedExpiry = verifiedTokens.get(key);
  if (cachedExpiry && cachedExpiry > now) return;

  const secret = env.HCAPTCHA_SECRET_KEY;
  if (!secret && !isDevelopment(env)) {
    throw new Error("Captcha verification is unavailable right now. Please try again later.");
  }
  // hCaptcha's official test pair keeps local development working without keys.
  const effectiveSecret = secret ?? TEST_SECRET;

  const body = new URLSearchParams({ secret: effectiveSecret, response: token });
  const response = await fetch("https://hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Captcha verification failed (HTTP ${response.status}). Please try again.`);
  }

  const result = (await response.json()) as SiteverifyResponse;
  if (!result.success) {
    const codes = result["error-codes"]?.join(", ");
    throw new Error(
      codes
        ? `Captcha verification failed: ${codes}. Please retry the captcha.`
        : "Captcha verification failed. Please retry the captcha.",
    );
  }

  verifiedTokens.set(key, now + VERIFIED_TOKEN_TTL_MS);
}
