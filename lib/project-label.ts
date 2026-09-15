/**
 * Fold project names/references so website payloads can match CRM projects
 * without depending on a single site's casing or accents (Éveil / Eveil / EVEIL).
 */
export function foldProjectLabel(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
