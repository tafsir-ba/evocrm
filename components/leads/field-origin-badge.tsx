import { Badge } from "@/components/ui/badge";
import { originLabel } from "@/lib/lead-enrichment";
import type { LeadFieldProvenanceMethod } from "@/lib/lead-intelligence";

export function FieldOriginBadge({
  method,
}: {
  method?: LeadFieldProvenanceMethod | "unknown" | null;
}) {
  if (!method) {
    return null;
  }
  const label = originLabel(method);
  const tone = method === "enrichment" ? "enrich" : method === "import" ? "warn" : "muted";
  return (
    <Badge tone={tone} size="sm">
      {label}
    </Badge>
  );
}
