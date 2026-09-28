/**
 * Request guards for the private app API: rate limiting plus optional
 * captcha verification. Captcha failures are recorded (currently a no-op)
 * before the error is re-thrown.
 */
import { recordCaptchaFailure, enforceRateLimit, type RateLimitAction } from "./rate-limit";
import { verifyCaptchaToken } from "./captcha";
import type { CoreContext } from "./request";

export type GuardAction = Extract<RateLimitAction, "search" | "enhance" | "download" | "library" | "gist">;

export async function guard(
  action: GuardAction,
  ctx: CoreContext,
  captchaToken?: string,
): Promise<void> {
  await enforceRateLimit(ctx.ip, action, ctx);

  if (captchaToken === undefined) return;

  try {
    await verifyCaptchaToken(captchaToken, ctx.env);
  } catch (error) {
    await recordCaptchaFailure(ctx.ip, ctx);
    throw error;
  }
}
