/**
 * Client for the public skills registry that powers `npx skills find`
 * (https://skills.sh/api/search) plus a resolver that locates each skill's
 * SKILL.md inside its source GitHub repository.
 *
 * Every outbound request is bounded by a timeout and retried once, and the
 * results are mirrored into a durable cache so an unresponsive registry
 * degrades to "recent results" instead of an empty page.
 */
import { readRegistryCache, writeRegistryCache } from "./registry-cache";
import type { CoreContext } from "./request";
import type { RegistrySkill, SkillDocument } from "./types";

interface SearchResponse {
  skills?: Array<Partial<RegistrySkill>>;
}

const SEARCH_API = "https://skills.sh/api/search";
const SEARCH_LIMIT = 20;
const REQUEST_TIMEOUT_MS = 8000;
const SEARCH_CACHE_FRESH_MS = 6 * 60 * 60 * 1000;
const DOC_CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** The registry (or GitHub) could not be reached; the app should say so. */
export class RegistryUnavailableError extends Error {
  constructor(
    message = "The skills registry isn't responding right now — please try again in a minute.",
  ) {
    super(message);
    this.name = "RegistryUnavailableError";
  }
}

/**
 * Fetch with an explicit deadline and one retry, so a hanging upstream can
 * never leave a request (and its spinner) pending forever.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 && attempt === 0) {
        lastError = new Error(`Upstream returned ${res.status}.`);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      // A timeout means the upstream is hanging; retrying only doubles the wait.
      if (error instanceof Error && error.name === "AbortError") break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

/** True when a cached search result set has usable data. */
function isSkillArray(value: unknown): value is RegistrySkill[] {
  return Array.isArray(value);
}

function normalise(body: SearchResponse): RegistrySkill[] {
  if (!Array.isArray(body.skills)) return [];
  return body.skills.flatMap((raw) => {
    if (!raw?.id || !raw?.skillId || !raw?.source) return [];
    return [
      {
        id: raw.id,
        skillId: raw.skillId,
        name: raw.name ?? raw.skillId,
        installs: typeof raw.installs === "number" ? raw.installs : 0,
        source: raw.source,
      },
    ];
  });
}

export interface RegistrySearchResult {
  skills: RegistrySkill[];
  /** True when the data came from cache because the registry was unreachable. */
  stale: boolean;
}

/**
 * Reads: fresh cache -> live registry -> stale cache. Throws
 * `RegistryUnavailableError` only when there is nothing at all to show.
 */
export async function searchRegistryCached(
  ctx: CoreContext,
  query: string,
  limit = SEARCH_LIMIT,
): Promise<RegistrySearchResult> {
  const key = `search:${limit}:${query.trim().toLowerCase()}`;
  const cached = await readRegistryCache<RegistrySkill[]>(ctx, key, SEARCH_CACHE_FRESH_MS);
  if (cached && !cached.stale && isSkillArray(cached.payload) && cached.payload.length > 0) {
    return { skills: cached.payload, stale: false };
  }

  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const res = await fetchWithTimeout(`${SEARCH_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Skills registry search failed (${res.status}).`);
    const skills = normalise((await res.json()) as SearchResponse);
    if (skills.length > 0) await writeRegistryCache(ctx, key, skills);
    return { skills, stale: false };
  } catch (error) {
    if (cached && isSkillArray(cached.payload) && cached.payload.length > 0) {
      return { skills: cached.payload, stale: true };
    }
    throw new RegistryUnavailableError(
      error instanceof Error && error.message.startsWith("Skills registry search failed")
        ? error.message
        : undefined,
    );
  }
}

/** Convenience wrapper for callers that only need the skill list. */
export async function searchRegistry(
  ctx: CoreContext,
  query: string,
  limit = SEARCH_LIMIT,
): Promise<RegistrySkill[]> {
  return (await searchRegistryCached(ctx, query, limit)).skills;
}

interface RepoTreeEntry {
  path: string;
  type: string;
}

const treeCache = new Map<string, Promise<RepoTreeEntry[]>>();

async function getRepoTree(source: string): Promise<RepoTreeEntry[]> {
  const cached = treeCache.get(source);
  if (cached) return cached;

  const load = (async () => {
    for (const branch of ["main", "master"]) {
      const res = await fetchWithTimeout(
        `https://api.github.com/repos/${source}/git/trees/${branch}?recursive=1`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "skill-finder-app" } },
      ).catch(() => null);
      if (!res?.ok) continue;
      const body = (await res.json()) as { tree?: RepoTreeEntry[] };
      if (Array.isArray(body.tree)) return body.tree;
    }
    return [];
  })();

  treeCache.set(source, load);
  return load;
}

