import { WaBadge, WaCheckbox } from "@/design-system/font-awsome-web-awesome-171158";
import { SkillActions } from "@/components/skill-actions";
import { formatInstalls } from "@/lib/format";
import type { SkillSuggestion } from "@/lib/api-client";

interface SkillResultCardProps {
  readonly skill: SkillSuggestion;
  readonly checked: boolean;
  readonly onToggle: (id: string) => void;
}

/** One ranked skill, shown identically on the search page and shared links. */
export function SkillResultCard({ skill, checked, onToggle }: SkillResultCardProps) {
  return (
    <li
      className={`rounded-lg border p-4 transition-colors ${
        checked ? "border-primary bg-accent" : "border-border"
      }`}
    >
      <div className="flex gap-3">
        <WaCheckbox
          id={skill.id}
          checked={checked}
          disabled={!skill.hasMarkdown}
          onClick={() => onToggle(skill.id)}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={skill.id}
            className="block cursor-pointer text-sm font-semibold text-foreground"
          >
            {skill.name}
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{skill.source}</span>
            <WaBadge variant="neutral" appearance="filled">
              {formatInstalls(skill.installs)}
            </WaBadge>
            {!skill.hasMarkdown ? (
              <WaBadge variant="neutral" appearance="outlined">
                no markdown available
              </WaBadge>
            ) : null}
          </div>
          {skill.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{skill.description}</p>
          ) : null}
          {skill.reason ? <p className="mt-2 text-sm text-foreground">{skill.reason}</p> : null}
          <SkillActions
            id={skill.id}
            name={skill.name}
            htmlUrl={skill.htmlUrl}
            canOpen={skill.hasMarkdown}
          />
        </div>
      </div>
    </li>
  );
}
