"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import {
  anyProjectHasActivity,
  anyProjectHasInventory,
  formatProjectActivity,
  formatProjectInventoryLine,
  formatProjectLocation,
  projectListStatus,
} from "@/lib/projects-table";
import { workspacePath } from "@/lib/workspace-paths";

export type ProjectsTableItem = {
  id: string;
  name: string;
  reference: string | null;
  city: string | null;
  country: string | null;
  archivedAt: string | null;
  createdAt: string;
  counts?: {
    leads: number;
    properties: number;
    opportunities: number;
    activeCampaigns: number;
    lastActivityAt: string | null;
  };
};

type ProjectsTableProps = {
  workspaceSlug: string;
  projects: ProjectsTableItem[];
  canUpdate: boolean;
  canArchive: boolean;
  onArchive: (projectId: string, projectName: string) => void;
};

export function ProjectsTable({
  workspaceSlug,
  projects,
  canUpdate,
  canArchive,
  onArchive,
}: ProjectsTableProps) {
  const showInventory = anyProjectHasInventory(projects);
  const showActivity = anyProjectHasActivity(projects);

  return (
    <>
      <div className="hidden md:block">
        <Table density="compact">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell className="w-[10rem]">Location</TableHeaderCell>
              <TableHeaderCell className="w-[4.5rem] text-right">Leads</TableHeaderCell>
              {showInventory ? (
                <TableHeaderCell className="w-[12rem]">Inventory</TableHeaderCell>
              ) : null}
              <TableHeaderCell className="w-[5.5rem]">Status</TableHeaderCell>
              {showActivity ? (
                <TableHeaderCell className="w-[5.5rem]">Activity</TableHeaderCell>
              ) : null}
              <TableHeaderCell className="w-[7rem] text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => {
              const location = formatProjectLocation(project.city, project.country);
              const inventoryLine = formatProjectInventoryLine(project.counts);
              const status = projectListStatus({
                archivedAt: project.archivedAt,
                lastActivityAt: project.counts?.lastActivityAt,
                createdAt: project.createdAt,
              });
              const identityTitle = [project.name, project.reference].filter(Boolean).join(" · ");

              return (
                <TableRow key={project.id}>
                  <TableCell className="min-w-[12rem]">
                    <div className="flex min-w-0 items-baseline gap-1.5" title={identityTitle}>
                      <Link
                        href={workspacePath(workspaceSlug, "projects", project.id)}
                        className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                      >
                        {project.name}
                      </Link>
                      {project.reference ? (
                        <span className="shrink-0 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                          {project.reference}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-[var(--color-ink-soft)]" title={location}>
                      {location}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular text-[var(--color-ink-soft)]">
                    {project.counts?.leads ?? 0}
                  </TableCell>
                  {showInventory ? (
                    <TableCell>
                      {inventoryLine === "—" ? (
                        <span className="text-[var(--color-ink-faint)]">—</span>
                      ) : (
                        <p className="truncate text-[var(--color-ink-soft)]">{inventoryLine}</p>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Badge tone={status.tone} size="sm">
                      {status.label}
                    </Badge>
                  </TableCell>
                  {showActivity ? (
                    <TableCell className="tabular text-[var(--color-ink-muted)]">
                      {formatProjectActivity(project.counts?.lastActivityAt)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      {canUpdate && !project.archivedAt ? (
                        <Link
                          href={workspacePath(workspaceSlug, "projects", project.id, "edit")}
                          className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {canArchive && !project.archivedAt ? (
                        <button
                          type="button"
                          className="inline-flex h-6 items-center rounded px-1.5 text-[12px] font-medium text-[var(--color-danger-fg)] hover:bg-[var(--color-muted)]"
                          onClick={() => onArchive(project.id, project.name)}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-[var(--color-line)] md:hidden">
        {projects.map((project) => {
          const location = formatProjectLocation(project.city, project.country);
          const inventoryLine = formatProjectInventoryLine(project.counts);
          const status = projectListStatus({
            archivedAt: project.archivedAt,
            lastActivityAt: project.counts?.lastActivityAt,
            createdAt: project.createdAt,
          });

          return (
            <li key={project.id} className="px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={workspacePath(workspaceSlug, "projects", project.id)}
                    className="block truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                    {[project.reference, location !== "—" ? location : null]
                      .filter(Boolean)
                      .join(" · ") || "No reference or location"}
                  </p>
                </div>
                <Badge tone={status.tone} size="sm">
                  {status.label}
                </Badge>
              </div>
              <p className="mt-1.5 truncate text-[12px] text-[var(--color-ink-soft)]">
                {project.counts?.leads ?? 0} leads
                {inventoryLine !== "—" ? ` · ${inventoryLine}` : ""}
                {project.counts?.lastActivityAt
                  ? ` · ${formatProjectActivity(project.counts.lastActivityAt)}`
                  : ""}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {canUpdate && !project.archivedAt ? (
                  <Link
                    href={workspacePath(workspaceSlug, "projects", project.id, "edit")}
                    className="text-[12px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  >
                    Edit
                  </Link>
                ) : null}
                {canArchive && !project.archivedAt ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[var(--color-danger-fg)]"
                    onClick={() => onArchive(project.id, project.name)}
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
