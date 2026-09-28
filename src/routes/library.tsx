import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  WaBadge,
  WaButton,
  WaCallout,
  WaCheckbox,
  WaIcon,
  WaInput,
  WaSkeleton,
} from "@/design-system/font-awsome-web-awesome-171158";
import { downloadSkillsZip } from "@/lib/zip";
import { fetchSkillFiles, listSkills, type SkillLibraryEntry } from "@/lib/api-client";
import { isRateLimitMessage, useCooldown } from "@/hooks/use-cooldown";
import { formatInstalls } from "@/lib/format";

import { collectionJsonLd } from "@/lib/structured-data";

const TITLE = "Skill library — browse every downloadable agent skill";
const DESCRIPTION =
  "Browse the full library of agent skills from the open registry with a description and usage example for each, then bundle the ones you want into a zip.";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://skills.mikedemo.dev/library" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://skills.mikedemo.dev/library" }],
    scripts: [collectionJsonLd(TITLE, DESCRIPTION, "/library")],
  }),
  component: SkillLibraryPage,
});

type SortMode = "popular" | "alpha";

function SkillLibraryPage() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const library = useQuery({
    queryKey: ["skill-library"],
    queryFn: listSkills,
    staleTime: 30 * 60 * 1000,
    // Retrying a rate-limit rejection only deepens the limit, so surface it instead.
    retry: (attempt, error) => attempt < 2 && !isRateLimitMessage(error),
  });

  const download = useMutation({
    mutationFn: async (ids: string[]) => {
      const files = await fetchSkillFiles(ids);
      if (files.length === 0) throw new Error("None of the selected skills could be downloaded.");
      await downloadSkillsZip(files, "skill-library.zip");
    },
  });

  const entries: SkillLibraryEntry[] = library.data?.entries ?? [];
  const registryDown = library.data?.unavailable === true;
  const servedFromCache = library.data?.stale === true;

  // A rate-limited load is not retried by React Query; instead the cooldown
  // expiring retries it once, so the page recovers without a click.
  useCooldown(library.error, () => {
    void library.refetch();
  });

  const downloadCooldown = useCooldown(download.error, () => {
    if (selected.size > 0) download.mutate([...selected]);
  });

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched =
      needle.length === 0
        ? entries
        : entries.filter((entry) =>
            `${entry.name} ${entry.source} ${entry.description}`.toLowerCase().includes(needle),
          );

    // Popularity uses the registry's install count, with the name as a stable
    // tie-breaker so equally-used skills keep a predictable order.
    return [...matched].sort((a, b) =>
      sort === "popular"
        ? b.installs - a.installs || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  }, [entries, filter, sort]);

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
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Skill library
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Every skill available for download, straight from the open skills registry. Each entry
            shows its description and a usage example so you can browse before you bundle.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <WaInput
            value={filter}
            onInput={(event: React.FormEvent<HTMLElement>) =>
              setFilter((event.currentTarget as HTMLInputElement).value)
            }
            aria-label="Filter skills by name, repo or description"
            placeholder="Filter by name, repo or description"
            className="max-w-sm"
          />

          <div
            role="group"
            aria-label="Sort skills"
            className="inline-flex overflow-hidden rounded-md border border-border"
          >
            {(
              [
                { value: "popular", label: "Most used" },
                { value: "alpha", label: "A–Z" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sort === option.value}
                onClick={() => setSort(option.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sort === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {library.isSuccess ? (
            <span className="text-xs text-muted-foreground">
              {visible.length} of {entries.length} skills
            </span>
          ) : null}
        </div>

        {library.isError ? (
          <WaCallout variant="danger" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {library.error instanceof Error
                  ? library.error.message
                  : "Could not load the library."}
              </span>
              <WaButton size="s" appearance="outlined" onClick={() => void library.refetch()}>
                <WaIcon name="rotate-right" /> Try again
              </WaButton>
            </div>
          </WaCallout>
        ) : null}

        {registryDown ? (
          <WaCallout variant="warning" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                The skills registry isn&rsquo;t responding right now, so the library is empty. Try
                again in a minute.
              </span>
              <WaButton size="s" appearance="outlined" onClick={() => void library.refetch()}>
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

        {library.isPending ? (
          <ul className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4].map((key) => (
              <li key={key} className="rounded-lg border border-border p-4">
                <WaSkeleton className="h-5 w-1/2" />
                <WaSkeleton className="mt-3 h-4 w-full" />
                <WaSkeleton className="mt-2 h-20 w-full" />
              </li>
            ))}
          </ul>
        ) : null}

        {library.isSuccess && visible.length === 0 && !registryDown ? (
          <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No skills match that filter.
          </p>
        ) : null}

        <ul className="mt-8 space-y-3">
          {visible.map((entry) => {
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
                    id={`lib-${entry.id}`}
                    checked={checked}
                    onClick={() => toggle(entry.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`lib-${entry.id}`}
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
                    {entry.example ? (
                      <div className="mt-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Example
                        </p>
                        <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                          <code>{entry.example}</code>
                        </pre>
                      </div>
                    ) : null}
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
      </div>

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="text-sm text-muted-foreground">
              {selected.size} selected
              {download.isError ? (
                <span className="block text-destructive">
                  {download.error instanceof Error ? download.error.message : "Download failed."}
                </span>
              ) : null}
            </div>
            <WaButton
              variant="brand"
              onClick={() => download.mutate([...selected])}
              disabled={download.isPending || downloadCooldown > 0}
            >
              <WaIcon
                name={download.isPending ? "spinner" : "download"}
                animation={download.isPending ? "spin" : undefined}
              />
              {downloadCooldown > 0 ? `Retry in ${downloadCooldown}s` : "Download zip"}
            </WaButton>
          </div>
        </div>
      ) : null}
    </main>
  );
}
