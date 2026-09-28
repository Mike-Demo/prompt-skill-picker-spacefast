/**
 * Search ranking: registry search + AI query expansion + AI ranking, with an
 * install-count fallback when AI returns nothing usable.
 */
import { InvalidOpenAiKeyError, type AiProvider } from "./ai-provider";
import { isSkillIdAllowed, isWellFormedSkillId } from "./allowlist";
import { mapWithConcurrency } from "./concurrency";
import type { CoreContext } from "./request";
import { isSkillIdInSavedSearch } from "./saved-search";
import {
  fetchSkillDocument,
  parseDescription,
  RegistryUnavailableError,
  searchRegistry,
  type RegistrySearchResult,
} from "./registry";
import type { SkillFile, SkillSuggestion } from "./types";

export { RegistryUnavailableError };

const MAX_RESULTS = 8;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_REASON_LENGTH = 140;
const MIN_ID_LENGTH = 3;
const MAX_ID_LENGTH = 200;

const QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const queryCache = new Map<string, { results: SkillSuggestion[]; at: number }>();


function clampText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function fallbackDescription(skill: { name: string; source: string }): string {
  return `${skill.name} from ${skill.source}.`;
}

interface RawMatch {
  id: string;
  name: string;
  installs: number;
  source: string;
  htmlUrl: string | null;
  hasMarkdown: boolean;
  description: string;
  relevance: number;
}

async function gatherCandidates(
  queries: readonly string[],
  ctx: CoreContext,
): Promise<{ matches: RawMatch[]; registryUnavailable: boolean }> {
  const results = await Promise.all(
    queries.map(async (query): Promise<RegistrySearchResult | null> => {
      try {
        return { skills: await searchRegistry(ctx, query), stale: false };
      } catch {
        return null;
      }
    }),
  );

  const seen = new Set<string>();
  const matches: RawMatch[] = [];
  let registryUnavailable = false;
  let successCount = 0;

  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (!result) continue;
    successCount += 1;
    const weight = Math.max(0, queries.length - i);
    for (const skill of result.skills) {
      if (seen.has(skill.id)) continue;
      seen.add(skill.id);
      matches.push({
        id: skill.id,
        name: skill.name,
        installs: skill.installs,
        source: skill.source,
        htmlUrl: null,
        hasMarkdown: false,
        description: fallbackDescription(skill),
        relevance: weight,
      });
    }
  }

  if (successCount === 0 && queries.length > 0) registryUnavailable = true;
  return { matches, registryUnavailable };
}

async function enrichWithMarkdown(matches: RawMatch[], ctx: CoreContext): Promise<void> {
  await mapWithConcurrency(matches, 6, async (match) => {
    try {
      const doc = await fetchSkillDocument(ctx, {
        id: match.id,
        skillId: match.id.split("/").slice(-1)[0] ?? match.id,
        name: match.name,
        installs: match.installs,
        source: match.source,
      });
      if (!doc) return;
      match.hasMarkdown = true;
      match.htmlUrl = doc.htmlUrl;
      const description = parseDescription(doc.markdown);
      if (description) match.description = clampText(description, MAX_DESCRIPTION_LENGTH);
    } catch {
      // Keep the registry description when document resolution fails.
    }
  });
}

async function buildSuggestions(
  matches: RawMatch[],
  prompt: string,
  ranked: readonly { id: string; score: number; reason: string }[],
): Promise<SkillSuggestion[]> {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const seen = new Set<string>();
  const suggestions: SkillSuggestion[] = [];

  const push = (id: string, reason: string) => {
    const match = byId.get(id);
    if (!match || seen.has(id)) return;
    seen.add(id);
    suggestions.push({
      id: match.id,
      name: match.name,
      source: match.source,
      installs: match.installs,
      description: match.description,
      reason: clampText(reason || `Matched your request for "${prompt}".`, MAX_REASON_LENGTH),
      htmlUrl: match.htmlUrl,
      hasMarkdown: match.hasMarkdown,
    });
  };

  for (const entry of ranked.slice(0, MAX_RESULTS)) push(entry.id, entry.reason);
  if (suggestions.length === 0) {
    const fallback = [...matches].sort(
      (a, b) => b.installs - a.installs || b.relevance - a.relevance,
    );
    for (const match of fallback.slice(0, MAX_RESULTS)) push(match.id, "");
  }
  return suggestions.slice(0, MAX_RESULTS);
}

/**
 * Runs the full search: AI query expansion (or caller-provided queries in
 * local-model mode), registry search, document enrichment, AI ranking, and an
 * install-count fallback. Results are cached briefly to dedupe double submits.
 */
export async function rankSkills(
  prompt: string,
  ai: AiProvider,
  ctx: CoreContext,
  providedQueries?: readonly string[],
): Promise<SkillSuggestion[]> {
  const key = prompt.trim().toLowerCase();
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.at < QUERY_CACHE_TTL_MS) return cached.results;

  let queries: readonly string[];
  if (providedQueries && providedQueries.length > 0) {
    queries = providedQueries;
  } else {
    try {
      queries = await ai.expandQueries(prompt);
    } catch (error) {
      if (error instanceof InvalidOpenAiKeyError) throw error;
      queries = [prompt];
    }
  }

  const { matches, registryUnavailable } = await gatherCandidates(queries, ctx);
  if (registryUnavailable) throw new RegistryUnavailableError();

  await enrichWithMarkdown(matches, ctx);

  const catalog = matches
    .slice(0, 60)
    .map((m) => `- ${m.id} (${m.installs} installs): ${m.description}`)
    .join("\n");

  let ranked: { id: string; score: number; reason: string }[] = [];
  if (matches.length > 0) {
    try {
      ranked = await ai.rank(prompt, catalog, MAX_RESULTS);
    } catch (error) {
      if (error instanceof InvalidOpenAiKeyError) throw error;
      ranked = [];
    }
  }

  const results = await buildSuggestions(matches, prompt, ranked);
  if (queryCache.size > 200) queryCache.clear();
  queryCache.set(key, { results, at: Date.now() });
  return results;
}

/**
 * Rewrites a rough draft prompt into a sharper search brief.
 * Always AI-backed; the frontend skips this endpoint in no-AI mode.
 */
export async function enhancePrompt(prompt: string, ai: AiProvider): Promise<string> {
  const enhanced = await ai.enhance(prompt);
  const trimmed = enhanced.trim().slice(0, 2000);
  return trimmed.length >= 3 ? trimmed : prompt;
}

async function skillFile(id: string, ctx: CoreContext): Promise<SkillFile | null> {
  if (!isWellFormedSkillId(id) || id.length < MIN_ID_LENGTH || id.length > MAX_ID_LENGTH) {
    return null;
  }
  const allowed = isSkillIdAllowed(id) || (await isSkillIdInSavedSearch(ctx, id));
  if (!allowed) return null;

  const [owner, repo, skillId] = id.split("/");
  if (!owner || !repo || !skillId) return null;
  const doc = await fetchSkillDocument(ctx, {
    id,
    skillId,
    name: skillId,
    installs: 0,
    source: `${owner}/${repo}`,
  });
  if (!doc?.markdown) return null;
  return { filename: `${skillId}.SKILL.md`, content: doc.markdown };
}

/**
 * Collects SKILL.md files for the given ids, in order, skipping ids the app
 * never surfaced or whose markdown cannot be resolved.
 */
export async function collectSkillFiles(
  ids: readonly string[],
  ctx: CoreContext,
): Promise<SkillFile[]> {
  const files = await mapWithConcurrency(ids, 6, (id) => skillFile(id, ctx));
  return files.filter((file): file is SkillFile => file !== null);
}
