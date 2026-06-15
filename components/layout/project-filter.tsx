"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { IconChevronDown } from "@/lib/icons";
import {
  PROJECT_FILTER_PARAM,
  setProjectIdInSearchParams,
} from "@/lib/project-scope";

type ProjectOption = {
  id: string;
  name: string;
  reference: string | null;
};

export function ProjectFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspaceShell();
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const selectedProjectId = searchParams.get(PROJECT_FILTER_PARAM);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects(): Promise<void> {
      const response = await fetch(`/api/workspaces/${workspace.slug}/projects`);
      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as {
        data?: { projects?: ProjectOption[] };
      };

      if (!cancelled) {
        setProjects(payload.data?.projects ?? []);
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [workspace.slug]);

  function onChange(projectId: string): void {
    const next = setProjectIdInSearchParams(
      new URLSearchParams(searchParams.toString()),
      projectId || null,
    );
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 mr-2 max-w-[min(100%,220px)]">
      <span className="text-[12px] text-[var(--color-ink-muted)]">Project</span>
      <div className="relative">
        <select
          value={selectedProjectId ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 pl-2.5 pr-7 rounded-md border border-[var(--color-line)] bg-white text-[13px] text-[var(--color-ink-soft)] appearance-none focus-ring"
          aria-label="Filter by project"
        >
          <option value="">All Projects</option>
          {projects.map((project) => (
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
  );
}
