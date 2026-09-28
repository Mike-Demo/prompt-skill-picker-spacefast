import { apiError, json, withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { guard } from "../../_core/guards";
import { isAgentKey } from "../../_core/agents";
import { listAgentSkillLibrary } from "../../_core/library";
import { allowSkillIds } from "../../_core/allowlist";

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  const agent = context.params["agent"];
  if (typeof agent !== "string" || !isAgentKey(agent)) {
    return apiError(404, "unknown_agent", `Unknown agent: ${agent}.`);
  }

  await guard("library", ctx);

  const library = await listAgentSkillLibrary(ctx, agent);
  allowSkillIds(library.entries.map((e) => e.id));

  return json(library);
});
