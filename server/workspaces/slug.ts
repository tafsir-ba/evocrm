import "server-only";

const MAX_SLUG_LENGTH = 48;

/**
 * Convert a workspace name to a URL-safe slug base.
 */
export function slugifyName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return "workspace";
  }

  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
}

export function appendSlugSuffix(baseSlug: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  const trimmedBase = baseSlug.slice(0, Math.max(1, MAX_SLUG_LENGTH - suffixText.length));
  return `${trimmedBase}${suffixText}`;
}
