export const SURFACE_UNITS = ["sqm", "sqft"] as const;

export type SurfaceUnit = (typeof SURFACE_UNITS)[number];

export const SURFACE_UNIT_LABELS: Record<SurfaceUnit, string> = {
  sqm: "m²",
  sqft: "sq ft",
};

const SQM_PER_SQFT = 0.09290304;

export function parseSurfaceInput(value: string, unit: SurfaceUnit): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  if (unit === "sqm") {
    return parsed;
  }

  return parsed * SQM_PER_SQFT;
}

export function sqmToInputValue(sqm: number | null, unit: SurfaceUnit): string {
  if (sqm === null) {
    return "";
  }

  if (unit === "sqm") {
    return String(sqm);
  }

  const sqft = sqm / SQM_PER_SQFT;
  return String(Math.round(sqft * 100) / 100);
}

export function formatSurfaceValue(sqm: number | null, unit: SurfaceUnit = "sqm"): string {
  if (sqm === null) {
    return "—";
  }

  if (unit === "sqm") {
    return `${sqm.toLocaleString()} m²`;
  }

  const sqft = sqm / SQM_PER_SQFT;
  return `${Math.round(sqft).toLocaleString()} sq ft`;
}
