import { InputError, json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { guard } from "../_core/guards";
import { collectSkillFiles } from "../_core/ranking";

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InputError("invalid_json", "Request body must be a JSON object.");
  }
  const { ids } = raw as { ids?: unknown };
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 50 ||
    !ids.every((id) => typeof id === "string" && id.length >= 3 && id.length <= 200)
  ) {
    throw new InputError("invalid_ids", "ids must be an array of 1 to 50 skill ids, each 3 to 200 characters.");
  }

  await guard("download", ctx);

  const files = await collectSkillFiles(ids, ctx);
  return json({ files });
});
