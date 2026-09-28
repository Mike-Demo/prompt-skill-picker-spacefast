import { withErrors } from "../../_core/http";
import { initRequest, type RouteContext } from "../../_core/request";
import { AGENT_KEYS, isAgentKey } from "../../_core/agents";
import type { AgentKey, CatalogueQuery } from "../../_core/types";
import {
  checkApiLimit,
  checkEnvelopeLimit,
  dataResponse,
  envelopeError,
  errorResponse,
  jsonResponse,
  libraryPayload,
  optionsResponse,
} from "../../_core/public-api";
import { CatalogueUnavailableError, findSkill, queryCatalogue } from "../../_core/catalogue";

function numParam(params: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === "") return def;
  const value = Number(raw);
  if (!Number.isFinite(value)) return def;
  return Math.min(Math.max(Math.floor(value), min), max);
}

const CAPABILITIES = {
  name: "Skill Finder public API",
  version: "1",
  base: "https://skills.mikedemo.dev",
  auth: "none",
  rateLimit: { requestsPerMinute: 30, requestsPerDay: 500 },
  formats: ["json"],
  endpoints: [
    { method: "GET", path: "/api/public/v1/skills", description: "Search the skills catalogue." },
    { method: "GET", path: "/api/public/v1/skills/{id}", description: "Fetch one skill by id." },
    { method: "GET", path: "/api/public/v1/skills/agent/{agent}", description: "Skills curated for one agent." },
    { method: "GET", path: "/api/public/v1/capabilities", description: "This document." },
  ],
  agents: [...AGENT_KEYS],
  notes: [
    "Responses use the { data, meta } envelope.",
    "Errors use the { error: { code, message } } envelope.",
  ],
};

const GET_HANDLER = withErrors(async (request: Request, context: RouteContext): Promise<Response> => {
  const ctx = await initRequest(request, context);
  // SpaceFast's file router passes catch-all segments as params.splat
  // (a slash-joined string); accept an array too for forward compatibility.
  const splat = context.params["splat"] ?? context.params["rest"];
  const segments =
    typeof splat === "string"
      ? splat.split("/").filter((s) => s.length > 0)
      : Array.isArray(splat)
        ? splat
        : [];

  const isV1 = segments[0] === "v1";
  try {
    const limited = isV1 ? await checkEnvelopeLimit(ctx) : await checkApiLimit(ctx);
    if (limited) return limited;
  } catch {
    // Limit checks never throw; if they did, fail open and continue.
  }

  const params = new URL(request.url).searchParams;
  const q = params.get("q") ?? undefined;
  const source = params.get("source") ?? undefined;
  const limit = numParam(params, "limit", 20, 1, 100);
  const offset = numParam(params, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
  const minInstalls = numParam(params, "min_installs", 0, 0, Number.MAX_SAFE_INTEGER);

  // ---- Versioned (envelope) routes ----
  if (isV1) {
    if (segments.length === 2 && segments[1] === "skills") {
      const agentParam = params.get("agent");
      let agent: AgentKey | undefined;
      if (agentParam && !isAgentKey(agentParam)) {
        return envelopeError(400, "invalid_agent", `Unknown agent: ${agentParam}.`);
      }
      if (agentParam) agent = agentParam as AgentKey;
      const query: CatalogueQuery = { q, agent, source, minInstalls, limit, offset };
      let result;
      try {
        result = await queryCatalogue(ctx, query);
      } catch (error) {
        if (error instanceof CatalogueUnavailableError) {
          return envelopeError(503, "registry_unavailable", "The skills registry is unavailable.");
        }
        throw error;
      }
      return dataResponse(result, { stale: result.stale });
    }

    // /v1/skills/{id} — the id may itself contain slashes, so join all
    // remaining segments (e.g. "anthropics/skills/frontend-design").
    // (The /v1/skills/agent/{agent} route is handled below.)
    if (
      segments.length >= 3 &&
      segments[1] === "skills" &&
      !(segments.length === 4 && segments[2] === "agent")
    ) {
      const id = segments.slice(2).join("/");
      const found = await findSkill(ctx, id);
      if (!found) return envelopeError(404, "not_found", "Skill not found.");
      return dataResponse({ skill: found.skill, stale: found.stale });
    }

    if (segments.length === 4 && segments[1] === "skills" && segments[2] === "agent") {
      const agentParam = segments[3] as string;
      if (!isAgentKey(agentParam)) {
        return envelopeError(404, "not_found", `Unknown agent: ${agentParam}.`);
      }
      const query: CatalogueQuery = { q, agent: agentParam as AgentKey, source, minInstalls, limit, offset };
      let result;
      try {
        result = await queryCatalogue(ctx, query);
      } catch (error) {
        if (error instanceof CatalogueUnavailableError) {
          return envelopeError(503, "registry_unavailable", "The skills registry is unavailable.");
        }
        throw error;
      }
      return dataResponse(result, { stale: result.stale });
    }

    if (segments.length === 2 && segments[1] === "capabilities") {
      return dataResponse(CAPABILITIES);
    }

    return envelopeError(404, "not_found", "Not found.");
  }

  // ---- Legacy flat routes ----
  if (segments.length === 1 && segments[0] === "skills") {
    try {
      const { skills, stale } = await queryCatalogue(ctx, { q, limit, offset: 0 });
      return jsonResponse({ query: q ?? "", count: skills.length, stale, skills });
    } catch (error) {
      if (error instanceof CatalogueUnavailableError) {
        return errorResponse(503, "registry_unavailable", "The skills registry is unavailable.");
      }
      throw error;
    }
  }

  if (segments.length === 3 && segments[0] === "skills" && segments[1] === "agent") {
    const agentParam = segments[2] as string;
    if (!isAgentKey(agentParam)) {
      return errorResponse(404, "not_found", `Unknown agent: ${agentParam}.`);
    }
    try {
      const result = await queryCatalogue(ctx, { agent: agentParam as AgentKey, q, limit, offset: 0 });
      const payload = libraryPayload({ entries: [], unavailable: false, stale: result.stale }, result.skills);
      return jsonResponse({ query: q ?? "", agent: agentParam, ...payload });
    } catch (error) {
      if (error instanceof CatalogueUnavailableError) {
        return errorResponse(503, "registry_unavailable", "The skills registry is unavailable.");
      }
      throw error;
    }
  }

  return errorResponse(404, "not_found", "Not found.");
});

export const GET = GET_HANDLER;

export const OPTIONS = async (): Promise<Response> => optionsResponse();
