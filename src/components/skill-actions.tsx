import { useMutation } from "@tanstack/react-query";

import { WaIcon } from "@/design-system/font-awsome-web-awesome-171158";
import { createSkillGist, fetchSkillFiles } from "@/lib/api-client";
import { openInCodePen } from "@/lib/codepen";

interface SkillActionsProps {
  readonly id: string;
  readonly name: string;
  readonly htmlUrl: string | null;
  readonly canOpen: boolean;
}

const linkClass =
  "inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity hover:underline disabled:cursor-not-allowed disabled:opacity-50";

/** Per-skill "open elsewhere" actions: source repo, CodePen, GitHub Gist. */
export function SkillActions({ id, name, htmlUrl, canOpen }: SkillActionsProps) {
  const codepen = useMutation({
    mutationFn: async () => {
      const files = await fetchSkillFiles([id]);
      const file = files[0];
      if (!file) throw new Error("This skill has no markdown file to open.");
      openInCodePen(name, file.content);
    },
  });

  const gist = useMutation({
    mutationFn: async () => {
      const { url } = await createSkillGist(id);
      window.open(url, "_blank", "noopener,noreferrer");
    },
  });

  const error = codepen.error ?? gist.error;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        {htmlUrl ? (
          <a href={htmlUrl} target="_blank" rel="noreferrer" className={linkClass}>
            View source <WaIcon name="arrow-up-right-from-square" />
          </a>
        ) : null}
        <button
          type="button"
          className={linkClass}
          disabled={!canOpen || codepen.isPending}
          onClick={() => codepen.mutate()}
        >
          {codepen.isPending ? (
            <WaIcon name="spinner" animation="spin" />
          ) : (
            <WaIcon name="codepen" family="brands" />
          )}
          Open in CodePen
        </button>
        <button
          type="button"
          className={linkClass}
          disabled={!canOpen || gist.isPending}
          onClick={() => gist.mutate()}
        >
          {gist.isPending ? (
            <WaIcon name="spinner" animation="spin" />
          ) : (
            <WaIcon name="github" family="brands" />
          )}
          Open in Gist
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">
          {error instanceof Error ? error.message : "That action failed."}
        </p>
      ) : null}
    </div>
  );
}
