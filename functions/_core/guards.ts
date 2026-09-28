/**
 * Request guards for the private app API: rate limiting. (hCaptcha was
 * removed; rate limits remain the abuse protection.)
 */
import { enforceRateLimit, type RateLimitAction } from "./rate-limit";
import type { CoreContext } from "./request";

export type GuardAction = Extract<RateLimitAction, "search" | "enhance" | "download" | "library" | "gist">;

export async function guard(action: GuardAction, ctx: CoreContext): Promise<void> {
  await enforceRateLimit(ctx.ip, action, ctx);
}
