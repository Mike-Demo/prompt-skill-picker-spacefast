/**
 * Shared wire types for the Skill Finder SpaceFast worker.
 * Runtime-neutral: no Node, TanStack, Supabase or Cloudflare imports.
 * The frontend imports these as `import type` only.
 */

export interface SkillSuggestion {
  id: string;
  name: string;
  source: string;
  installs: number;
  description: string;
  reason: string;
  htmlUrl: string | null;
  hasMarkdown: boolean;
}

export interface SkillFile {
  filename: string;
  content: string;
}

export interface SkillLibraryEntry {
  id: string;
  /** Registry slug, used to build the `npx skills use` install command. */
  skillId: string;
  name: string;
  source: string;
  installs: number;
  description: string;
  example: string;
  htmlUrl: string | null;
  hasMarkdown: boolean;
}

export interface SkillLibraryResponse {
  entries: SkillLibraryEntry[];
  /** The registry could not be reached and there was nothing cached to show. */
  unavailable: boolean;
  /** Some results came from the cache because the registry was unreachable. */
  stale: boolean;
}

export interface SearchResponse {
  results: SkillSuggestion[];
  /** Share token for the stored search, or null when persisting failed. */
  token: string | null;
}

export interface SavedSearchResponse {
  prompt: string;
  results: SkillSuggestion[];
  expiresAt: string;
}

export interface RegistrySkill {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

export interface SkillDocument {
  id: string;
  markdown: string;
  htmlUrl: string;
}

export interface CacheEntry<T> {
  payload: T;
  fetchedAt: number;
  /** True when the entry is older than the caller's freshness window. */
  stale: boolean;
}

export interface PublicSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  installs: number;
  installCommand: string;
  url: string | null;
}

export interface CatalogueQuery {
  q?: string | undefined;
  agent?: AgentKey | undefined;
  source?: string | undefined;
  minInstalls?: number | undefined;
  limit: number;
  offset: number;
}

export interface CatalogueResult {
  skills: PublicSkill[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  stale: boolean;
}

export type AgentKey =
  | "microsoft-copilot"
  | "superhuman-go"
  | "chatgpt"
  | "grok"
  | "perplexity"
  | "claude"
  | "github-copilot"
  | "cursor"
  | "wordpress";
