import { InputError, json, withErrors } from "../_core/http";
import { initRequest, type RouteContext } from "../_core/request";
import { guard } from "../_core/guards";
import { openAiProvider } from "../_core/ai-provider";
import { enhancePrompt } from "../_core/ranking";

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
  const { prompt, openaiKey } = raw as {
    prompt?: unknown;
    openaiKey?: unknown;
  };
  if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 2000) {
    throw new InputError("invalid_prompt", "Prompt must be a string between 3 and 2000 characters.");
  }
  if (typeof openaiKey !== "string" || openaiKey.length === 0) {
    throw new InputError(
      "missing_openai_key",
      "Add your OpenAI key in AI settings to use Enhance, or enable the in-browser model.",
    );
  }

  await guard("enhance", ctx);

  const enhanced = await enhancePrompt(prompt, openAiProvider(openaiKey));
  return json({ enhanced });
});
