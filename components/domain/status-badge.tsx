import { Badge, type StatusTone } from "@/components/ui/badge";

/**
 * Phase 1 display helper — maps mock status strings to badge tones.
 * Real dictionary-driven tones arrive in later phases.
 */
const MOCK_STATUS_TONES: Record<string, StatusTone> = {
  New: "info",
  Contacted: "warn",
  Qualified: "success",
  Lost: "muted",
  Available: "success",
  Reserved: "warn",
  Sold: "danger",
  "Off-market": "muted",
  Upcoming: "info",
  Done: "success",
  Pending: "warn",
  Overdue: "danger",
  Active: "success",
  Scheduled: "info",
  Paused: "warn",
  Draft: "muted",
};

export function StatusBadge({
  status,
  tone,
  size = "md",
}: {
  status: string;
  tone?: StatusTone;
  size?: "sm" | "md";
}) {
  const resolvedTone = tone ?? MOCK_STATUS_TONES[status] ?? "neutral";
  return (
    <Badge tone={resolvedTone} dot size={size}>
      {status}
    </Badge>
  );
}
