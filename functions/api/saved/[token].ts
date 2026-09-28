import { apiError, json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { guard } from "../../_core/guards";
import { loadSavedSearch } from "../../_core/saved-search";
import { allowSkillIds } from "../../_core/allowlist";

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const token = context.params["token"];
  if (typeof token !== "string" || token.length === 0) {
    return apiError(400, "invalid_token", "A share token is required.");
  }

  await guard("library", ctx);

  const saved = await loadSavedSearch(ctx, token);
  if (!saved) {
    return apiError(404, "not_found", "This share link is unknown or expired.");
  }
  allowSkillIds(saved.results.map((r) => r.id));

  return json(saved);
});
