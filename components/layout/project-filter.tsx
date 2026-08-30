"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { IconChevronDown } from "@/lib/icons";
import { PROJECT_BROWSER_PICKER_PAGE_SIZE } from "@/lib/project-browser";
import {
  PROJECT_FILTER_PARAM,
  setProjectIdInSearchParams,
} from "@/lib/project-scope";

type ProjectOption = {
  id: string;
  name: string;
  reference: string | null;
};

function readProjectOptions(payload: { data?: unknown }): ProjectOption[] {
  if (Array.isArray(payload.data)) {
    return payload.data as ProjectOption[];
  }
  if (payload.data && typeof payload.data === "object" && "projects" in payload.data) {
    return (payload.data as { projects?: ProjectOption[] }).projects ?? [];
  }
  return [];
}

export function ProjectFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspaceShell();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null);
  const selectedProjectId = searchParams.get(PROJECT_FILTER_PARAM);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      const params = new URLSearchParams({
        page: "1",
        pageSize: String(PROJECT_BROWSER_PICKER_PAGE_SIZE),
        sort: "name",
        sortDir: "asc",
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(
        `/api/workspaces/${workspace.slug}/projects?${params.toString()}`,
      );
      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as { data?: unknown };
      if (!cancelled) {
        setProjects(readProjectOptions(payload));
      }
    }

    const timeout = window.setTimeout(() => {
      void loadProjects();
    }, search.trim() ? 200 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [search, workspace.slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelected(): Promise<void> {
      if (!selectedProjectId) {
        setSelectedProject(null);
        return;
      }
      if (selectedProject?.id === selectedProjectId) {
        return;
      }

      const response = await fetch(
        `/api/workspaces/${workspace.slug}/projects/${selectedProjectId}`,
      );
      if (!response.ok || cancelled) {
        return;
      }
      const payload = (await response.json()) as {
        data?: { project?: ProjectOption };
      };
      if (!cancelled && payload.data?.project) {
        setSelectedProject(payload.data.project);
      }
    }

    void loadSelected();

    return () => {
      cancelled = true;
    };
  }, [selectedProject?.id, selectedProjectId, workspace.slug]);

  const options = useMemo(() => {
    if (!selectedProject) {
      return projects;
    }
    if (projects.some((project) => project.id === selectedProject.id)) {
      return projects;
    }
    return [selectedProject, ...projects];
  }, [projects, selectedProject]);

  function onChange(projectId: string): void {
    const next = setProjectIdInSearchParams(
      new URLSearchParams(searchParams.toString()),
      projectId || null,
    );
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="mr-1 flex min-w-0 max-w-[42vw] items-center gap-1.5 sm:mr-2 sm:max-w-[min(100%,280px)] sm:gap-2">
      <span className="hidden shrink-0 text-[12px] text-[var(--color-ink-muted)] sm:inline">
        Project
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find…"
          aria-label="Search projects in the workspace filter"
          className="h-8 w-[4.75rem] rounded-md border border-[var(--color-line)] bg-white px-2 text-[12px] text-[var(--color-ink-soft)] focus-ring sm:w-[7rem]"
        />
        <div className="relative min-w-0 flex-1">
          <select
            value={selectedProjectId ?? ""}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-full max-w-full appearance-none rounded-md border border-[var(--color-line)] bg-white pl-2.5 pr-7 text-[13px] text-[var(--color-ink-soft)] focus-ring"
            aria-label="Filter by project"
          >
            <option value="">All Projects</option>
            {options.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.reference ? ` (${project.reference})` : ""}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={14}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]"
          />
        </div>
      </div>
    </div>
  );
}
