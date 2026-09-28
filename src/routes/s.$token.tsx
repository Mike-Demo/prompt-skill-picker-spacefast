import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SelectionBar } from "@/components/selection-bar";
import { SkillResultCard } from "@/components/skill-result-card";
import { WaCallout, WaIcon, WaSkeleton } from "@/design-system/font-awsome-web-awesome-171158";
import { useCooldown } from "@/hooks/use-cooldown";
import { downloadSkillsZip } from "@/lib/zip";
import { fetchSkillFiles, getSavedSearch } from "@/lib/api-client";

const TITLE = "Shared skill search — Skill Finder";
const DESCRIPTION =
  "A saved Skill Finder search: the original prompt and its ranked skill suggestions, replayed without re-running the AI.";

export const Route = createFileRoute("/s/$token")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SharedSearchPage,
});

function SharedSearchPage() {
  const { token } = Route.useParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const saved = useQuery({
    queryKey: ["saved-search", token],
    queryFn: () => getSavedSearch(token),
  });

  const download = useMutation({
    mutationFn: async (ids: string[]) => {
      const files = await fetchSkillFiles(ids);
      if (files.length === 0) throw new Error("None of the selected skills could be downloaded.");
      await downloadSkillsZip(files);
    },
  });

  const downloadCooldown = useCooldown(download.error, () => {
    if (selected.size > 0) download.mutate([...selected]);
  });

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const results = saved.data?.results ?? [];

  return (
    <main className="bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <WaIcon name="arrow-left" /> New search
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Shared search
        </h1>

        {saved.isPending ? (
          <div className="mt-8 space-y-3">
            <WaSkeleton className="h-5 w-2/3" />
            <WaSkeleton className="h-24 w-full" />
            <WaSkeleton className="h-24 w-full" />
          </div>
        ) : null}

        {saved.isError ? (
          <WaCallout variant="danger" className="mt-8">
            {saved.error instanceof Error ? saved.error.message : "This link could not be loaded."}
          </WaCallout>
        ) : null}

        {saved.isSuccess && saved.data === null ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            <p>This share link has expired. Shared searches are kept for 72 hours.</p>
            <Link to="/" className="mt-2 inline-block font-medium text-primary hover:underline">
              Run a new search
            </Link>
          </div>
        ) : null}

        {saved.data ? (
          <>
            <p className="mt-4 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">
              {saved.data.prompt}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved results, replayed without a new AI ranking. Link expires{" "}
              {new Date(saved.data.expiresAt).toLocaleString()}.
            </p>
            {results.length === 0 ? (
              <p className="mt-8 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                This search had no matching skills.
              </p>
            ) : (
              <ul className="mt-8 space-y-3">
                {results.map((skill) => (
                  <SkillResultCard
                    key={skill.id}
                    skill={skill}
                    checked={selected.has(skill.id)}
                    onToggle={toggle}
                  />
                ))}
              </ul>
            )}
          </>
        ) : null}

        {download.isPending ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <WaIcon name="spinner" animation="spin" /> Preparing your zip…
          </p>
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
