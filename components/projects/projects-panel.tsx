"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@/lib/icons";
import {
  defaultSortDirForColumn,
  nextProjectBrowserSort,
  PROJECT_BROWSER_PAGE_SIZE,
  PROJECT_BROWSER_VIEW_LABELS,
  PROJECT_BROWSER_VIEWS,
  readProjectBrowserSort,
  readProjectBrowserSortDir,
  readProjectBrowserView,
  type ProjectBrowserSort,
  type ProjectBrowserSortDir,
  type ProjectBrowserView,
} from "@/lib/project-browser";
import { PROJECT_FILTER_PARAM } from "@/lib/project-scope";
import { workspacePath } from "@/lib/workspace-paths";

type ProjectCounts = {
  leads: number;
  properties: number;
  opportunities: number;
  activeCampaigns: number;
  lastActivityAt: string | null;
  lastGenuineInboundAt: string | null;
  lastGenuineInboundBasis: "received_at" | "source_created" | "capture_created" | null;
};

type ProjectRecord = {
  id: string;
  name: string;
  reference: string | null;
  city: string | null;
  country: string | null;
  projectType: string | null;
  archivedAt: string | null;
  createdAt: string;
  counts?: ProjectCounts;
};

type ProjectsPanelProps = {
  workspaceSlug: string;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

function readProjectsPayload(payload: {
  data?: unknown;
  pagination?: { total?: number };
}): { projects: ProjectRecord[]; total: number } {
  if (Array.isArray(payload.data)) {
    return {
      projects: payload.data as ProjectRecord[],
      total: payload.pagination?.total ?? payload.data.length,
    };
  }

  const nested =
    payload.data && typeof payload.data === "object" && "projects" in payload.data
      ? (payload.data as { projects?: ProjectRecord[] }).projects ?? []
      : [];

  return { projects: nested, total: payload.pagination?.total ?? nested.length };
}

export function ProjectsPanel({
  workspaceSlug,
  canCreate,
  canUpdate,
  canArchive,
}: ProjectsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "");
  const [search, setSearch] = useState(() => (searchParams.get("search") ?? "").trim());
  const [view, setView] = useState<ProjectBrowserView>(() =>
    readProjectBrowserView(searchParams.get("view")),
  );
  const [sort, setSort] = useState<ProjectBrowserSort>(() =>
    readProjectBrowserSort(searchParams.get("sort")),
  );
  const [sortDir, setSortDir] = useState<ProjectBrowserSortDir>(() => {
    const explicit = searchParams.get("dir") ?? searchParams.get("sortDir");
    return explicit
      ? readProjectBrowserSortDir(explicit)
      : defaultSortDirForColumn(readProjectBrowserSort(searchParams.get("sort")));
  });
  const [page, setPage] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isInteger(raw) && raw > 0 ? raw : 1;
  });
  const pageSize = PROJECT_BROWSER_PAGE_SIZE;

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      setSearch((current) => {
        if (current === nextSearch) {
          return current;
        }
        setPage(1);
        return nextSearch;
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    const projectId = next.get(PROJECT_FILTER_PARAM);

    next.delete("search");
    next.delete("view");
    next.delete("sort");
    next.delete("dir");
    next.delete("sortDir");
    next.delete("page");
    if (projectId) {
      next.set(PROJECT_FILTER_PARAM, projectId);
    }
    if (search) {
      next.set("search", search);
    }
    if (view !== "all") {
      next.set("view", view);
    }
    if (sort !== "inbound") {
      next.set("sort", sort);
    }
    if (sortDir !== "desc") {
      next.set("dir", sortDir);
    }
    if (page > 1) {
      next.set("page", String(page));
    }

    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    const current = new URLSearchParams(searchParams.toString());
    const sameState =
      (current.get("search") ?? "") === (next.get("search") ?? "") &&
      (current.get("view") ?? "") === (next.get("view") ?? "") &&
      (current.get("sort") ?? "") === (next.get("sort") ?? "") &&
      (current.get("dir") ?? "") === (next.get("dir") ?? "") &&
      (current.get("page") ?? "") === (next.get("page") ?? "") &&
      (current.get(PROJECT_FILTER_PARAM) ?? "") === (next.get(PROJECT_FILTER_PARAM) ?? "");
    if (!sameState) {
      router.replace(href, { scroll: false });
    }
  }, [page, pathname, router, search, searchParams, sort, sortDir, view]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({
        withCounts: "true",
        page: String(page),
        pageSize: String(pageSize),
        view,
        sort,
        sortDir,
      });
      if (search) {
        params.set("search", search);
      }

      const response = await fetch(`${apiBase}/projects?${params.toString()}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load projects.");
      }

      const parsed = readProjectsPayload(payload);
      setProjects(parsed.projects);
      setTotal(parsed.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, page, pageSize, search, sort, sortDir, view]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const rangeLabel = useMemo(() => {
    if (total === 0) {
      return "0 of 0";
    }
    return `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`;
  }, [page, pageSize, total]);

  function changeView(nextView: ProjectBrowserView) {
    setView(nextView);
    setPage(1);
  }

  function changeSort(nextSort: ProjectBrowserSort) {
    const next = nextProjectBrowserSort(sort, sortDir, nextSort);
    setSort(next.sort);
    setSortDir(next.sortDir);
    setPage(1);
  }

  async function archiveProject(projectId: string, projectName: string) {
    if (!canArchive) return;
    const confirmed = window.confirm(`Archive "${projectName}"?`);
    if (!confirmed) return;

    const response = await fetch(`${apiBase}/projects/${projectId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to archive project.");
      return;
    }
    await loadProjects();
  }

  if (forbidden) {
    return <PermissionDenied title="Permission denied" />;
  }

  return (
    <>
      <PageHeader
        density="compact"
        title="Projects"
        meta={
          <Badge tone="muted" size="sm">
            {total} total
          </Badge>
        }
        actions={
          canCreate ? (
            <Link
              href={workspacePath(workspaceSlug, "projects", "new")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-brand-600)] px-3.5 text-[13.5px] font-medium text-white hover:bg-[var(--color-brand-700)]"
            >
              <IconPlus size={15} />
              New project
            </Link>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-col gap-2">
        <div
          className="inline-flex max-w-full flex-wrap rounded-md border border-[var(--color-line)] bg-[var(--color-canvas)] p-0.5"
          role="tablist"
          aria-label="Project demand views"
        >
          {PROJECT_BROWSER_VIEWS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              className={`h-7 rounded px-2 text-[12px] font-medium ${
                view === key
                  ? "bg-white text-[var(--color-ink)] shadow-[var(--shadow-xs)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
              onClick={() => changeView(key)}
            >
              {PROJECT_BROWSER_VIEW_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="max-w-xs min-w-[200px] flex-1">
            <Input
              placeholder="Search name, reference, or location…"
              aria-label="Search projects"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              fieldSize="sm"
            />
          </div>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-ink-muted)] md:hidden">
            <span className="sr-only">Sort projects</span>
            <select
              className="h-8 rounded-md border border-[var(--color-line)] bg-white px-2 text-[12px] text-[var(--color-ink-soft)]"
              aria-label="Sort projects"
              value={`${sort}:${sortDir}`}
              onChange={(event) => {
                const [nextSort, nextDir] = event.target.value.split(":") as [
                  ProjectBrowserSort,
                  ProjectBrowserSortDir,
                ];
                setSort(nextSort);
                setSortDir(nextDir);
                setPage(1);
              }}
            >
              <option value="inbound:desc">Latest inbound</option>
              <option value="inbound:asc">Oldest inbound</option>
              <option value="leads:desc">Most leads</option>
              <option value="leads:asc">Fewest leads</option>
              <option value="status:asc">Status</option>
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load projects"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadProjects() }}
        />
      ) : projects.length === 0 ? (
        <EmptyState
          title={search || view !== "all" ? "No matching projects" : "No projects yet"}
          description={
            search || view !== "all"
              ? "Try another view or search. Archived projects stay available in the Archived view."
              : "Create a project to scope leads, properties, pipeline, and dripping."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-white">
          <ProjectsTable
            workspaceSlug={workspaceSlug}
            projects={projects}
            canUpdate={canUpdate}
            canArchive={canArchive}
            onArchive={(projectId, projectName) => void archiveProject(projectId, projectName)}
            sort={sort}
            sortDir={sortDir}
            onSort={changeSort}
          />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2">
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Showing{" "}
              <span className="font-medium text-[var(--color-ink)]">{rangeLabel}</span>
            </p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page <= 1}
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <IconChevronLeft size={14} />
              </button>
              <span className="tabular px-2 text-[12.5px] text-[var(--color-ink-soft)]">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page >= totalPages}
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
