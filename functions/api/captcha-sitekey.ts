import { apiError, json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { getCaptchaSitekey } from "../_core/captcha";

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  try {
    return json({ sitekey: getCaptchaSitekey(ctx.env) });
  } catch {
    return apiError(503, "captcha_not_configured", "Captcha is not configured.");
  }
});
