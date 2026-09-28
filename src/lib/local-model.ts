/**
 * In-browser AI via WebLLM, lazy-loaded.
 *
 * The `@mlc-ai/web-llm` package is only imported inside `getEngine()`, so the
 * few-hundred-MB model download and the WebGPU engine never touch the main
 * bundle — they load the first time the user enables the in-browser model.
 */

export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

type Engine = {
  chat: {
    completions: {
      create(args: {
        messages: { role: string; content: string }[];
        max_tokens?: number;
        temperature?: number;
      }): Promise<{ choices?: { message?: { content?: string | null } | null }[] | null }>;
    };
  };
};

let enginePromise: Promise<Engine> | undefined;

/** Singleton: creates the WebLLM engine on first use, caches the promise. */
async function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      try {
        const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
        return (await CreateMLCEngine("Qwen2.5-0.5B-Instruct-q4f16_1-MLC")) as Engine;
      } catch (cause) {
        enginePromise = undefined;
        throw new Error(
          "The in-browser model could not start (WebGPU unavailable or download failed).",
          { cause },
        );
      }
    })();
  }
  return enginePromise;
}

async function complete(prompt: string, system: string, maxTokens: number): Promise<string> {
  const engine = await getEngine();
  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  });
  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Asks the in-browser model for 3-6 short lowercase keyword queries derived
 * from the user's prompt. Falls back to the raw prompt on any failure.
 */
export async function expandQueriesLocal(prompt: string): Promise<string[]> {
  try {
    const raw = await complete(
      prompt,
      "You expand a search prompt into short search queries. Reply with 3 to 6 short lowercase keyword queries, one per line, nothing else.",
      128,
    );
    const lines = raw
      .split("\n")
      .map((line) => line.trim().replace(/^[-*\d.)\s]+/, ""))
      .filter((line) => line.length > 0)
      .slice(0, 6);
    return lines.length > 0 ? lines : [prompt];
  } catch {
    return [prompt];
  }
}

/**
 * Asks the in-browser model to rewrite the user's draft into a sharp search
 * brief — one short paragraph. Falls back to the raw prompt on any failure.
 */
export async function enhanceLocal(prompt: string): Promise<string> {
  try {
    const raw = await complete(
      prompt,
      "You rewrite a rough draft into a sharp, specific search brief for finding AI agent skills. Reply with one short paragraph, nothing else.",
      256,
    );
    const trimmed = raw.trim().slice(0, 2000);
    return trimmed.length > 0 ? trimmed : prompt;
  } catch {
    return prompt;
  }
}
