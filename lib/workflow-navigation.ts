import { workspacePath } from "@/lib/workspace-paths";

/**
 * One-step memory for the CRM funnel.
 *
 * Each forward move stores only its immediate parent and arms that parent as
 * the only history.back() target. In-app Back uses history only while that
 * armed parent is still the top of the stack. A later screen, a pasted link,
 * or a stack entry left from another project falls back to the labeled URL.
 * The parent URL can itself carry a returnTo, so Project → Leads → Lead →
 * Edit unwinds one screen at a time.
 */

export const WORKFLOW_STACK_KEY = "evocrm:workflow-stack";
export const LEAD_FOCUS_PARAM = "focus";
const FOCUS_STORAGE_PREFIX = "evocrm:lead-list-focus:";
const PENDING_KEY = "evocrm:workflow-pending";
const PENDING_OWNER_KEY = "evocrm:workflow-pending-owner";
const PENDING_ARMED_KEY = "evocrm:workflow-pending-armed";
const STACK_LIMIT = 30;

const BASE = "http://workflow.invalid";

export type WorkflowStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type WorkflowRouter = {
  back: () => void;
  push: (href: string) => void;
  replace: (href: string) => void;
};

export type WorkflowStepPlan = {
  action: "history" | "push";
  href: string;
};

function browserStorage(): WorkflowStorage | null {
  try {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    return sessionStorage;
  } catch {
    return null;
  }
}

