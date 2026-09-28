import { createFileRoute, Link } from "@tanstack/react-router";

import { WaIcon } from "@/design-system/font-awsome-web-awesome-171158";

const TITLE = "Agent API — read-only JSON access to Skill Finder";
const DESCRIPTION =
  "Free, read-only JSON API for AI agents to search the Skill Finder catalogue and list curated skills per agent. No key or captcha required.";
const CANONICAL = "https://skills.mikedemo.dev/docs/api";

export const Route = createFileRoute("/docs/api")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: ApiDocsPage,
});

interface Endpoint {
  path: string;
  summary: string;
  params: readonly string[];
  example: string;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    path: "GET /api/public/v1/skills",
    summary: "Keyword search over the catalogue, most-installed first.",
    params: [
      "q: keywords, up to 100 characters (optional)",
      "agent: restrict to one agent's curated list (optional)",
      "source: match part of the GitHub owner/repo (optional)",
      "minInstalls: minimum install count (optional)",
      "limit: 1 to 50, default 20",
      "offset: 0 to 5000, default 0",
    ],
    example: "/api/public/v1/skills?q=react&limit=5",
  },
  {
    path: "GET /api/public/v1/skills/{id}",
    summary: "One skill by its catalogue id, with its install command.",
    params: ["id: the id returned by a search"],
    example: "/api/public/v1/skills",
  },
  {
    path: "GET /api/public/v1/skills/agent/{agent}",
    summary: "The curated list shown on one agent page, paged.",
    params: [
      "agent: microsoft-copilot, superhuman-go, chatgpt, grok, perplexity, claude, github-copilot, cursor, wordpress",
      "limit: 1 to 50, default 20",
      "offset: 0 to 5000, default 0",
    ],
    example: "/api/public/v1/skills/agent/claude",
  },
  {
    path: "GET /api/public/v1/capabilities",
    summary: "What this API supports, its limits, and where the other documents live.",
    params: [],
    example: "/api/public/v1/capabilities",
  },
  {
    path: "GET /api/public/skills",
    summary: "Earlier flat-payload search, kept working for existing callers.",
    params: ["q: keywords, up to 100 characters (optional)", "limit: 1 to 50, default 20"],
    example: "/api/public/skills?q=react&limit=5",
  },
];

const MCP_TOOLS = [
  "search_skills — keyword search with agent, source and install filters",
  "get_skill — one skill's details and install command",
  "list_agents — the agents that have a curated collection",
] as const;

const RESOURCES = [
  { href: "/openapi.json", label: "OpenAPI spec" },
  { href: "/llms.txt", label: "llms.txt" },
  { href: "/.well-known/agent.json", label: "Agent card" },
  { href: "/api/public/v1/capabilities", label: "Capabilities" },
] as const;

function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <WaIcon name="arrow-left" aria-hidden="true" />
          Back to search
        </Link>

        <header className="mt-6 space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Agent API
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            A free, read-only JSON API so AI agents can use the skill catalogue directly. No
            key needed. Each visitor can make 30 requests a minute and 500 a day;
            over that you get a 429 with a Retry-After header.
          </p>
        </header>

        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
          {ENDPOINTS.map((endpoint) => (
            <article key={endpoint.path} className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-mono text-sm font-semibold text-foreground">{endpoint.path}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{endpoint.summary}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {endpoint.params.map((param) => (
                  <li key={param}>{param}</li>
                ))}
              </ul>
              <a
                href={endpoint.example}
                className="mt-3 inline-block font-mono text-xs text-primary hover:underline"
              >
                {endpoint.example}
              </a>
            </article>
          ))}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Response shape</h2>
          <p className="text-sm text-muted-foreground">
            Version 1 endpoints answer with {"{"} data, meta {"}"} and, when something goes wrong,{" "}
            {"{"} error: {"{"} code, message {"}"} {"}"}. Paging details live in meta: count, total,
            limit, offset and nextOffset. Each skill includes id, name, description, source (GitHub
            owner/repo), installs, installCommand and url.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Agent connection (MCP)</h2>
          <p className="text-sm text-muted-foreground">
            Compatible assistants can connect to{" "}
            <span className="font-mono">https://skills.mikedemo.dev/mcp</span> over Streamable HTTP.
            No sign-in, read-only, same per-visitor limits.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {MCP_TOOLS.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Machine-readable resources</h2>
          <ul className="flex flex-wrap gap-4 text-sm">
            {RESOURCES.map((resource) => (
              <li key={resource.href}>
                <a href={resource.href} className="font-medium text-primary hover:underline">
                  {resource.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
