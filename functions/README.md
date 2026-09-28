# functions/

SpaceFast **functions file router** for the Skill Finder backend. Each file maps to a
route; named method exports (`GET`, `POST`, `OPTIONS`, `DELETE`) are the handlers.
`context = { params, env, ctx }` — `context.params` holds dynamic segments
(`params.token`, `params.agent`, `params.rest`), `context.env` holds `DB` and secrets.

Shared logic lives in `functions/_core/` (files starting with `_` are never
routed). Every private-app route starts with
`const ctx = await initRequest(request, context)` (validates `env.DB`, ensures the
schema) and wraps the handler in `withErrors` for central error mapping.

## Route table

| File | Route | Purpose |
|---|---|---|
| `api/search.ts` | POST `/api/search` | Rank skills for a prompt (rate limited, saves share token) |
| `api/enhance.ts` | POST `/api/enhance` | Rewrite a rough prompt via the caller's OpenAI key |
| `api/skill-files.ts` | POST `/api/skill-files` | Download SKILL.md files for up to 50 surfaced skill ids |
| `api/gist.ts` | POST `/api/gist` | Publish a skill's SKILL.md as a public GitHub gist |
| `api/library.ts` | GET `/api/library` | Curated skill library snapshot |
| `api/saved/[token].ts` | GET `/api/saved/:token` | Replay a saved search from a share link |
| `api/agents/[agent].ts` | GET `/api/agents/:agent` | Skill library curated for one agent key |
| `api/cron/cleanup.ts` | GET/POST `/api/cron/cleanup` | Delete expired rows (called hourly by the SpaceFast scheduler) |
| `api/public/[...rest].ts` | GET `/api/public/*` | Public read-only API: `v1` envelope routes + legacy flat `/skills` routes; OPTIONS for CORS preflight |
| `mcp.ts` | GET/POST/DELETE `/mcp` | MCP server (read-only tools); non-POST handled by `_core/mcp` |

## Env vars / secrets

| Name | Used for |
|---|---|
| `DB` (binding) | D1-shaped database — required by every route (`initRequest` fails closed) |
| `GITHUB_GIST_TOKEN` | Publishing gists (`/api/gist` → 503 `gist_not_configured` without it) |
| `RATE_LIMIT_SALT` | Salts rate-limit bucket keys |

The app never logs or persists caller-supplied `openaiKey` values.

## DB tables (created by `ensureSchema` in `_core/db.ts`)

- `saved_searches` — shareable search results with `token`, `prompt`, `results`, `created_at`, `expires_at`
- `registry_cache` — cached skills-registry responses
- `rate_limit_hits` — rate-limit buckets per action

## Deployment notes

`sf publish` auto-detects `functions/`; `sf.jsonc` sets
`runtime: { kind: "functions", database: true, fetch: true }` so routes get the D1
binding and outbound HTTP (registry, GitHub, OpenAI). The
`crons` entry in `sf.jsonc` schedules `/api/cron/cleanup` hourly.

Do not import from `src/` or add npm dependencies in `functions/` — the worker
bundle stays dependency-free.
