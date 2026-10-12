import { describe, expect, it } from "vitest";

import {
  leadDetailHref,
  leadEditHref,
  nearestLeadListPage,
} from "@/lib/lead-list-context";
import { createOpportunityHref } from "@/lib/opportunity-link-flow";
import { workspacePath } from "@/lib/workspace-paths";
import {
  appendReturnTo,
  noteWorkflowArrival,
  planWorkflowParentBack,
  planWorkflowStackBack,
  projectLeadsHref,
  projectOverviewHref,
  readSafeWorkflowHref,
  rememberWorkflowStep,
  withFocusedLead,
  withoutFocus,
  workflowBackLabel,
  WORKFLOW_STACK_KEY,
  type WorkflowStorage,
} from "@/lib/workflow-navigation";

function memoryStorage(): WorkflowStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function parentOf(href: string): string {
  return (
    new URL(href, "http://workflow.invalid").searchParams.get("returnTo") ?? ""
  );
}

describe("workflow navigation", () => {
  it("steps back one level through project, filtered leads, lead, and edit", () => {
    const storage = memoryStorage();
    const project = projectOverviewHref("demo", "vista");
    const list = `${projectLeadsHref("demo", "vista")}?page=4&statusId=called&sort=name&dir=asc`;
    const listWithFocus = withFocusedLead(list, "lead-9");
    const lead = leadDetailHref("demo", "lead-9", listWithFocus);
    const edit = leadEditHref("demo", "lead-9", lead);
    const activity = appendReturnTo(
      `${workspacePath("demo", "activities", "new")}?leadId=lead-9`,
      lead,
    );
    const opportunity = appendReturnTo(
      createOpportunityHref("demo", { leadId: "lead-9", lockLead: true }),
      lead,
    );

    rememberWorkflowStep(project, storage);
    rememberWorkflowStep(listWithFocus, storage);
    rememberWorkflowStep(lead, storage);

    expect(parentOf(lead)).toContain("/w/demo/projects/vista/leads");
    expect(parentOf(lead)).toContain("page=4");
    expect(parentOf(lead)).toContain("statusId=called");
    expect(parentOf(lead)).toContain("focus=lead-9");
    expect(parentOf(lead).startsWith("/w/demo/leads")).toBe(false);
    expect(parentOf(edit)).toBe(lead);
    expect(parentOf(activity)).toBe(lead);
    expect(parentOf(opportunity)).toBe(lead);
    expect(workflowBackLabel(project, "demo")).toBe("Back to project");
    expect(workflowBackLabel(list, "demo")).toBe("Back to leads");
    expect(workflowBackLabel(lead, "demo")).toBe("Back to lead");

    expect(planWorkflowParentBack(lead, storage)).toEqual({
      action: "history",
      href: lead,
    });
    expect(planWorkflowParentBack(listWithFocus, storage)).toEqual({
      action: "history",
      href: listWithFocus,
    });
    expect(planWorkflowStackBack(project, storage)).toEqual({
      action: "history",
      href: project,
    });
    expect(planWorkflowStackBack(project, storage)).toEqual({
      action: "push",
      href: project,
    });
  });

  it("returns edit saves to the lead and deletes back to the same list page", () => {
    const storage = memoryStorage();
    const list = "/w/acme/projects/harbour/leads?page=4&search=ada";
    const focused = withFocusedLead(list, "lead-2");
    const lead = leadDetailHref("acme", "lead-2", focused);
    const edit = leadEditHref("acme", "lead-2", lead);

    rememberWorkflowStep(focused, storage);
    rememberWorkflowStep(lead, storage);

    expect(parentOf(edit)).toBe(lead);
    expect(parentOf(edit)).not.toBe(list);
    expect(planWorkflowParentBack(parentOf(edit), storage).action).toBe(
      "history",
    );

    const removal = withoutFocus(focused);
    expect(removal).toBe(list);
    expect(removal).not.toContain("focus=");
    expect(planWorkflowParentBack(removal, storage).action).toBe("history");
    expect(nearestLeadListPage(4, 100, 25)).toBe(4);
    expect(nearestLeadListPage(4, 75, 25)).toBe(3);
    expect(nearestLeadListPage(4, 0, 25)).toBe(1);
  });

  it("pops the stack when browser Back lands on the stored parent", () => {
    const storage = memoryStorage();
    const list = "/w/demo/projects/vista/leads?page=4";
    const focused = withFocusedLead(list, "lead-9");
    rememberWorkflowStep(projectOverviewHref("demo", "vista"), storage);
    rememberWorkflowStep(focused, storage);

    noteWorkflowArrival(list, storage);
    expect(JSON.parse(storage.getItem(WORKFLOW_STACK_KEY) ?? "[]")).toEqual([
      "/w/demo/projects/vista",
    ]);
  });

  it("does not history-back to a project when another screen is the armed parent", () => {
    const storage = memoryStorage();
    const project = projectOverviewHref("demo", "vista");
    const properties = `${project}/properties`;
    const leads = projectLeadsHref("demo", "vista");

    rememberWorkflowStep(project, storage);
    rememberWorkflowStep(properties, storage);
    noteWorkflowArrival(leads, storage);

    expect(planWorkflowStackBack(project, storage)).toEqual({
      action: "push",
      href: project,
    });
    expect(JSON.parse(storage.getItem(WORKFLOW_STACK_KEY) ?? "[]")).toEqual([
      project,
      properties,
    ]);
  });

  it("drops history back after the user leaves the funnel screen", () => {
    const storage = memoryStorage();
    const list = "/w/demo/projects/vista/leads?page=4";
    const lead = leadDetailHref("demo", "lead-9", list);

    rememberWorkflowStep(list, storage);
    noteWorkflowArrival(lead, storage);
    noteWorkflowArrival("/w/demo/settings", storage);

    expect(planWorkflowParentBack(list, storage)).toEqual({
      action: "push",
      href: list,
    });
  });

  it("re-arms the project after browser Back returns to its lead list", () => {
    const storage = memoryStorage();
    const project = projectOverviewHref("demo", "vista");
    const list = `${projectLeadsHref("demo", "vista")}?page=4`;
    const lead = leadDetailHref("demo", "lead-9", list);

    rememberWorkflowStep(project, storage);
    rememberWorkflowStep(list, storage);
    noteWorkflowArrival(lead, storage);
    noteWorkflowArrival(list, storage);

    expect(planWorkflowStackBack(project, storage)).toEqual({
      action: "history",
      href: project,
    });
  });

  it("rejects external and cross-workspace return targets", () => {
    expect(
      readSafeWorkflowHref("https://evil.example/w/demo/leads", "demo"),
    ).toBeNull();
    expect(
      readSafeWorkflowHref("//evil.example/w/demo/leads", "demo"),
    ).toBeNull();
    expect(readSafeWorkflowHref("/w/other/leads?page=4", "demo")).toBeNull();
    expect(readSafeWorkflowHref("/w/demo/leads?page=4", "demo")).toBe(
      "/w/demo/leads?page=4",
    );
    expect(
      readSafeWorkflowHref("/w/demo/projects/vista/leads?page=4", "demo"),
    ).toContain("/projects/vista/leads");
  });
});
