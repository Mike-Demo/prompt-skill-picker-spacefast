/**
 * MCP (Model Context Protocol) handler for the SpaceFast worker.
 *
 * The original app used @lovable.dev/mcp-js with TanStack's createServerFileRoute.
 * The worker serves the same three read-only tools over the Streamable HTTP
 * transport directly: JSON-RPC 2.0 requests on POST /mcp, answered with a
 * single JSON response (stateless mode, no session id). Tool names, input
 * schemas, and catalogue semantics match the original exactly.
 *
 * Supported methods: initialize, notifications/initialized,
 * tools/list, tools/call. Everything else returns a JSON-RPC error.
 */
import { AGENT_PAGE_LIST, isAgentKey } from "./agents";
import { findSkill, queryCatalogue, CatalogueUnavailableError } from "./catalogue";
import type { CoreContext } from "./request";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "search_skills",
    title: "Search skills",
    description:
      "Search the skills registry catalogue. Use this to find skills for an agent (e.g. Claude, ChatGPT, Cursor) by keyword or topic.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for in skill names and descriptions." },
        agent: {
          type: "string",
          description: "Filter to skills relevant for one agent.",
          enum: [
            "microsoft-copilot",
            "superhuman-go",
            "chatgpt",
            "grok",
            "perplexity",
            "claude",
            "github-copilot",
            "cursor",
            "wordpress",
          ],
        },
        minInstalls: { type: "number", description: "Minimum install count." },
        limit: { type: "number", description: "Maximum results to return (1-25).", default: 10 },
        offset: { type: "number", description: "Pagination offset.", default: 0 },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_skill",
    title: "Get skill",
    description: "Look up one skill by its catalogue id and return its details and install command.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Catalogue id from search_skills." },
      },
      required: ["id"],
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_agents",
    title: "List supported agents",
    description: "List the agents that have a curated skill collection, with their keys and pages.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

function ok(id: string | number | null | undefined, result: unknown): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, result },
    { headers: { "Content-Type": "application/json" } },
  );
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): Response {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: code === -32700 ? 400 : 200, headers: { "Content-Type": "application/json" } },
  );
}

function toolError(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

async function callTool(ctx: CoreContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search_skills": {
      const rawLimit = args["limit"];
      const rawOffset = args["offset"];
      const rawMinInstalls = args["minInstalls"];
      const agent = typeof args["agent"] === "string" ? args["agent"] : undefined;
      try {
        const result = await queryCatalogue(ctx, {
          q: typeof args["query"] === "string" ? args["query"] : undefined,
          agent: agent !== undefined ? (isAgentKey(agent) ? agent : undefined) : undefined,
          minInstalls: typeof rawMinInstalls === "number" ? rawMinInstalls : undefined,
          limit: typeof rawLimit === "number" ? Math.min(Math.max(Math.floor(rawLimit), 1), 25) : 10,
          offset: typeof rawOffset === "number" ? Math.max(Math.floor(rawOffset), 0) : 0,
        });
        const lines = result.skills.map(
          (skill) =>
            `- ${skill.id}: ${skill.name} (${skill.installs} installs)\n  ${skill.description}\n  Install: ${skill.installCommand}`,
        );
        return {
          content: [
            {
              type: "text",
              text:
                lines.length > 0
                  ? `${result.total} matching skill(s):\n${lines.join("\n")}`
                  : "No skills matched that query.",
            },
          ],
          structuredContent: { ...result },
        };
      } catch (error) {
        if (error instanceof CatalogueUnavailableError) {
          return toolError("The skills registry is unavailable right now; try again in a minute.");
        }
        throw error;
      }
    }

    case "get_skill": {
      const id = typeof args["id"] === "string" ? args["id"].trim() : "";
      if (!id) return toolError("A skill id is required.");
      try {
        const found = await findSkill(ctx, id);
        if (!found) return toolError(`No skill with id "${id}" is in the catalogue.`);
        const { skill } = found;
        return {
          content: [
            {
              type: "text",
              text: [
                `${skill.name} (${skill.source})`,
                skill.description,
                `Installs: ${skill.installs}`,
                `Install: ${skill.installCommand}`,
                skill.url ? `Source: ${skill.url}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          structuredContent: { skill },
        };
      } catch (error) {
        if (error instanceof CatalogueUnavailableError) {
          return toolError("The skills registry is unavailable right now; try again in a minute.");
        }
        throw error;
      }
    }

    case "list_agents": {
      const agents = AGENT_PAGE_LIST.map((page) => ({
        key: page.key,
        label: page.label,
        page: `https://skills.mikedemo.dev${page.path}`,
      }));
      return {
        content: [
          {
            type: "text",
            text: agents.map((agent) => `${agent.key}: ${agent.label} — ${agent.page}`).join("\n"),
          },
        ],
        structuredContent: { agents },
      };
    }

    default:
      return toolError(`Unknown tool: ${name}.`);
  }
}

/**
 * Handles one JSON-RPC message (or a batch) for POST /mcp.
 */
export async function handleMcpRequest(request: Request, ctx: CoreContext): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON in request body.");
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses: Response[] = [];

  for (const message of messages) {
    const msg = message as JsonRpcRequest;
    if (typeof msg !== "object" || msg === null || msg.jsonrpc !== "2.0") {
      responses.push(rpcError(null, -32600, "Invalid JSON-RPC 2.0 request."));
      continue;
    }
    const { id, method, params } = msg;

    // Notifications (no id) get a 202 with no body per the transport spec.
    if (method === "notifications/initialized") continue;

    if (method === "initialize") {
      responses.push(
        ok(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "skill-finder-plus", version: "1.0.0" },
        }),
      );
      continue;
    }

    if (method === "tools/list") {
      responses.push(ok(id, { tools: TOOLS }));
      continue;
    }

    if (method === "tools/call") {
      const name = typeof params?.["name"] === "string" ? params["name"] : "";
      const args =
        params?.["arguments"] && typeof params["arguments"] === "object"
          ? (params["arguments"] as Record<string, unknown>)
          : {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        responses.push(rpcError(id, -32602, `Unknown tool: ${name}.`));
        continue;
      }
      try {
        const result = await callTool(ctx, name, args);
        responses.push(ok(id, result));
      } catch (error) {
        responses.push(rpcError(id, -32603, "The tool call failed."));
        console.error("MCP tool error:", error);
      }
      continue;
    }

    responses.push(rpcError(id, -32601, `Method not found: ${method ?? "(missing)"}.`));
  }

  // Pure-notification batches acknowledge with 202 and no body.
  if (responses.length === 0) return new Response(null, { status: 202 });

  if (Array.isArray(body)) {
    const payloads = await Promise.all(responses.map((r) => r.json()));
    return Response.json(payloads, { headers: { "Content-Type": "application/json" } });
  }
  return responses[0] as Response;
}
