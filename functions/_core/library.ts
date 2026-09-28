/**
 * Skill library: the full registry filtered by curated topic keywords, plus
 * per-agent slices. Each entry's description and example come from the skill's
 * own SKILL.md frontmatter and first code block.
 */
import { mapWithConcurrency } from "./concurrency";
import type { CoreContext } from "./request";
import {
  fetchSkillDocument,
  parseDescription,
  parseExample,
  RegistryUnavailableError,
  searchRegistryCached,
} from "./registry";
import type { SkillLibraryEntry, SkillLibraryResponse, AgentKey } from "./types";
import { AGENT_KEYS } from "./agents";

/** Topic keywords used to pull the library slice out of the full registry. */
const TOPICS: readonly string[] = [
  "code review",
  "refactoring",
  "debugging",
  "testing",
  "documentation",
  "writing",
  "email",
  "research",
  "data analysis",
  "design",
  "seo",
  "marketing",
  "productivity",
  "git",
  "deployment",
  "security",
  "wordpress",
];

/** Extra queries that bias each agent's page toward its domain. */
const AGENT_TOPICS: Record<AgentKey, readonly string[]> = {
  "microsoft-copilot": ["productivity", "email", "writing"],
  "superhuman-go": ["email", "writing", "productivity"],
  chatgpt: ["writing", "research", "productivity"],
  grok: ["research", "data analysis", "writing"],
  perplexity: ["research", "writing", "seo"],
  claude: ["code review", "refactoring", "debugging"],
  "github-copilot": ["code review", "testing", "git"],
  cursor: ["refactoring", "debugging", "testing"],
  wordpress: ["wordpress", "seo", "writing"],
};

const MAX_ENTRIES = 60;
const LIBRARY_CACHE_FRESH_MS = 6 * 60 * 60 * 1000;

async function loadLibrary(ctx: CoreContext, queries: readonly string[]) {
  const results = await Promise.all(
    queries.map(async (query) => {
      try {
        return await searchRegistryCached(ctx, query);
      } catch {
        return null;
      }
    }),
  );

  const seen = new Set<string>();
  const merged: {
    id: string;
    skillId: string;
    name: string;
    installs: number;
    source: string;
  }[] = [];
  let stale = false;
  let ok = false;

  for (const result of results) {
    if (!result) continue;
    ok = true;
    if (result.stale) stale = true;
    for (const skill of result.skills) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      merged.push(skill);
    }
  }

  if (!ok) throw new RegistryUnavailableError();
  return { merged, stale };
}

async function buildEntries(
  ctx: CoreContext,
  merged: { id: string; skillId: string; name: string; installs: number; source: string }[],
  limit: number,
): Promise<{ entries: SkillLibraryEntry[]; stale: boolean }> {
  const top = [...merged].sort((a, b) => b.installs - a.installs).slice(0, limit);
  const entries = await mapWithConcurrency(top, 6, async (skill) => {
    const entry: SkillLibraryEntry = {
      id: skill.id,
      skillId: skill.skillId,
      name: skill.name,
      source: skill.source,
      installs: skill.installs,
      description: `${skill.name} from ${skill.source}.`,
      example: "",
      htmlUrl: null,
      hasMarkdown: false,
    };

    const doc = await fetchSkillDocument(ctx, skill);
    if (doc) {
      entry.hasMarkdown = true;
      entry.htmlUrl = doc.htmlUrl;
      entry.description = parseDescription(doc.markdown) ?? entry.description;
      entry.example = parseExample(doc.markdown);
    }

    return entry;
  });
  return { entries, stale: false };
}

export async function listSkillLibrary(ctx: CoreContext): Promise<SkillLibraryResponse> {
  try {
    const { merged, stale } = await loadLibrary(ctx, TOPICS);
    const { entries } = await buildEntries(ctx, merged, MAX_ENTRIES);
    return { entries, unavailable: false, stale };
  } catch (error) {
    if (error instanceof RegistryUnavailableError) {
      return { entries: [], unavailable: true, stale: false };
    }
    throw error;
  }
}

export async function listAgentSkillLibrary(
  ctx: CoreContext,
  agent: AgentKey,
): Promise<SkillLibraryResponse> {
  if (!AGENT_KEYS.includes(agent)) throw new Error(`Unknown agent: ${agent}.`);
  try {
    const topics = [...(AGENT_TOPICS[agent] ?? []), ...TOPICS.slice(0, 6)];
    const { merged, stale } = await loadLibrary(ctx, topics);
    const { entries } = await buildEntries(ctx, merged, 30);
    return { entries, unavailable: false, stale };
  } catch (error) {
    if (error instanceof RegistryUnavailableError) {
      return { entries: [], unavailable: true, stale: false };
    }
    throw error;
  }
}

export { LIBRARY_CACHE_FRESH_MS };
