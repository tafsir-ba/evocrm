import { Badge, type StatusTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isValidHexColor } from "@/lib/dictionary-colors";

export type StatusBadgeItem = {
  label: string;
  color: string;
  behavior?: string;
};

type DictionaryStatusBadgeProps = StatusBadgeItem & {
  size?: "sm" | "md";
  className?: string;
};

type LegacyStatusBadgeProps = {
  status: string;
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
};

export type StatusBadgeProps = DictionaryStatusBadgeProps | LegacyStatusBadgeProps;

function isLegacyProps(
  props: StatusBadgeProps,
): props is LegacyStatusBadgeProps {
  return "status" in props;
}

/**
 * Renders a status badge from backend dictionary item data (label + color),
 * or falls back to legacy mock string display during Phase 1 placeholders.
 */
export function StatusBadge(props: StatusBadgeProps) {
  if (isLegacyProps(props)) {
    return (
      <Badge tone={props.tone ?? "neutral"} dot size={props.size ?? "md"} className={props.className}>
        {props.status}
      </Badge>
    );
  }

  const { label, color, size = "md", className } = props;

  if (isValidHexColor(color)) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium border rounded-full whitespace-nowrap",
          size === "sm" ? "text-[11px] px-2 py-[2px]" : "text-[12px] px-2.5 py-[3px]",
          className,
        )}
        style={{
          backgroundColor: `${color}20`,
          borderColor: `${color}55`,
          color,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
    );
  }

  return (
    <Badge tone="neutral" dot size={size} className={className}>
      {label}
    </Badge>
  );
}