function parseWorkflowUrl(href: string): URL | null {
  if (!href || href.includes("\\")) {
    return null;
  }
  try {
    const url = new URL(href, BASE);
    if (url.origin !== BASE || url.username || url.password) {
      return null;
    }
    if (!url.pathname.startsWith("/")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function normalizeWorkflowHref(href: string): string | null {
  const url = parseWorkflowUrl(href.trim());
  if (!url) {
    return null;
  }
  const sorted = new URLSearchParams();
  const keys = [...new Set([...url.searchParams.keys()])].sort();
  for (const key of keys) {
    for (const value of url.searchParams.getAll(key)) {
      sorted.append(key, value);
    }
  }
  const query = sorted.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function isSafeWorkflowHref(
  value: string | null | undefined,
  workspaceSlug: string,
): boolean {
  return readSafeWorkflowHref(value, workspaceSlug) !== null;
}

/** Same-workspace in-app path. Rejects other origins, workspaces, and protocol-relative URLs. */
export function readSafeWorkflowHref(
  value: string | null | undefined,
  workspaceSlug: string,
): string | null {
  if (!value || !workspaceSlug.trim()) {
    return null;
  }
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return null;
  }
  const url = parseWorkflowUrl(trimmed);
  if (!url) {
    return null;
  }
  const prefix = `/w/${workspaceSlug}/`;
  if (
    url.pathname !== `/w/${workspaceSlug}` &&
    !url.pathname.startsWith(prefix)
  ) {
    return null;
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function appendReturnTo(href: string, returnTo: string): string {
  const url = parseWorkflowUrl(href);
  if (!url) {
    return href;
  }
  url.searchParams.set("returnTo", returnTo);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function withFocusedLead(listHref: string, leadId: string): string {
  const url = parseWorkflowUrl(listHref);
  if (!url || !leadId.trim()) {
    return listHref;
  }
  url.searchParams.set(LEAD_FOCUS_PARAM, leadId.trim());
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function withoutFocus(href: string): string {
  const url = parseWorkflowUrl(href);
  if (!url) {
    return href;
  }
  url.searchParams.delete(LEAD_FOCUS_PARAM);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function readFocusedLead(href: string): string | null {
  const url = parseWorkflowUrl(href);
  const focus = url?.searchParams.get(LEAD_FOCUS_PARAM)?.trim();
  return focus || null;
}

export function sameWorkflowPlace(left: string, right: string): boolean {
  const a = normalizeWorkflowHref(left);
  const b = normalizeWorkflowHref(right);
  if (!a || !b) {
    return false;
  }
  return a === b || withoutFocus(a) === withoutFocus(b);
}

export function projectOverviewHref(
  workspaceSlug: string,
  projectId: string,
): string {
  return workspacePath(workspaceSlug, "projects", projectId);
}

export function projectLeadsHref(
  workspaceSlug: string,
  projectId: string,
): string {
  return workspacePath(workspaceSlug, "projects", projectId, "leads");
}

/**
 * Immediate parent of a lead. A stored returnTo wins. Otherwise the lead's
 * own project leads list — never the workspace-wide list when a project exists.
 */
export function leadStepBackHref(args: {
  workspaceSlug: string;
  projectId?: string | null;
  returnTo?: string | null;
}): string {
  const safe = readSafeWorkflowHref(args.returnTo, args.workspaceSlug);
  if (safe) {
    return safe;
  }
  if (args.projectId) {
    return projectLeadsHref(args.workspaceSlug, args.projectId);
  }
  return workspacePath(args.workspaceSlug, "leads");
}

export function workflowBackLabel(href: string, workspaceSlug: string): string {
  const url = parseWorkflowUrl(href);
  if (!url) {
    return "Back";
  }
  const prefix = `/w/${workspaceSlug}/`;
  if (!url.pathname.startsWith(prefix)) {
    return "Back";
  }
  const rest = url.pathname.slice(prefix.length);
  if (/^projects\/[^/]+$/.test(rest)) {
    return "Back to project";
  }
  if (rest === "leads" || /^projects\/[^/]+\/leads$/.test(rest)) {
    return "Back to leads";
  }
  if (/^leads\/[^/]+$/.test(rest)) {
    return "Back to lead";
  }
  if (/^leads\/[^/]+\/edit$/.test(rest)) {
    return "Back to lead";
  }
  if (rest === "pipeline" || rest === "opportunities") {
    return "Back to pipeline";
  }
  if (/^opportunities\/new$/.test(rest)) {
    return "Back to opportunity";
  }
  if (/^opportunities\/[^/]+$/.test(rest)) {
    return "Back to opportunity";
  }
  if (rest === "activities" || rest.startsWith("activities/")) {
    return "Back to activities";
  }
  if (/^properties\/[^/]+$/.test(rest)) {
    return "Back to property";
  }
  return "Back";
}

function readStack(storage: WorkflowStorage): string[] {
  const raw = storage.getItem(WORKFLOW_STACK_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.startsWith("/"),
    );
  } catch {
    return [];
  }
}

function writeStack(storage: WorkflowStorage, stack: string[]): void {
  storage.setItem(
    WORKFLOW_STACK_KEY,
    JSON.stringify(stack.slice(-STACK_LIMIT)),
  );
}

function sameWorkflowPath(left: string, right: string): boolean {
  const a = parseWorkflowUrl(left)?.pathname;
  const b = parseWorkflowUrl(right)?.pathname;
  return Boolean(a && b && a === b);
}

function armForward(storage: WorkflowStorage, parentHref: string): void {
  storage.setItem(PENDING_KEY, parentHref);
  storage.removeItem(PENDING_OWNER_KEY);
  storage.setItem(PENDING_ARMED_KEY, "1");
}

function retainPending(
  storage: WorkflowStorage,
  parentHref: string,
  ownerHref: string,
): void {
  storage.setItem(PENDING_KEY, parentHref);
  storage.setItem(PENDING_OWNER_KEY, ownerHref);
  storage.removeItem(PENDING_ARMED_KEY);
}

function clearPending(storage: WorkflowStorage): void {
  storage.removeItem(PENDING_KEY);
  storage.removeItem(PENDING_OWNER_KEY);
  storage.removeItem(PENDING_ARMED_KEY);
}

/**
 * history.back() is valid only when the stored parent is still the stack top
 * and it is the parent this forward move armed. Otherwise the caller must
 * open the labeled href.
 */
function takeHistoryBack(
  expectedParent: string,
  storage: WorkflowStorage,
): boolean {
  const pending = storage.getItem(PENDING_KEY);
  if (!pending || !sameWorkflowPlace(pending, expectedParent)) {
    return false;
  }
  const stack = readStack(storage);
  const top = stack[stack.length - 1];
  if (!top || !sameWorkflowPlace(top, expectedParent)) {
    return false;
  }
  stack.pop();
  writeStack(storage, stack);
  const nextParent = stack[stack.length - 1];
  if (nextParent) {
    retainPending(storage, nextParent, expectedParent);
  } else {
    clearPending(storage);
  }
  return true;
}

export function rememberWorkflowStep(
  parentHref: string,
  storage: WorkflowStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  const normalized = normalizeWorkflowHref(parentHref);
  if (!normalized) {
    return;
  }
  const stack = readStack(storage);
  const top = stack[stack.length - 1];
  if (top && sameWorkflowPlace(top, normalized)) {
    if (top !== normalized) {
      stack[stack.length - 1] = normalized;
      writeStack(storage, stack);
    }
    armForward(storage, normalized);
    return;
  }
  stack.push(normalized);
  writeStack(storage, stack);
  armForward(storage, normalized);
}

export function noteWorkflowArrival(
  currentHref: string,
  storage: WorkflowStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  const current = normalizeWorkflowHref(currentHref);
  if (!current) {
    return;
  }
  const stack = readStack(storage);
  const top = stack[stack.length - 1];
  if (top && sameWorkflowPlace(top, current)) {
    stack.pop();
    writeStack(storage, stack);
    const parent = stack[stack.length - 1];
    if (parent) {
      retainPending(storage, parent, current);
    } else {
      clearPending(storage);
    }
    return;
  }
  if (storage.getItem(PENDING_ARMED_KEY) === "1") {
    storage.removeItem(PENDING_ARMED_KEY);
    storage.setItem(PENDING_OWNER_KEY, current);
    return;
  }
  const owner = storage.getItem(PENDING_OWNER_KEY);
  if (owner && sameWorkflowPath(owner, current)) {
    return;
  }
  clearPending(storage);
}

export function peekWorkflowStep(
  storage: WorkflowStorage | null = browserStorage(),
): string | null {
  if (!storage) {
    return null;
  }
  const stack = readStack(storage);
  return stack[stack.length - 1] ?? null;
}

export function planWorkflowParentBack(
  expectedParent: string,
  storage: WorkflowStorage | null = browserStorage(),
): WorkflowStepPlan {
  const fallback =
    readSafeWorkflowHref(
      expectedParent,
      expectedParentWorkspace(expectedParent),
    ) ?? expectedParent;
  if (storage && takeHistoryBack(fallback, storage)) {
    return { action: "history", href: fallback };
  }
  return { action: "push", href: fallback };
}

/**
 * Section Back. History only when the labeled fallback is the armed parent.
 * Any other stored screen is left in place and the fallback URL is opened.
 */
export function planWorkflowStackBack(
  fallbackHref: string,
  storage: WorkflowStorage | null = browserStorage(),
): WorkflowStepPlan {
  if (storage && takeHistoryBack(fallbackHref, storage)) {
    return { action: "history", href: fallbackHref };
  }
  return { action: "push", href: fallbackHref };
}

function expectedParentWorkspace(href: string): string {
  const match = href.match(/^\/w\/([^/]+)\//);
  return match?.[1] ?? "";
}

export function performWorkflowStepBack(
  router: WorkflowRouter,
  expectedParent: string,
  options?: { fallback?: "push" | "replace"; storage?: WorkflowStorage | null },
): void {
  const plan = planWorkflowParentBack(
    expectedParent,
    options?.storage ?? browserStorage(),
  );
  if (plan.action === "history") {
    router.back();
    return;
  }
  if (options?.fallback === "replace") {
    router.replace(plan.href);
    return;
  }
  router.push(plan.href);
}

export function rememberFocusedLead(
  listHref: string,
  leadId: string,
  storage: WorkflowStorage | null = browserStorage(),
): void {
  if (!storage || !leadId.trim()) {
    return;
  }
  const key = normalizeWorkflowHref(withoutFocus(listHref));
  if (!key) {
    return;
  }
  storage.setItem(FOCUS_STORAGE_PREFIX + key, leadId.trim());
}

export function readRememberedFocusedLead(
  listHref: string,
  storage: WorkflowStorage | null = browserStorage(),
): string | null {
  if (!storage) {
    return null;
  }
  const key = normalizeWorkflowHref(withoutFocus(listHref));
  if (!key) {
    return null;
  }
  const value = storage.getItem(FOCUS_STORAGE_PREFIX + key)?.trim();
  return value || null;
}

export function clearRememberedFocusedLead(
  listHref: string,
  storage: WorkflowStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  const key = normalizeWorkflowHref(withoutFocus(listHref));
  if (!key) {
    return;
  }
  storage.removeItem(FOCUS_STORAGE_PREFIX + key);
}
