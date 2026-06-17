import type { ImportErrorRowDetail, ImportRowIssue } from "@/lib/imports";

const UNKNOWN_PROJECT_MESSAGE_PATTERN = /^Unknown project "(.+)"\.$/;

export function parseUnknownProjectName(message: string): string | null {
  const match = UNKNOWN_PROJECT_MESSAGE_PATTERN.exec(message.trim());
  return match?.[1] ?? null;
}

export function collectUnknownProjectNames(
  issues: ImportRowIssue[],
  errorRows: ImportErrorRowDetail[],
): string[] {
  const names = new Set<string>();

  for (const issue of issues) {
    if (issue.field !== "projectId") continue;
    const name = parseUnknownProjectName(issue.message);
    if (name) names.add(name);
  }

  for (const errorRow of errorRows) {
    for (const issue of errorRow.issues) {
      if (issue.field !== "projectId") continue;
      const name = parseUnknownProjectName(issue.message);
      if (name) names.add(name);
    }
  }

  return Array.from(names);
}

export function suggestProjectNameFromImportValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withSpaces = trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

  if (/\s/.test(withSpaces)) {
    return withSpaces
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function suggestProjectReferenceFromImportValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
