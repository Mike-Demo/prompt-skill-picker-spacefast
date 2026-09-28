/**
 * GitHub removed anonymous gist creation, so publishing a skill as a gist
 * requires a token with the `gist` scope. The token never leaves the worker.
 */
import type { CoreEnv } from "./request";

const GIST_ENDPOINT = "https://api.github.com/gists";

export class GistNotConfiguredError extends Error {
  constructor() {
    super("Gist publishing is not configured yet.");
    this.name = "GistNotConfiguredError";
  }
}

export async function createGist(
  env: CoreEnv,
  filename: string,
  content: string,
  description: string,
): Promise<string> {
  const token = env.GITHUB_GIST_TOKEN;
  if (!token) throw new GistNotConfiguredError();

  const response = await fetch(GIST_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      // GitHub rejects API calls without a User-Agent with a bare 403.
      "User-Agent": "skill-finder-app",
    },
    body: JSON.stringify({
      description: description.slice(0, 200),
      public: true,
      files: { [filename]: { content } },
    }),
  });

  if (!response.ok) {
    // Keep upstream detail in the worker log only; callers get a generic message.
    const detail = (await response.text()).slice(0, 300);
    console.error(`Gist creation failed [${response.status}]: ${detail}`);
    throw new Error("Publishing this skill as a gist failed. Please try again later.");
  }

  const body = (await response.json()) as { html_url?: unknown };
  if (typeof body.html_url !== "string") throw new Error("GitHub returned no gist URL.");
  return body.html_url;
}