const docCache = new Map<string, SkillDocument | null>();

/** Candidate repo-relative locations for a skill's SKILL.md. */
function candidatePaths(skillId: string): string[] {
  const ids = new Set<string>([skillId]);
  const trimmed = skillId.split("-").slice(1).join("-");
  if (trimmed.length > 0) ids.add(trimmed);

  const dirs = ["skills/", "", ".claude/skills/", ".agents/skills/"];
  const paths: string[] = [];
  for (const dir of dirs) {
    for (const id of ids) paths.push(`${dir}${id}/SKILL.md`);
  }
  return paths;
}

const BRANCHES = ["main", "master"] as const;

async function fetchRaw(
  source: string,
  path: string,
  branch: string,
): Promise<SkillDocument["markdown"] | null> {
  const res = await fetchWithTimeout(
    `https://raw.githubusercontent.com/${source}/${branch}/${path}`,
    { headers: { "User-Agent": "skill-finder-app" } },
  );
  if (!res.ok) return null;
  return res.text();
}

interface Attempt {
  branch: string;
  path: string;
}

/** First successful attempt in list order, resolved in a single round trip. */
async function firstHit(source: string, attempts: readonly Attempt[]) {
  const settled = await Promise.all(
    attempts.map(async (attempt) => {
      const markdown = await fetchRaw(source, attempt.path, attempt.branch).catch(() => null);
      return markdown === null ? null : { ...attempt, markdown };
    }),
  );
  return settled.find((entry) => entry !== null) ?? null;
}

/**
 * Resolves and downloads the SKILL.md for a registry entry.
 *
 * Candidate raw URLs are probed concurrently (raw.githubusercontent.com has no
 * REST rate limit), so resolution costs one round trip instead of up to eight
 * sequential ones. When every convention misses, the repo tree — cached once
 * per repository — locates the file exactly. Successful resolutions are stored
 * durably, so a GitHub hiccup no longer silently drops skills from the library.
 */
export async function fetchSkillDocument(
  ctx: CoreContext,
  skill: RegistrySkill,
): Promise<SkillDocument | null> {
  if (docCache.has(skill.id)) return docCache.get(skill.id) ?? null;

  const cacheKey = `doc:${skill.id}`;
  const stored = await readRegistryCache<SkillDocument>(ctx, cacheKey, DOC_CACHE_FRESH_MS);
  if (stored && !stored.stale && stored.payload?.markdown) {
    docCache.set(skill.id, stored.payload);
    return stored.payload;
  }

  const build = (branch: string, path: string, markdown: string): SkillDocument => ({
    id: skill.id,
    markdown,
    htmlUrl: `https://github.com/${skill.source}/blob/${branch}/${path}`,
  });

  let result: SkillDocument | null = null;
  try {
    const attempts: Attempt[] = [];
    for (const branch of BRANCHES) {
      for (const path of candidatePaths(skill.skillId)) attempts.push({ branch, path });
    }

    const hit = await firstHit(skill.source, attempts);
    if (hit) {
      result = build(hit.branch, hit.path, hit.markdown);
    } else {
      const tree = await getRepoTree(skill.source);
      const suffix = `/${skill.skillId}/SKILL.md`;
      const match = tree.find((e) => e.type === "blob" && e.path.endsWith(suffix));
      if (match) {
        const treeHit = await firstHit(
          skill.source,
          BRANCHES.map((branch) => ({ branch, path: match.path })),
        );
        if (treeHit) result = build(treeHit.branch, treeHit.path, treeHit.markdown);
      }
    }
  } catch {
    result = null;
  }

  // A failed live resolve falls back to whatever was stored before, so upstream
  // trouble degrades to older markdown rather than a missing skill.
  if (!result && stored?.payload?.markdown) result = stored.payload;
  else if (result) await writeRegistryCache(ctx, cacheKey, result);

  docCache.set(skill.id, result);
  return result;
}

/** Extracts the `description` value from YAML frontmatter, when present. */
export function parseDescription(markdown: string): string | null {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return null;
  const line = fm[1].match(/^description:\s*(.+)$/m);
  if (!line?.[1]) return null;
  return line[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Extracts a short usage example: the first fenced code block, falling back to
 * the first prose paragraph of the document body.
 */
export function parseExample(markdown: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  const fence = body.match(/```[\w-]*\r?\n([\s\S]*?)```/);
  if (fence?.[1]) {
    const code = fence[1].trim();
    if (code.length > 0) return code.slice(0, 600);
  }

  const paragraph = body
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith("#") && !block.startsWith(">"));

  return paragraph ? paragraph.slice(0, 600) : "";
}
