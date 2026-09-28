/**
 * AI provider interface for skill ranking and prompt enhancement.
 *
 * There is deliberately NO server-side AI key. Two implementations:
 * - `openAiProvider(apiKey)`: the visitor's own OpenAI key, sent per request,
 *   forwarded to OpenAI, never logged or stored.
 * - `nullProvider()`: no AI at all — expansion returns the literal prompt and
 *   ranking falls back to registry install counts.
 */
export class InvalidOpenAiKeyError extends Error {
  constructor() {
    super("That OpenAI key was rejected. Check the key in AI settings and try again.");
    this.name = "InvalidOpenAiKeyError";
  }
}

export interface RankedSkill {
  id: string;
  score: number;
  reason: string;
}

export interface AiProvider {
  expandQueries(prompt: string): Promise<string[]>;
  rank(prompt: string, catalog: string, maxResults: number): Promise<RankedSkill[]>;
  enhance(prompt: string): Promise<string>;
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;

async function chatJson(apiKey: string, system: string, user: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (res.status === 401) throw new InvalidOpenAiKeyError();
    if (!res.ok) throw new Error(`OpenAI request failed (HTTP ${res.status}).`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned no content.");
    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function chatText(apiKey: string, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.5,
      }),
    });
    if (res.status === 401) throw new InvalidOpenAiKeyError();
    if (!res.ok) throw new Error(`OpenAI request failed (HTTP ${res.status}).`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return body.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean);
}

function asRanked(value: unknown): RankedSkill[] {
  if (!Array.isArray(value)) return [];
  const out: RankedSkill[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r["id"] !== "string") continue;
    out.push({
      id: r["id"],
      score: typeof r["score"] === "number" ? r["score"] : 0,
      reason: typeof r["reason"] === "string" ? r["reason"] : "",
    });
  }
  return out;
}

export function openAiProvider(apiKey: string): AiProvider {
  return {
    async expandQueries(prompt: string): Promise<string[]> {
      const parsed = await chatJson(
        apiKey,
        "You turn a user's goal into short keyword search queries for a registry of AI agent skills. Reply with a JSON object: {\"queries\": [...]}.",
        `Return between 3 and 6 queries, each 1-3 lowercase keywords, no punctuation.\nUser goal: ${prompt}`,
      );
      const queries = asStringArray((parsed as Record<string, unknown>)["queries"]).slice(0, 6);
      return queries.length > 0 ? queries : [prompt];
    },

    async rank(prompt: string, catalog: string, maxResults: number): Promise<RankedSkill[]> {
      const parsed = await chatJson(
        apiKey,
        "Rank agent skills by how well they serve the user's goal. Reply with a JSON object: {\"results\": [{\"id\": ..., \"score\": 0-100, \"reason\": ...}]}.",
        [
          "Only use ids from the catalog. Drop clearly irrelevant skills.",
          "score is 0-100. reason is one sentence, at most 140 characters, addressed to the user.",
          `Return at most ${maxResults} results, best first.`,
          `\nUser goal: ${prompt}`,
          `\nCatalog:\n${catalog}`,
        ].join("\n"),
      );
      return asRanked((parsed as Record<string, unknown>)["results"]);
    },

    async enhance(prompt: string): Promise<string> {
      const text = await chatText(
        apiKey,
        "You rewrite a user's rough goal into a sharp search brief for a registry of AI agent skills. Keep the user's intent and voice. Make it specific: name the role or context, the tasks, the inputs and outputs, and any constraints. One short paragraph, no preamble, no quotes.",
        `Draft: ${prompt}`,
      );
      const enhanced = text.trim().slice(0, 2000);
      return enhanced.length >= 3 ? enhanced : prompt;
    },
  };
}

/** No-AI fallback: literal prompt search, install-count ranking. */
export function nullProvider(): AiProvider {
  return {
    async expandQueries(prompt: string): Promise<string[]> {
      return [prompt];
    },
    async rank(_prompt: string, _catalog: string, _max: number): Promise<RankedSkill[]> {
      return [];
    },
    async enhance(prompt: string): Promise<string> {
      return prompt;
    },
  };
}

/** Builds the provider for a request: visitor key when supplied, none otherwise. */
export function providerForRequest(openaiKey: string | undefined): AiProvider {
  return openaiKey && openaiKey.length > 0 ? openAiProvider(openaiKey) : nullProvider();
}
