import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  WaBadge,
  WaButton,
  WaCallout,
  WaCheckbox,
  WaIcon,
  WaSkeleton,
} from "@/design-system/font-awsome-web-awesome-171158";

import { SelectionBar } from "@/components/selection-bar";
import { AgentIcon, AgentNav } from "@/components/agent-nav";
import { downloadSkillsZip } from "@/lib/zip";
import { fetchSkillFiles, listAgentSkills, type SkillLibraryEntry } from "@/lib/api-client";
import type { AgentPage } from "@/lib/agents";
import { isRateLimitMessage, useCooldown } from "@/hooks/use-cooldown";
import { formatInstalls } from "@/lib/format";

interface AgentSkillsPageProps {
  readonly agent: AgentPage;
}

/** Registry install command for a single skill. */
function installCommand(entry: SkillLibraryEntry): string {
  return `npx skills use "https://github.com/${entry.source}" --skill "${entry.skillId}"`;
}

/** Curated per-agent skill collection, shared by every agent route. */
export function AgentSkillsPage({ agent }: AgentSkillsPageProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const skills = useQuery({
    queryKey: ["agent-skills", agent.key],
    queryFn: () => listAgentSkills(agent.key),
    staleTime: 30 * 60 * 1000,
    retry: (attempt, error) => attempt < 2 && !isRateLimitMessage(error),
  });

  // A rate-limited load recovers on its own once the cooldown expires.
  useCooldown(skills.error, () => {
    void skills.refetch();
  });

  const download = useMutation({
    mutationFn: async (ids: string[]) => {
      const files = await fetchSkillFiles(ids);
      if (files.length === 0) throw new Error("None of the selected skills could be downloaded.");
      await downloadSkillsZip(files, agent.zipName);
    },
  });

  const downloadCooldown = useCooldown(download.error, () => {
    if (selected.size > 0) download.mutate([...selected]);
  });

  const entries: SkillLibraryEntry[] = skills.data?.entries ?? [];
  const registryDown = skills.data?.unavailable === true;
  const servedFromCache = skills.data?.stale === true;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-background pb-32">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <WaIcon name="arrow-left" /> Back to search
        </Link>

        <header className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <AgentIcon agent={agent.key} size="var(--wa-font-size-3xl)" />

            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {agent.heading}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground sm:text-base">{agent.intro}</p>
          <Link
            to="/library"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <WaIcon name="book-open" /> Browse the full skill library
          </Link>
        </header>

        <AgentNav className="mt-6" current={agent.key} />

        <section className="mt-8 rounded-lg border border-border bg-muted p-4">
          <h2 className="text-sm font-semibold text-foreground">How to install a skill</h2>
          <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Install from the registry.</span> Run
              the per-skill command shown on each card below from your project root — it writes the
              skill into your project&rsquo;s skills directory:
              <pre className="mt-1 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground">
                <code>
                  npx skills use &quot;https://github.com/owner/repo&quot; --skill
                  &quot;skill-name&quot;
                </code>
              </pre>
            </li>
            <li>
              <span className="font-medium text-foreground">2. Or install by hand.</span> Tick the
              skills you want, download the zip, and put each{" "}
              <code className="text-foreground">SKILL.md</code> into{" "}
              <code className="text-foreground">{agent.skillsDir}</code>.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Use it.</span> {agent.activation}
            </li>
          </ol>
        </section>

        {skills.isError ? (
          <WaCallout variant="danger" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {skills.error instanceof Error
                  ? skills.error.message
                  : "Could not load this skill list."}
              </span>
              <WaButton size="s" appearance="outlined" onClick={() => void skills.refetch()}>
                <WaIcon name="rotate-right" /> Try again
              </WaButton>
            </div>
          </WaCallout>
        ) : null}

        {registryDown ? (
          <WaCallout variant="warning" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                The skills registry isn&rsquo;t responding right now. Try again in a minute.
              </span>
              <WaButton size="s" appearance="outlined" onClick={() => void skills.refetch()}>
                <WaIcon name="rotate-right" /> Try again
              </WaButton>
            </div>
          </WaCallout>
        ) : null}

        {servedFromCache ? (
          <WaCallout variant="neutral" className="mt-6">
            The registry is slow at the moment — showing recent results from our cache.
          </WaCallout>
        ) : null}

        {skills.isPending ? (
          <ul className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4].map((key) => (
              <li key={key} className="rounded-lg border border-border p-4">
                <WaSkeleton className="h-5 w-1/2" />
                <WaSkeleton className="mt-3 h-4 w-full" />
                <WaSkeleton className="mt-2 h-10 w-full" />
              </li>
            ))}
          </ul>
        ) : null}

        {skills.isSuccess && entries.length === 0 && !registryDown ? (
          <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            The registry returned no skills just now. Try again in a moment.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <>
            <h2 className="mt-10 text-sm font-semibold text-foreground">
              Curated skills — most installed first ({entries.length})
            </h2>

            <ul className="mt-3 space-y-3">
              {entries.map((entry) => {
                const checked = selected.has(entry.id);
                return (
                  <li
                    key={entry.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      checked ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    <div className="flex gap-3">
                      <WaCheckbox
                        id={`${agent.key}-${entry.id}`}
                        checked={checked}
                        onClick={() => toggle(entry.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <label
                          htmlFor={`${agent.key}-${entry.id}`}
                          className="block cursor-pointer text-sm font-semibold text-foreground"
                        >
                          {entry.name}
                        </label>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{entry.source}</span>
                          <WaBadge variant="neutral" appearance="filled">
                            {formatInstalls(entry.installs)}
                          </WaBadge>
                        </div>
                        {entry.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>
                        ) : null}
                        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Install
                        </p>
                        <pre className="mt-1 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                          <code>{installCommand(entry)}</code>
                        </pre>
                        {entry.htmlUrl ? (
                          <a
                            href={entry.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            View source <WaIcon name="arrow-up-right-from-square" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
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
