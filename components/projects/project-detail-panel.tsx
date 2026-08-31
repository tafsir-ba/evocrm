"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatProjectLocationDetail,
  formatProjectLocationLabel,
  hasStructuredLocation,
  type ProjectLocation,
} from "@/lib/project-location";
import { ProjectCompanyPeople } from "@/components/projects/project-company-people";
import {
  primaryCompanyLink,
  PROJECT_COMMERCIAL_STAGE_LABELS,
  PROJECT_COMPANY_ROLE_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectCommercialStage,
  type ProjectCompanyRole,
  type ProjectType,
} from "@/lib/project-operating-record";
import { withProjectIdQuery } from "@/lib/project-scope";
import { workspaceNavPath, workspacePath } from "@/lib/workspace-paths";

type ProjectCompanyLink = {
  companyId: string;
  role: ProjectCompanyRole;
  isPrimary: boolean;
  company?: { id: string; name: string } | null;
};

type ProjectDetail = {
  id: string;
  name: string;
  reference: string | null;
  projectType: string | null;
  commercialStage: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  location?: ProjectLocation | null;
  companies?: ProjectCompanyLink[];
  description: string | null;
  archivedAt: string | null;
  companyPeople?: Array<{
    id: string;
    companyId: string | null;
    projectId: string | null;
    fullName: string;
    email: string | null;
  }>;
  associablePeople?: Array<{
    id: string;
    companyId: string | null;
    projectId: string | null;
    fullName: string;
    email: string | null;
  }>;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "leads", label: "Leads", href: "leads" },
  { key: "properties", label: "Properties", href: "properties" },
  { key: "pipeline", label: "Pipeline", href: "pipeline" },
  { key: "activities", label: "Activities", href: "activities" },
  { key: "dripping", label: "Dripping", href: "dripping" },
  { key: "settings", label: "Settings", href: "edit" },
] as const;

type ProjectDetailPanelProps = {
  workspaceSlug: string;
  projectId: string;
  canUpdate: boolean;
  canArchive: boolean;
};

function projectTypeLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value in PROJECT_TYPE_LABELS ? PROJECT_TYPE_LABELS[value as ProjectType] : value;
}

function commercialStageLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value in PROJECT_COMMERCIAL_STAGE_LABELS
    ? PROJECT_COMMERCIAL_STAGE_LABELS[value as ProjectCommercialStage]
    : value;
}

export function ProjectDetailPanel({
  workspaceSlug,
  projectId,
  canUpdate,
  canArchive,
}: ProjectDetailPanelProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load project.");
      }
      setProject(payload.data.project as ProjectDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function archiveProject() {
    if (!project || !canArchive) return;
    const confirmed = window.confirm(`Archive "${project.name}"?`);
    if (!confirmed) return;

    const response = await fetch(`/api/workspaces/${workspaceSlug}/projects/${projectId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error?.message ?? "Failed to archive project.");
      return;
    }
    await loadProject();
  }

  if (loading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error || !project) {
    return (
      <ErrorState
        title="Could not load project"
        description={error ?? "Project not found."}
        primaryAction={{ label: "Retry", onClick: () => void loadProject() }}
      />
    );
  }

  const stageLabel = commercialStageLabel(project.commercialStage);
  const typeLabel = projectTypeLabel(project.projectType);
  const primaryCompany = primaryCompanyLink(project.companies ?? []);
  const primaryCompanyName = primaryCompany?.company?.name ?? null;
  const primaryCompanyRole =
    primaryCompany && primaryCompany.role in PROJECT_COMPANY_ROLE_LABELS
      ? PROJECT_COMPANY_ROLE_LABELS[primaryCompany.role]
      : null;

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.reference ? `Reference ${project.reference}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {canUpdate && !project.archivedAt && (
              <Link
                href={workspacePath(workspaceSlug, "projects", projectId, "edit")}
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-line)] bg-white px-3.5 text-[13.5px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)]"
              >
                Edit
              </Link>
            )}
            {canArchive && !project.archivedAt && (
              <Button variant="danger" onClick={() => void archiveProject()}>
                Archive
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((tab) => {
          if (tab.key === "overview") {
            return (
              <span
                key={tab.key}
                className="px-3 py-1.5 rounded-md bg-[var(--color-brand-50)] text-[var(--color-brand-700)] text-[13px] font-medium"
              >
                {tab.label}
              </span>
            );
          }

          const baseHref =
            tab.href === "edit"
              ? workspacePath(workspaceSlug, "projects", projectId, "edit")
              : withProjectIdQuery(workspaceNavPath(workspaceSlug, tab.href!), projectId);

          return (
            <Link
              key={tab.key}
              href={baseHref}
              className="px-3 py-1.5 rounded-md border border-[var(--color-line)] bg-white text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {project.archivedAt ? <Badge tone="muted">Archived</Badge> : null}
          {stageLabel ? <Badge tone="success">{stageLabel}</Badge> : null}
          {typeLabel ? <Badge tone="muted">{typeLabel}</Badge> : null}
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-[var(--color-ink-muted)]">Primary company</dt>
            <dd className="text-[var(--color-ink)]">{primaryCompanyName || "—"}</dd>
            {primaryCompanyRole ? (
              <dd className="mt-1 text-[12px] text-[var(--color-ink-muted)]">{primaryCompanyRole}</dd>
            ) : null}
          </div>
          <div>
            <dt className="text-[var(--color-ink-muted)]">Location</dt>
            <dd className="text-[var(--color-ink)]">
              {formatProjectLocationDetail(project.location, {
                address: project.address,
                city: project.city,
                country: project.country,
              })}
            </dd>
            {hasStructuredLocation(project.location) ? (
              <dd className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                {formatProjectLocationLabel(project.location, {
                  city: project.city,
                  country: project.country,
                })}
                {project.location?.countryCode ? ` · ${project.location.countryCode}` : ""}
                {project.location?.cantonCode ? ` · ${project.location.cantonCode}` : ""}
                {project.location?.postalCode ? ` · ${project.location.postalCode}` : ""}
                {project.location?.reviewStatus === "review_needed" ? " · Review needed" : ""}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-[var(--color-ink-muted)]">Website</dt>
            <dd className="text-[var(--color-ink)]">
              {project.website ? (
                /^https?:\/\//i.test(project.website) ? (
                  <a
                    href={project.website}
                    className="text-[var(--color-brand-700)] hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {project.website}
                  </a>
                ) : (
                  project.website
                )
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-[var(--color-ink-muted)]">Description</dt>
            <dd className="text-[var(--color-ink)] whitespace-pre-wrap">
              {project.description || "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <ProjectCompanyPeople
          workspaceSlug={workspaceSlug}
          companyName={primaryCompanyName}
          companyId={primaryCompany?.companyId ?? null}
          people={project.companyPeople ?? []}
          associablePeople={project.associablePeople ?? []}
          canAssociate={canUpdate && !project.archivedAt}
          onAssociated={() => loadProject()}
        />
      </div>
    </>
  );
}
