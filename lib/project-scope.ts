export const PROJECT_FILTER_PARAM = "projectId";

export function readProjectIdFromSearchParams(
  searchParams: URLSearchParams | { get(name: string): string | null },
): string | null {
  const value = searchParams.get(PROJECT_FILTER_PARAM)?.trim();
  return value || null;
}

export function withProjectIdQuery(
  href: string,
  projectId: string | null | undefined,
): string {
  if (!projectId) {
    return href;
  }

  const url = new URL(href, "http://local");
  url.searchParams.set(PROJECT_FILTER_PARAM, projectId);
  return `${url.pathname}${url.search}`;
}

export function setProjectIdInSearchParams(
  searchParams: URLSearchParams,
  projectId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());

  if (projectId) {
    next.set(PROJECT_FILTER_PARAM, projectId);
  } else {
    next.delete(PROJECT_FILTER_PARAM);
  }

  return next;
}

export function appendProjectIdToSearchParams(
  params: URLSearchParams,
  projectId: string | null | undefined,
): void {
  if (projectId) {
    params.set(PROJECT_FILTER_PARAM, projectId);
  }
}
