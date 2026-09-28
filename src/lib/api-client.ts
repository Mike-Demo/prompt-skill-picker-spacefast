/**
 * Typed fetch client for the Skill Finder Functions worker.
 *
 * API base: `import.meta.env.VITE_API_BASE ?? ""` with any trailing "/" stripped
 * (default: same-origin). All paths below are appended to it.
 *
 * Wire types are the single source of truth in functions/_core/types.ts and
 * are re-exported here so components keep importing from "@/lib/api-client".
 */
import type {
  SkillFile,
  SkillLibraryEntry,
  SkillLibraryResponse,
  SkillSuggestion,
} from "../../functions/_core/types";

export type { SkillFile, SkillLibraryEntry, SkillLibraryResponse, SkillSuggestion };

/** Strip the trailing "/" so `${API_BASE}/api/...` never double-slashes. */
const API_BASE = (import.meta.env["VITE_API_BASE"] ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter: number | null;

  constructor(message: string, status: number, code: string, retryAfter: number | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

interface ErrorEnvelope {
  error?: string;
  code?: string;
  retryAfter?: number;
}

async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (cause) {
    // Offline, DNS failure, CORS block, worker down — never let a TypeError
    // leak out where callers expect an ApiError.
    throw new ApiError(
      cause instanceof Error ? cause.message : "Network request failed",
      0,
      "network_error",
      null,
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const envelope = (body ?? {}) as ErrorEnvelope;
    const retryAfterHeader = response.headers.get("retry-after");
    const headerSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
    throw new ApiError(
      envelope.error ?? "Request failed",
      response.status,
      envelope.code ?? "request_failed",
      typeof envelope.retryAfter === "number"
        ? envelope.retryAfter
        : Number.isFinite(headerSeconds)
          ? headerSeconds
          : null,
    );
  }

  return body;
}

function post<T>(path: string, data: unknown): Promise<T> {
  return apiFetch(path, { method: "POST", body: JSON.stringify(data) }) as Promise<T>;
}

export async function searchSkills(input: {
  prompt: string;
  captchaToken: string;
  openaiKey?: string;
  queries?: string[];
}): Promise<{ results: SkillSuggestion[]; token: string | null }> {
  return post("/api/search", input);
}

export async function enhancePrompt(input: {
  prompt: string;
  captchaToken: string;
  openaiKey: string;
}): Promise<{ enhanced: string }> {
  return post("/api/enhance", input);
}

export async function getCaptchaSitekey(): Promise<string> {
  const { sitekey } = (await apiFetch("/api/captcha-sitekey")) as { sitekey: string };
  return sitekey;
}

export async function fetchSkillFiles(ids: string[]): Promise<SkillFile[]> {
  const { files } = await post<{ files: SkillFile[] }>("/api/skill-files", { ids });
  return files;
}

export async function createSkillGist(id: string): Promise<{ url: string }> {
  return post("/api/gist", { id });
}

export async function getSavedSearch(
  token: string,
): Promise<{ prompt: string; results: SkillSuggestion[]; expiresAt: string } | null> {
  try {
    return (await apiFetch(`/api/saved/${encodeURIComponent(token)}`)) as {
      prompt: string;
      results: SkillSuggestion[];
      expiresAt: string;
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function listSkills(): Promise<SkillLibraryResponse> {
  return (await apiFetch("/api/library")) as SkillLibraryResponse;
}

export async function listAgentSkills(agent: string): Promise<SkillLibraryResponse> {
  return (await apiFetch(`/api/agents/${encodeURIComponent(agent)}`)) as SkillLibraryResponse;
}
