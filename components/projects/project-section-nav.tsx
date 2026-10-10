"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { withProjectIdQuery } from "@/lib/project-scope";
import { cn } from "@/lib/utils";
import { workspaceNavPath, workspacePath } from "@/lib/workspace-paths";

export const PROJECT_SECTION_TABS = [
  { key: "overview", label: "Overview" },
  { key: "leads", label: "Leads", href: "leads" },
  { key: "properties", label: "Properties", href: "properties" },
  { key: "pipeline", label: "Pipeline", href: "pipeline" },
  { key: "activities", label: "Activities", href: "activities" },
  { key: "dripping", label: "Dripping", href: "dripping" },
  { key: "settings", label: "Settings", href: "edit" },
  { key: "share", label: "Share", href: "sharing" },
] as const;

export type ProjectSectionTabKey = (typeof PROJECT_SECTION_TABS)[number]["key"] | "paid-ads";

type ProjectSectionNavProps = {
  workspaceSlug: string;
  projectId: string;
  projectName: string;
  projectReference?: string | null;
  activeTab: ProjectSectionTabKey;
  showPaidAds?: boolean;
  actions?: ReactNode;
  /** When false, only the tab strip is rendered (caller owns the title). */
  showHeader?: boolean;
};

export function projectSectionTabHref(
  workspaceSlug: string,
  projectId: string,
  tab: { key: string; href?: string },
): string {
  if (tab.key === "overview") {
    return workspacePath(workspaceSlug, "projects", projectId);
  }
  if (tab.key === "leads") {
    return workspacePath(workspaceSlug, "projects", projectId, "leads");
  }
  if (tab.href === "edit" || tab.href === "sharing" || tab.href === "paid-ads") {
    return workspacePath(workspaceSlug, "projects", projectId, tab.href);
  }
  return withProjectIdQuery(workspaceNavPath(workspaceSlug, tab.href!), projectId);
}

export function ProjectSectionNav({
  workspaceSlug,
  projectId,
  projectName,
  projectReference,
  activeTab,
  showPaidAds = false,
  actions,
  showHeader = true,
}: ProjectSectionNavProps) {
  const tabs = [
    ...PROJECT_SECTION_TABS.slice(0, 6),
    ...(showPaidAds
      ? [{ key: "paid-ads" as const, label: "Paid ads", href: "paid-ads" }]
      : []),
    ...PROJECT_SECTION_TABS.slice(6),
  ];

  return (
    <>
      {showHeader ? (
        <PageHeader
          title={projectName}
          description={projectReference ? `Reference ${projectReference}` : undefined}
          actions={actions}
        />
      ) : null}
      <nav
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Project sections"
      >
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          if (active) {
            return (
              <span
                key={tab.key}
                aria-current="page"
                className="rounded-md bg-[var(--color-brand-50)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-brand-700)]"
              >
                {tab.label}
              </span>
            );
          }

          return (
            <Link
              key={tab.key}
              href={projectSectionTabHref(workspaceSlug, projectId, tab)}
              className={cn(
                "rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
