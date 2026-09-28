/**
 * Per-agent metadata. Client-safe and worker-safe: pure data, no imports.
 * (Ported from src/lib/agents.ts; kept self-contained so the worker does not
 * depend on the frontend's module graph.)
 */
import type { AgentKey } from "./types";

export const AGENT_KEYS: readonly AgentKey[] = [
  "microsoft-copilot",
  "superhuman-go",
  "chatgpt",
  "grok",
  "perplexity",
  "claude",
  "github-copilot",
  "cursor",
  "wordpress",
];

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

export interface AgentPage {
  readonly key: AgentKey;
  /** Route path — must match a file under `src/routes`. */
  readonly path: string;
  /** Short label used in navigation. */
  readonly label: string;
  readonly heading: string;
  readonly title: string;
  readonly description: string;
  /** Intro paragraph shown under the heading. */
  readonly intro: string;
  /** Where a downloaded SKILL.md belongs for this agent. */
  readonly skillsDir: string;
  /** How the agent picks the skill up once the file is in place. */
  readonly activation: string;
  readonly zipName: string;
}

export const AGENT_PAGES: Readonly<Record<AgentKey, AgentPage>> = {
  "microsoft-copilot": {
    key: "microsoft-copilot",
    path: "/mcp-skills",
    label: "Microsoft Copilot",
    heading: "Microsoft Copilot Skills",
    title: "Microsoft Copilot Skills — curated agent skills and MCP setup",
    description:
      "A curated, most-used-first list of skills for Microsoft Copilot from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Skills are plain SKILL.md files — instructions, not code — so they work with Microsoft Copilot the same way they work anywhere else. These are the ones Copilot users reach for most, ordered by install count.",
    skillsDir: ".copilot/skills/<skill-name>/SKILL.md",
    activation:
      "Reload the Copilot session (or your IDE window) so it re-reads the workspace instructions, then ask for the task the skill covers.",
    zipName: "microsoft-copilot-skills.zip",
  },
  "superhuman-go": {
    key: "superhuman-go",
    path: "/superhuman-go-skills",
    label: "Superhuman Go",
    heading: "Superhuman Go Skills",
    title: "Superhuman Go Skills — curated skills for inbox and email agents",
    description:
      "A curated, most-used-first list of skills for Superhuman Go from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Superhuman Go leans on writing, summarising and triage. These registry skills cover email drafting, meeting notes, follow-ups and scheduling — ordered by install count.",
    skillsDir: "your Superhuman Go instructions or a shared skills folder",
    activation:
      "Paste or attach the SKILL.md contents where Go accepts custom instructions, then ask for the task it covers.",
    zipName: "superhuman-go-skills.zip",
  },
  chatgpt: {
    key: "chatgpt",
    path: "/chatgpt-skills",
    label: "ChatGPT",
    heading: "ChatGPT Skills",
    title: "ChatGPT Skills — curated skills for ChatGPT and custom GPTs",
    description:
      "A curated, most-used-first list of skills for ChatGPT from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "A skill is a markdown brief an agent loads on demand, so a SKILL.md drops straight into a ChatGPT project or a custom GPT. These are the most-installed skills for the tasks ChatGPT gets asked for most.",
    skillsDir: "a ChatGPT project file, or the Instructions field of a custom GPT",
    activation:
      "Upload the SKILL.md to the project's files (or paste it into the GPT's instructions), then start a new chat in that project.",
    zipName: "chatgpt-skills.zip",
  },
  grok: {
    key: "grok",
    path: "/grok-skills",
    label: "Grok",
    heading: "Grok Skills",
    title: "Grok Skills — curated skills for Grok agents",
    description:
      "A curated, most-used-first list of skills for Grok from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Grok reads plain markdown instructions, so any SKILL.md from the registry works as a custom skill. These are the most-installed ones for research, analysis and coding tasks.",
    skillsDir: "a Grok custom instruction block or an attached file",
    activation:
      "Attach the SKILL.md to the conversation (or paste it as custom instructions), then ask for the task it covers.",
    zipName: "grok-skills.zip",
  },
  perplexity: {
    key: "perplexity",
    path: "/perplexity-skills",
    label: "Perplexity",
    heading: "Perplexity Skills",
    title: "Perplexity Skills — curated research and writing skills",
    description:
      "A curated, most-used-first list of skills for Perplexity from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Perplexity is strongest at sourced research and summarisation. These registry skills cover research briefs, competitive analysis, citations and long-form writing — ordered by install count.",
    skillsDir: "a Perplexity Space's custom instructions, or a file uploaded to that Space",
    activation:
      "Add the SKILL.md to a Space (instructions or file), then run your queries inside that Space.",
    zipName: "perplexity-skills.zip",
  },
  claude: {
    key: "claude",
    path: "/claude-skills",
    label: "Claude Code Skills",
    heading: "Claude Code Skills",
    title: "Claude Code Skills — curated skills for Claude agents",
    description:
      "A curated, most-used-first list of Claude Code skills from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Skills are plain SKILL.md files, so every skill in the open registry works in Claude Code. These are the ones Claude Code users reach for most — code review, refactoring, debugging, testing and docs — ordered by install count.",
    skillsDir: ".claude/skills/<skill-name>/SKILL.md",
    activation:
      "Start a new Claude Code session so it picks up the directory, then ask for the task the skill covers. Type / to see the ones it found.",
    zipName: "claude-skills.zip",
  },
  "github-copilot": {
    key: "github-copilot",
    path: "/github-copilot-skills",
    label: "GitHub Copilot",
    heading: "GitHub Copilot Skills",
    title: "GitHub Copilot Skills — curated skills for Copilot in your editor",
    description:
      "A curated, most-used-first list of skills for GitHub Copilot from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "GitHub Copilot reads repository instruction files, so a SKILL.md becomes a Copilot skill by dropping it into your repo. These are the most-installed skills for reviews, tests, refactors and commit hygiene.",
    skillsDir: ".github/skills/<skill-name>/SKILL.md",
    activation:
      "Reload your editor window so Copilot re-reads the repository instructions, then ask Copilot Chat for the task the skill covers.",
    zipName: "github-copilot-skills.zip",
  },
  cursor: {
    key: "cursor",
    path: "/cursor-skills",
    label: "Cursor",
    heading: "Cursor Skills",
    title: "Cursor Skills — curated agent skills for the Cursor editor",
    description:
      "A curated, most-used-first list of skills for Cursor from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Cursor reads project rule and instruction files, so a plain SKILL.md becomes a Cursor skill by dropping it into your repo. These are the most-installed skills for code review, refactoring, debugging, testing and docs.",
    skillsDir: ".cursor/skills/<skill-name>/SKILL.md",
    activation:
      "Reload the Cursor window so it re-reads the project rules, then ask Cursor's chat or agent for the task the skill covers.",
    zipName: "cursor-skills.zip",
  },
  wordpress: {
    key: "wordpress",
    path: "/wordpress-skills",
    label: "WordPress",
    heading: "WordPress Skills",
    title: "WordPress Skills — curated agent skills for WordPress sites",
    description:
      "A curated, most-used-first list of WordPress skills from the open skills registry, with install directions and a one-click zip download of the SKILL.md files.",
    intro:
      "Skills are plain SKILL.md files, so your coding agent can use them while it works on a WordPress site — themes, plugins, blocks, content and SEO. These are the most-installed ones for that work.",
    skillsDir: "your project's skills directory, e.g. .claude/skills/<skill-name>/SKILL.md",
    activation:
      "Start a new agent session in your WordPress project so it picks up the skills directory, then ask for the task the skill covers.",
    zipName: "wordpress-skills.zip",
  },
};

export const AGENT_PAGE_LIST: readonly AgentPage[] = (AGENT_KEYS as readonly AgentKey[]).map(
  (key) => AGENT_PAGES[key],
);
