"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { WorkflowBackLink } from "@/components/layout/workflow-back-link";
import { IconArrowLeft, IconClose } from "@/lib/icons";
import { withProjectIdQuery } from "@/lib/project-scope";
import { cn } from "@/lib/utils";
import {
  projectOverviewHref,
  rememberWorkflowStep,
} from "@/lib/workflow-navigation";
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

export type ProjectSectionTabKey =
  | (typeof PROJECT_SECTION_TABS)[number]["key"]
  | "paid-ads";

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

const MANAGE_TAB_KEYS = new Set(["settings", "share", "paid-ads"]);

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
  if (
    tab.href === "edit" ||
    tab.href === "sharing" ||
    tab.href === "paid-ads"
  ) {
    return workspacePath(workspaceSlug, "projects", projectId, tab.href);
  }
  return withProjectIdQuery(
    workspaceNavPath(workspaceSlug, tab.href!),
    projectId,
  );
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
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const tabs = [
    ...PROJECT_SECTION_TABS.slice(0, 6),
    ...(showPaidAds
      ? [{ key: "paid-ads" as const, label: "Paid ads", href: "paid-ads" }]
      : []),
    ...PROJECT_SECTION_TABS.slice(6),
  ];
  const activeLabel =
    tabs.find((tab) => tab.key === activeTab)?.label ?? "Project";
  const workTabs = tabs.filter((tab) => !MANAGE_TAB_KEYS.has(tab.key));
  const manageTabs = tabs.filter((tab) => MANAGE_TAB_KEYS.has(tab.key));

  useEffect(() => {
    if (!sectionsOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSectionsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [sectionsOpen]);

  return (
    <>
      {showHeader ? (
        <div className="mb-1.5 flex min-w-0 items-center gap-1 md:hidden">
          {activeTab !== "overview" ? (
            <WorkflowBackLink
              href={projectOverviewHref(workspaceSlug, projectId)}
              mode="stack"
              ariaLabel="Back to project"
              className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              <IconArrowLeft size={16} />
            </WorkflowBackLink>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[15px] leading-tight font-semibold text-[var(--color-ink)]">
            {`${projectName} · ${activeLabel}`}
          </p>
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-canvas)] focus-ring"
            aria-haspopup="dialog"
            aria-expanded={sectionsOpen}
            aria-label="Project sections"
            onClick={() => setSectionsOpen(true)}
          >
            Sections
          </button>
        </div>
      ) : null}

      {showHeader ? (
        <div className="hidden md:block">
          <PageHeader
            title={projectName}
            description={
              projectReference ? `Reference ${projectReference}` : undefined
            }
            actions={actions}
          />
        </div>
      ) : null}

      <nav
        className="mb-5 hidden flex-wrap gap-2 md:flex"
        aria-label="Project sections"
      >
        {tabs.map((tab) => (
          <SectionLink
            key={tab.key}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            tab={tab}
            active={tab.key === activeTab}
          />
        ))}
      </nav>

      {sectionsOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0f172a]/40"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setSectionsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Project sections"
            className="absolute inset-x-0 bottom-0 flex max-h-[min(80dvh,32rem)] flex-col rounded-t-2xl border border-[var(--color-line)] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-[var(--color-ink)]">
                  {projectName}
                </p>
                {projectReference ? (
                  <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                    Reference {projectReference}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
                aria-label="Close project sections"
                onClick={() => setSectionsOpen(false)}
              >
                <IconClose size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              <ul className="flex flex-col">
                {workTabs.map((tab) => (
                  <li key={tab.key}>
                    <SectionLink
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      tab={tab}
                      active={tab.key === activeTab}
                      sheet
                      onNavigate={() => setSectionsOpen(false)}
                    />
                  </li>
                ))}
              </ul>
              {manageTabs.length > 0 ? (
                <>
                  <p className="px-2 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-[var(--color-ink-muted)] uppercase">
                    Manage
                  </p>
                  <ul className="flex flex-col">
                    {manageTabs.map((tab) => (
                      <li key={tab.key}>
                        <SectionLink
                          workspaceSlug={workspaceSlug}
                          projectId={projectId}
                          tab={tab}
                          active={tab.key === activeTab}
                          sheet
                          onNavigate={() => setSectionsOpen(false)}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {actions ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-2 pt-3">
                  {actions}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SectionLink({
  workspaceSlug,
  projectId,
  tab,
  active,
  sheet = false,
  onNavigate,
}: {
  workspaceSlug: string;
  projectId: string;
  tab: { key: string; label: string; href?: string };
  active: boolean;
  sheet?: boolean;
  onNavigate?: () => void;
}) {
  if (active) {
    return (
      <span
        aria-current="page"
        className={cn(
          sheet
            ? "flex min-h-11 items-center rounded-md bg-[var(--color-brand-50)] px-2 text-[15px] font-medium text-[var(--color-brand-700)]"
            : "rounded-md bg-[var(--color-brand-50)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-brand-700)]",
        )}
      >
        {tab.label}
      </span>
    );
  }

  return (
    <Link
      href={projectSectionTabHref(workspaceSlug, projectId, tab)}
      onClick={() => {
        rememberWorkflowStep(
          `${window.location.pathname}${window.location.search}`,
        );
        onNavigate?.();
      }}
      className={cn(
        sheet
          ? "flex min-h-11 items-center rounded-md px-2 text-[15px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
          : "rounded-md border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
      )}
    >
      {tab.label}
    </Link>
  );
}
