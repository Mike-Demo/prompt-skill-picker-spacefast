import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { SelectionBar } from "@/components/selection-bar";
import { SkillResultCard } from "@/components/skill-result-card";
import { AgentNav } from "@/components/agent-nav";
import { AiSettings, useAiSettings } from "@/components/ai-settings";
import {
  WaButton,
  WaCallout,
  WaIcon,
  WaSkeleton,
  WaTextarea,
  WaTooltip,
} from "@/design-system/font-awsome-web-awesome-171158";

import {
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
  type RecentSearch,
} from "@/lib/recent-searches";
import { downloadSkillsZip } from "@/lib/zip";
import {
  enhancePrompt,
  fetchSkillFiles,
  searchSkills,
  type SkillSuggestion,
} from "@/lib/api-client";
import { enhanceLocal, expandQueriesLocal } from "@/lib/local-model";
import { formatInstalls } from "@/lib/format";
import { useCooldown } from "@/hooks/use-cooldown";
import { websiteJsonLd, webApplicationJsonLd } from "@/lib/structured-data";

const TITLE = "Skill Finder — discover and bundle agent skills";
const DESCRIPTION =
  "Describe what you want your AI agent to do, get ranked skill suggestions from the open skills registry, and download the ones you pick as a single zip.";
const SHARE_IMAGE = "https://skills.mikedemo.dev/og-skill-finder.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://skills.mikedemo.dev/" },
      { property: "og:image", content: SHARE_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: SHARE_IMAGE },
    ],
    links: [{ rel: "canonical", href: "https://skills.mikedemo.dev/" }],
    scripts: [websiteJsonLd(), webApplicationJsonLd()],
  }),
  component: SkillFinderPage,
});

const EXAMPLES = [
  "Write better React components and review pull requests",
  "Design polished landing pages",
  "Process PDFs and spreadsheets",
];

type TextareaHost = HTMLElement & { value: string };

