# Security audit triage backlog

Parent issue: [#1 — Security audit 2026-10-21](https://github.com/Mike-Demo/prompt-skill-picker-spacefast/issues/1)

## Priority

1. **Low — Public MCP tools serve the catalogue without per-caller rate limiting.** This is the only confirmed finding. It is reachable by unauthenticated MCP clients and bypasses the quota applied to REST callers. The fix is narrowly scoped to the MCP handlers or route wrapper and can reuse existing rate-limit behavior. No confirmed findings share a root cause, so no findings are grouped.

## Remediation issue

### Title

`[security][low] Rate-limit public MCP catalogue tools`

### Body

Parent: #1

**Finding:** Public MCP tools serve the catalogue with no per-caller rate limit, unlike every REST twin. Fingerprint: `mcp-tools-no-rate-limit`.

**Evidence:** Every REST surface serving the catalogue enforces the API quota (30 per minute, 500 per day) via `enforceRateLimit`, and the capabilities route advertises that quota. The unauthenticated MCP tools `search_skills` and `get_skill` call the catalogue directly with no `enforceRateLimit`, `checkApiLimit`, or `getClientIp` reference anywhere under `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/lib/mcp` or `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/routes/mcp.ts`. An unauthenticated MCP client can therefore invoke the catalogue without limit, bypassing the per-visitor quota enforced for identical data.

**Root cause:** The MCP tool handlers and the `/mcp` route wrapper omit rate-limit enforcement and call `queryCatalogue` and `findSkill` directly without first calling `enforceRateLimit(getClientIp(), 'api')`.

**Smallest fix:** Enforce the same API quota on the MCP surface by calling `enforceRateLimit(getClientIp(), 'api')` at the start of the `search_skills` and `get_skill` handlers, or in a wrapper around the `/mcp` route handler. Translate `RateLimitError` into a `ToolError`, matching `checkApiLimit` behavior on the REST routes.

## Needs-validation checklist issue

### Title

`[security][needs-validation] Audit leads to validate`

### Body

Parent: #1

Validate each lead below. These are not confirmed findings; do not assign severity until the stated missing fact is established.

- [ ] **Registry-controlled source/skillId in install commands** (`install-command-shell-injection-from-registry-fields`). Claimed root cause: `normalise()` in `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/lib/skills-registry.server.ts` accepts any truthy `source` and `skillId` from the skills.sh response with no charset or pattern check, and `toPublicSkill` in `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/lib/public-api.server.ts` interpolates both fields inside double quotes when building `installCommand`, even though a strict `ID_PATTERN` exists in-repo for the download path. **Exact missing fact supplied in the parent issue:** “Whether the skills.sh registry validates or normalises the skillId field it returns (charset, derivation from directory name vs frontmatter name) tightly enough that shell metacharacters (double quote, dollar, backtick, semicolon, whitespace) can never reach the installCommand string built in src/lib/public-api.server.ts. This upstream guarantee i…”
- [ ] **Publisher-controlled descriptions in ranking prompts** (`ranking-llm-indirect-injection-via-skill-description`). Claimed root cause: Publisher-controlled description text is interpolated verbatim into the ranking LLM prompt in `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/lib/skills-ranking.server.ts` with no delimiting, escaping, length cap, or provenance label treating it as untrusted data rather than instructions. **Exact missing fact supplied in the parent issue:** “Whether the deployed ranking model (Lovable AI Gateway model configured in src/lib/ai-gateway.server.ts) follows instruction-like text embedded in a catalogue description so as to materially inflate that skill's score or dictate its user-facing reason. This can only be resolved by a bounded local or owner-run harness with a dummy injected descript…”
- [ ] **Forwarded-header spoofing of rate-limit identity** (`rate-limit-client-ip-header-spoofing`). Claimed root cause: `getClientIp()` in `/home/runner/work/prompt-skill-picker-spacefast/prompt-skill-picker-spacefast/src/lib/rate-limit.server.ts` trusts `cf-connecting-ip` and the first `X-Forwarded-For` entry with no trusted-proxy check, and `hashIp` falls back to a public literal salt when `RATE_LIMIT_SALT` is unset, so quota and block identity may be caller-controlled if the deployed edge does not overwrite those headers. **Exact missing fact supplied in the parent issue:** “Deployed ingress header handling for the production deployment: does the edge or proxy in front of this app overwrite cf-connecting-ip and strip or overwrite client-supplied X-Forwarded-For on every path (server functions and /api routes), and is RATE_LIMIT_SALT set to a non-default random value in the deployed environment? Both facts live only in…”

**Source-text limitation:** The parent issue text available in this session ends these three missing-fact statements with ellipses as shown above. No text beyond those ellipses was available to reproduce.
