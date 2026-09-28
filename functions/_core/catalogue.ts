/**
 * The read path shared by the public REST API and the MCP tools: one
 * filter/sort/paging pipeline over the library snapshot so both surfaces
 * agree on what exists and in what order.
 */
import { listAgentSkillLibrary, listSkillLibrary } from "./library";
import { toPublicSkill } from "./public-api";
import type { CoreContext } from "./request";
import type { AgentKey, CatalogueQuery, CatalogueResult, PublicSkill } from "./types";
import { isAgentKey } from "./agents";

export class CatalogueUnavailableError extends Error {
  constructor() {
    super("The skills registry is unavailable.");
    this.name = "CatalogueUnavailableError";
  }
}

const MAX_LIMIT = 100;

const matchesTerms = (skill: PublicSkill, terms: readonly string[]): boolean => {
  if (terms.length === 0) return true;
  const haystack = `${skill.name} ${skill.description} ${skill.source}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

async function loadSkills(
  ctx: CoreContext,
  agent?: AgentKey,
): Promise<{ skills: PublicSkill[]; stale: boolean }> {
  const library = agent ? await listAgentSkillLibrary(ctx, agent) : await listSkillLibrary(ctx);
  if (library.unavailable) throw new CatalogueUnavailableError();
  return { skills: library.entries.map(toPublicSkill), stale: library.stale };
}

/** Single read path for the public API and the MCP tools. */
export async function queryCatalogue(
  ctx: CoreContext,
  query: CatalogueQuery,
): Promise<CatalogueResult> {
  const limit = Math.min(Math.max(query.limit, 1), MAX_LIMIT);
  const offset = Math.max(query.offset, 0);

  const { skills, stale } = await loadSkills(ctx, query.agent);
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const source = query.source?.toLowerCase();
  const minInstalls = query.minInstalls ?? 0;

  const filtered = skills
    .filter((skill) => matchesTerms(skill, terms))
    .filter((skill) => (source ? skill.source.toLowerCase().includes(source) : true))
    .filter((skill) => skill.installs >= minInstalls)
    .sort((a, b) => b.installs - a.installs || a.name.localeCompare(b.name));

  const page = filtered.slice(offset, offset + limit);
  const end = offset + page.length;

  return {
    skills: page,
    total: filtered.length,
    limit,
    offset,
    nextOffset: end < filtered.length ? end : null,
    stale,
  };
}

export async function findSkill(
  ctx: CoreContext,
  id: string,
): Promise<{ skill: PublicSkill; stale: boolean } | null> {
  const { skills, stale } = await loadSkills(ctx);
  const skill = skills.find((candidate) => candidate.id === id);
  return skill ? { skill, stale } : null;
}

export { isAgentKey };
export type { AgentKey };