function SkillFinderPage() {
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [enhanceHint, setEnhanceHint] = useState<string | null>(null);
  const enhanceHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local storage is browser-only, so hydrate the list after mount.
  useEffect(() => setRecent(readRecentSearches()), []);

  // Optional AI configuration: stored OpenAI key and/or the in-browser model.
  const { openAiKey, localModel } = useAiSettings();

  const search = useMutation({
    mutationFn: async (value: { prompt: string }) => {
      // Local-model mode expands the prompt into keyword queries in the
      // browser and never sends a key; otherwise the stored key (if any)
      // rides along with the request so the server can rank with AI.
      if (localModel) {
        const queries = await expandQueriesLocal(value.prompt);
        return searchSkills({ prompt: value.prompt, queries });
      }
      return openAiKey
        ? searchSkills({
            prompt: value.prompt,
            openaiKey: openAiKey,
          })
        : searchSkills({ prompt: value.prompt });
    },
    onMutate: () => setShareToken(null),
    onSuccess: (response, value) => {
      setSelected(new Set());
      setShareToken(response.token);
      if (response.token) setRecent(addRecentSearch(value.prompt, response.token));
    },
  });

  const enhance = useMutation({
    mutationFn: async (value: { prompt: string }) => {
      // Local-model mode runs entirely in the browser: no server call.
      if (localModel) return { enhanced: await enhanceLocal(value.prompt) };
      if (!openAiKey) throw new Error("Add your OpenAI key in AI settings below to use Enhance.");
      return enhancePrompt({
        prompt: value.prompt,
        openaiKey: openAiKey,
      });
    },
    onSuccess: (result) => setPrompt(result.enhanced),
  });

  const download = useMutation({
    mutationFn: async (ids: string[]) => {
      const files = await fetchSkillFiles(ids);
      if (files.length === 0) throw new Error("None of the selected skills could be downloaded.");
      await downloadSkillsZip(files);
    },
  });

  const results: SkillSuggestion[] = search.data?.results ?? [];

  const copyShareLink = async () => {
    if (!shareToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/s/${shareToken}`);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  };

  // A rate-limited attempt retries itself once the cooldown ends.
  const searchCooldown = useCooldown(search.error, () => {
    const trimmed = prompt.trim();
    if (trimmed.length >= 3) search.mutate({ prompt: trimmed });
  });
  const enhanceCooldown = useCooldown(enhance.error, () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) return;
    enhance.mutate({ prompt: trimmed });
  });
  const downloadCooldown = useCooldown(download.error, () => {
    if (selected.size > 0) download.mutate([...selected]);
  });
  const cooldown = Math.max(searchCooldown, enhanceCooldown);
  const busy = search.isPending || enhance.isPending || cooldown > 0;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 3 || busy) return;
    search.mutate({ prompt: trimmed });
  };

  const showEnhanceHint = (message: string) => {
    if (enhanceHintTimer.current) clearTimeout(enhanceHintTimer.current);
    setEnhanceHint(message);
    enhanceHintTimer.current = setTimeout(() => setEnhanceHint(null), 4000);
  };

  const runEnhanceClick = () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3 || busy) return;
    // Local-model mode needs no key and makes no server call.
    if (localModel) {
      enhance.mutate({ prompt: trimmed });
      return;
    }
    if (!openAiKey) {
      showEnhanceHint(
        "Add your OpenAI key in AI settings below, or enable the in-browser model, to use Enhance.",
      );
      return;
    }
    enhance.mutate({ prompt: trimmed });
  };

  return (
    <main className="bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt=""
              aria-hidden="true"
              width={56}
              height={56}
              className="size-14 shrink-0"
            />
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Skill Finder — discover and bundle AI agent skills
            </h1>
          </div>
          <p className="text-sm text-muted-foreground sm:text-base">
            Describe what you want your agent to do. We search the open skills registry, rank the
            matches with AI, and bundle the ones you pick into a zip of markdown files.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              to="/library"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <WaIcon name="book-open" label="Library" /> Browse the full skill library
            </Link>
          </div>
          <AgentNav />
        </header>

        <form
          className="mt-8 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(prompt);
          }}
        >
          <div className="relative">
            <WaTextarea
              value={prompt}
              rows={3}
              resize="none"
              placeholder="e.g. help me write better React components and review pull requests"
              aria-label="Describe what you want your agent to do"
              className="w-full"
              onInput={(event: React.FormEvent<HTMLElement>) => {
                setPrompt((event.currentTarget as TextareaHost).value);
              }}
              onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit(prompt);
                }
              }}
            />
            <WaButton
              id="enhance-btn"
              type="button"
              appearance="plain"
              size="xs"
              pill
              disabled={prompt.trim().length < 3 || busy}
              onClick={runEnhanceClick}
              className="absolute bottom-2 right-2"
              aria-label="Enhance prompt with AI"
            >
              <WaIcon
                name={enhance.isPending ? "spinner" : "wand-magic-sparkles"}
                animation={enhance.isPending ? "spin" : undefined}
                label="Enhance"
              />
            </WaButton>
            <WaTooltip for="enhance-btn" placement="left">
              {enhance.isPending ? "Enhancing…" : "Enhance with AI for sharper matches"}
            </WaTooltip>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setPrompt(example);
                  submit(example);
                }}
              >
                {example}
              </button>
            ))}
          </div>
          {enhanceHint ? <p className="text-xs text-muted-foreground">{enhanceHint}</p> : null}
          <div className="flex justify-center">
            <WaButton
              type="submit"
              variant="brand"
              loading={search.isPending}
              disabled={prompt.trim().length < 3 || busy}
            >
              <WaIcon name="magnifying-glass" />
              {cooldown > 0 ? `Find skills in ${cooldown}s` : "Find skills"}
            </WaButton>
          </div>
        </form>

        <AiSettings />

        {enhance.isError ? (
          <WaCallout variant="danger" className="mt-6">
            {enhance.error instanceof Error ? enhance.error.message : "Enhance failed."}
          </WaCallout>
        ) : null}

        {search.isError ? (
          <WaCallout variant="danger" className="mt-6">
            <p>{search.error instanceof Error ? search.error.message : "Search failed."}</p>
          </WaCallout>
        ) : null}

        {search.isPending ? (
          <ul className="mt-8 space-y-3">
            {[0, 1, 2, 3].map((key) => (
              <li key={key} className="rounded-lg border border-border p-4">
                <WaSkeleton className="h-5 w-1/2" />
                <WaSkeleton className="mt-3 h-4 w-full" />
                <WaSkeleton className="mt-2 h-4 w-2/3" />
              </li>
            ))}
          </ul>
        ) : null}

        {!search.isPending && search.isSuccess && results.length === 0 ? (
          <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No matching skills found. Try describing the task differently.
          </p>
        ) : null}

        {results.length > 0 ? (
          <>
            {shareToken ? (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <span className="text-muted-foreground">
                  These results are saved for 72 hours — share or revisit them with a link.
                </span>
                <WaButton
                  type="button"
                  variant="neutral"
                  appearance="outlined"
                  size="s"
                  onClick={copyShareLink}
                >
                  <WaIcon name={shareCopied ? "check" : "link"} />
                  {shareCopied ? "Copied" : "Copy share link"}
                </WaButton>
              </div>
            ) : null}
            <ul className="mt-4 space-y-3">
              {results.map((skill) => (
                <SkillResultCard
                  key={skill.id}
                  skill={skill}
                  checked={selected.has(skill.id)}
                  onToggle={toggle}
                />
              ))}
            </ul>
          </>
        ) : null}

        {recent.length > 0 ? (
          <section className="mt-12">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Recent searches</h2>
              <WaButton
                type="button"
                appearance="plain"
                size="xs"
                onClick={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
              >
                <WaIcon name="trash" />
                Clear
              </WaButton>
            </div>
            <ul className="mt-2 space-y-1">
              {recent.map((entry) => (
                <li key={entry.token}>
                  <Link
                    to="/s/$token"
                    params={{ token: entry.token }}
                    className="block truncate rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {entry.prompt}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <SelectionBar
        count={selected.size}
        pending={download.isPending}
        cooldown={downloadCooldown}
        error={download.isError ? download.error : null}
        onDownload={() => download.mutate([...selected])}
      />
    </main>
  );
}
