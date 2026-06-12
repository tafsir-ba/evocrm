"use client";

import { cn } from "@/lib/utils";
import { isValidHexColor } from "@/lib/dictionary-colors";

export type TagSelectorTag = {
  id: string;
  name: string;
  color: string;
  entityTypes: string[];
};

export type TagSelectorProps = {
  tags: TagSelectorTag[];
  selectedTagIds?: string[];
  entityType?: "lead" | "property" | "opportunity";
  onToggle?: (tagId: string) => void;
  readOnly?: boolean;
  emptyLabel?: string;
  className?: string;
};

export function TagSelector({
  tags,
  selectedTagIds = [],
  entityType,
  onToggle,
  readOnly = false,
  emptyLabel = "No tags available",
  className,
}: TagSelectorProps) {
  const filteredTags = entityType
    ? tags.filter((tag) => tag.entityTypes.includes(entityType))
    : tags;

  if (filteredTags.length === 0) {
    return (
      <p className={cn("text-[12.5px] text-[var(--color-ink-muted)]", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {filteredTags.map((tag) => {
        const selected = selectedTagIds.includes(tag.id);
        const color = isValidHexColor(tag.color) ? tag.color : "#6B7280";

        return (
          <button
            key={tag.id}
            type="button"
            disabled={readOnly || !onToggle}
            onClick={() => onToggle?.(tag.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
              readOnly || !onToggle
                ? "cursor-default"
                : "cursor-pointer hover:opacity-90 focus-ring",
              selected ? "ring-2 ring-offset-1" : "opacity-80",
            )}
            style={{
              backgroundColor: selected ? `${color}25` : `${color}12`,
              borderColor: selected ? color : `${color}44`,
              color,
              ...(selected ? { ringColor: color } : {}),
            }}
            aria-pressed={selected}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
