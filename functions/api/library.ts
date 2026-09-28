import { json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { guard } from "../_core/guards";
import { listSkillLibrary } from "../_core/library";
import { allowSkillIds } from "../_core/allowlist";

export const GET = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  await guard("library", ctx);

  const library = await listSkillLibrary(ctx);
  allowSkillIds(library.entries.map((e) => e.id));

  return json(library);
});
