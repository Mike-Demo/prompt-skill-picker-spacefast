import { InputError, json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { guard } from "../_core/guards";
import { providerForRequest } from "../_core/ai-provider";
import { rankSkills } from "../_core/ranking";
import { saveSearch } from "../_core/saved-search";
import { allowSkillIds } from "../_core/allowlist";

interface SearchBody {
  prompt?: unknown;
  openaiKey?: unknown;
  queries?: unknown;
}

function parseBody(value: unknown): { prompt: string; openaiKey: string | undefined; queries: string[] | undefined } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("invalid_json", "Request body must be a JSON object.");
  }
  const body = value as SearchBody;
  if (typeof body.prompt !== "string" || body.prompt.trim().length < 3 || body.prompt.length > 2000) {
    throw new InputError("invalid_prompt", "Prompt must be a string between 3 and 2000 characters.");
  }
  const openaiKey = body.openaiKey === undefined ? undefined : typeof body.openaiKey === "string" ? body.openaiKey : undefined;
  if (body.openaiKey !== undefined && openaiKey === undefined) {
    throw new InputError("invalid_openai_key_type", "openaiKey must be a string.");
  }
  let queries: string[] | undefined;
  if (body.queries !== undefined) {
    if (!Array.isArray(body.queries) || !body.queries.every((q) => typeof q === "string")) {
      throw new InputError("invalid_queries", "queries must be an array of strings.");
    }
    queries = body.queries as string[];
  }
  return { prompt: body.prompt, openaiKey, queries };
}

export const POST = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new InputError("invalid_json", "Request body must be JSON.");
  }
  const { prompt, openaiKey, queries } = parseBody(raw);
  await guard("search", ctx);

  const ai = providerForRequest(openaiKey);
  const results = await rankSkills(prompt, ai, ctx, queries);

  const token = await saveSearch(ctx, prompt, results);
  allowSkillIds(results.map((r) => r.id));

  return json({ results, token });
});
