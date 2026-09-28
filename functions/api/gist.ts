import { InputError, apiError, json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { guard } from "../_core/guards";
import { collectSkillFiles } from "../_core/ranking";
import { createGist } from "../_core/gist";

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
  const { id } = raw as { id?: unknown };
  if (typeof id !== "string" || id.length < 3 || id.length > 200) {
    throw new InputError("invalid_id", "id must be a string between 3 and 200 characters.");
  }

  await guard("gist", ctx);

  const files = await collectSkillFiles([id], ctx);
  const file = files[0];
  if (!file) {
    return apiError(404, "no_markdown", "No downloadable SKILL.md was found for that skill.");
  }

  const url = await createGist(ctx.env, file.filename, file.content, `Skill Finder: ${id}`);
  return json({ url });
});
