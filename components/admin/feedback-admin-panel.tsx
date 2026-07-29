"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  FEEDBACK_CATEGORIES,
  getFeedbackCategoryLabel,
  isTrustedFeedbackPageUrl,
  type FeedbackCategory,
} from "@/lib/feedback";
import { IconImage, IconMore } from "@/lib/icons";

type FeedbackStatus = "open" | "resolved";

type FeedbackListItem = {
  id: string;
  category: FeedbackCategory;
  body: string;
  status: FeedbackStatus;
  userEmail: string;
  userName: string | null;
  workspaceName: string | null;
  pageUrl: string | null;
  screenshotCount: number;
  screenshots: Array<{
    filename: string;
    sizeBytes: number;
    contentType: string;
  }>;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  resolutionNotifiedAt?: string | null;
  resolutionNotifiedEmail?: string | null;
  resolutionNotificationStatus?: "sent" | "failed" | null;
  resolutionNotificationError?: string | null;
  userAgent?: string | null;
  projectId?: string | null;
};

type FeedbackSummary = {
  open: number;
  resolved: number;
  total: number;
  byCategory: Record<FeedbackCategory, number>;
};

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function FeedbackScreenshotImage({
  feedbackId,
  index,
  filename,
}: {
  feedbackId: string;
  index: number;
  filename: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/feedback/${feedbackId}/screenshots/${index}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load screenshot");
        }
        const blob = await response.blob();
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (active) {
          setError(true);
        }
      }
    }

    void load();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [feedbackId, index]);

  if (error) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-muted)] text-[12px] text-[var(--color-ink-muted)]">
        Could not load image
      </div>
    );
  }

  if (!src) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-muted)] text-[12px] text-[var(--color-ink-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[var(--color-line)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={filename} className="h-28 w-full object-cover" />
    </a>
  );
}

export function FeedbackAdminPanel() {
  const [items, setItems] = useState<FeedbackListItem[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("open");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackCategory>("all");
  const [selected, setSelected] = useState<FeedbackListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedbackListItem | null>(null);
  const [resolveTarget, setResolveTarget] = useState<FeedbackListItem | null>(null);
  const [resolveEmail, setResolveEmail] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolvePending, setResolvePending] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (categoryFilter !== "all") {
      params.set("category", categoryFilter);
    }
    if (debouncedSearch) {
      params.set("q", debouncedSearch);
    }

    try {
      const response = await fetch(`/api/admin/feedback?${params.toString()}`);
      const payload = (await response.json()) as {
        data?: {
          items: FeedbackListItem[];
          total: number;
          summary: FeedbackSummary;
        };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load feedback.");
      }

      setItems(payload.data?.items ?? []);
      setTotal(payload.data?.total ?? 0);
      setSummary(payload.data?.summary ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load feedback.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const summaryLine = useMemo(() => {
    if (!summary) {
      return null;
    }

    return `${total} shown · ${summary.open} open · ${summary.resolved} resolved · ${summary.byCategory.bug} bugs · ${summary.byCategory.idea} ideas · ${summary.byCategory.other} other`;
  }, [summary, total]);

  async function updateStatus(
    item: FeedbackListItem,
    status: FeedbackStatus,
    notifyEmail?: string,
  ) {
    const response = await fetch(`/api/admin/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(notifyEmail ? { notifyEmail } : {}),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? "Could not update feedback status.");
    }

    const payload = (await response.json()) as { data?: FeedbackListItem };
    const updated = payload.data;

    if (updated) {
      setSelected((current) => (current?.id === updated.id ? updated : current));
      await loadFeedback();
    }
  }

  function openResolveModal(item: FeedbackListItem) {
    setResolveTarget(item);
    setResolveEmail(item.userEmail?.trim() ?? "");
    setResolveError(null);
  }

  async function confirmResolve() {
    if (!resolveTarget) {
      return;
    }

    const email = resolveEmail.trim();
    if (!email) {
      setResolveError("Reporter email is required to send the resolution notification.");
      return;
    }

    setResolvePending(true);
    setResolveError(null);

    try {
      await updateStatus(resolveTarget, "resolved", email);
      setResolveTarget(null);
      setResolveEmail("");
    } catch (resolveFailure) {
      setResolveError(
        resolveFailure instanceof Error
          ? resolveFailure.message
          : "Could not mark feedback as resolved.",
      );
    } finally {
      setResolvePending(false);
    }
  }

  async function reopenFeedback(item: FeedbackListItem) {
    try {
      await updateStatus(item, "open");
      setError(null);
    } catch (reopenFailure) {
      setError(
        reopenFailure instanceof Error
          ? reopenFailure.message
          : "Could not reopen feedback.",
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const response = await fetch(`/api/admin/feedback/${deleteTarget.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Could not delete feedback.");
      return;
    }

    setDeleteTarget(null);
    setSelected((current) => (current?.id === deleteTarget.id ? null : current));
    await loadFeedback();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "open", "resolved"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={[
                "rounded-full border px-3 py-1.5 text-[12px] font-medium",
                statusFilter === value
                  ? "border-[var(--color-brand-600)] bg-[color-mix(in_srgb,var(--color-brand-600)_8%,white)] text-[var(--color-brand-700)]"
                  : "border-[var(--color-line)] text-[var(--color-ink-muted)]",
              ].join(" ")}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search body or reporter email"
            className="sm:w-72"
          />
          <Select
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value as "all" | FeedbackCategory)
            }
          >
            <option value="all">All categories</option>
            {FEEDBACK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {getFeedbackCategoryLabel(category)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {summaryLine && (
        <p className="text-[12px] text-[var(--color-ink-muted)]">{summaryLine}</p>
      )}

      {error && (
        <p className="text-[12px] text-[var(--color-danger-fg)]" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[12px]">
          <thead className="border-b border-[var(--color-line)] bg-[var(--color-canvas)] text-[var(--color-ink-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Reporter</th>
              <th className="px-3 py-2 font-medium">Workspace</th>
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--color-ink-muted)]">
                  Loading feedback…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--color-ink-muted)]">
                  No feedback matches these filters.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[var(--color-line)] hover:bg-[var(--color-canvas)] cursor-pointer"
                  onClick={() => setSelected(item)}
                >
                  <td className="px-3 py-3 align-top whitespace-nowrap">{formatWhen(item.createdAt)}</td>
                  <td className="px-3 py-3 align-top">
                    <Badge>{getFeedbackCategoryLabel(item.category)}</Badge>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div>{item.userEmail}</div>
                    {item.userName && (
                      <div className="text-[var(--color-ink-muted)]">{item.userName}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">{item.workspaceName ?? "—"}</td>
                  <td className="px-3 py-3 align-top max-w-xs">
                    <p className="line-clamp-3">{item.body || "—"}</p>
                    {item.screenshotCount > 0 && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[11px]">
                        <IconImage size={11} />
                        {item.screenshotCount}
                      </span>
                    )}
                    {item.pageUrl && (
                      <p className="mt-1 truncate text-[var(--color-ink-muted)]">{item.pageUrl}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Badge tone={item.status === "open" ? "warn" : "success"}>
                      {item.status}
                    </Badge>
                    {item.resolvedByEmail && (
                      <p className="mt-1 text-[var(--color-ink-muted)]">{item.resolvedByEmail}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top relative">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)] focus-ring"
                      onClick={(event) => {
                        event.stopPropagation();
                        setActionMenuId((current) => (current === item.id ? null : item.id));
                      }}
                    >
                      <IconMore size={14} />
                    </button>
                    {actionMenuId === item.id && (
                      <div className="absolute right-3 top-10 z-10 min-w-36 rounded-lg border border-[var(--color-line)] bg-white p-1 shadow-[var(--shadow-md)]">
                        <button
                          type="button"
                          className="block w-full rounded-md px-3 py-2 text-left hover:bg-[var(--color-muted)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected(item);
                            setActionMenuId(null);
                          }}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-3 py-2 text-left hover:bg-[var(--color-muted)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            item.status === "open"
                              ? openResolveModal(item)
                              : void reopenFeedback(item);
                            setActionMenuId(null);
                          }}
                        >
                          {item.status === "open" ? "Mark resolved" : "Reopen"}
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-3 py-2 text-left text-[var(--color-danger-fg)] hover:bg-[var(--color-muted)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(item);
                            setActionMenuId(null);
                          }}
                        >
                          Delete…
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Feedback details"
        className="w-[min(100%,480px)]"
        footer={
          selected ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  selected.status === "open"
                    ? openResolveModal(selected)
                    : void reopenFeedback(selected)
                }
              >
                {selected.status === "open" ? "Mark resolved" : "Reopen"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(selected)}>
                Delete
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{getFeedbackCategoryLabel(selected.category)}</Badge>
              <Badge tone={selected.status === "open" ? "warn" : "success"}>
                {selected.status}
              </Badge>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                Reporter
              </p>
              <p className="text-[13px]">{selected.userEmail}</p>
              {selected.userName && (
                <p className="text-[12px] text-[var(--color-ink-muted)]">{selected.userName}</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                Workspace
              </p>
              <p className="text-[13px]">{selected.workspaceName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                Message
              </p>
              <p className="whitespace-pre-wrap text-[13px]">{selected.body || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                Submitted
              </p>
              <p className="text-[13px]">{formatWhen(selected.createdAt)}</p>
            </div>
            {selected.status === "resolved" && selected.resolvedAt ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Resolved
                </p>
                <p className="text-[13px]">{formatWhen(selected.resolvedAt)}</p>
                {selected.resolvedByEmail ? (
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    by {selected.resolvedByEmail}
                  </p>
                ) : null}
              </div>
            ) : null}
            {selected.pageUrl && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Page URL
                </p>
                {isTrustedFeedbackPageUrl(
                  selected.pageUrl,
                  process.env.NEXT_PUBLIC_APP_URL ?? "",
                ) ? (
                  <a
                    href={selected.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-[13px] text-[var(--color-brand-700)]"
                  >
                    {selected.pageUrl}
                  </a>
                ) : (
                  <p className="break-all text-[13px] text-[var(--color-ink-muted)]">
                    {selected.pageUrl}
                  </p>
                )}
              </div>
            )}
            {selected.userAgent && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  User agent
                </p>
                <p className="font-mono text-[11px] break-all text-[var(--color-ink-muted)]">
                  {selected.userAgent}
                </p>
              </div>
            )}
            {selected.projectId && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Project
                </p>
                <p className="font-mono text-[12px] text-[var(--color-ink)]">{selected.projectId}</p>
              </div>
            )}
            {selected.resolutionNotificationStatus && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                  Resolution notification
                </p>
                <p className="text-[13px] capitalize">{selected.resolutionNotificationStatus}</p>
                {selected.resolutionNotifiedEmail && (
                  <p className="text-[12px] text-[var(--color-ink-muted)]">
                    Sent to {selected.resolutionNotifiedEmail}
                    {selected.resolutionNotifiedAt
                      ? ` · ${formatWhen(selected.resolutionNotifiedAt)}`
                      : ""}
                  </p>
                )}
                {selected.resolutionNotificationError && (
                  <p className="text-[12px] text-[var(--color-danger-fg)]">
                    {selected.resolutionNotificationError}
                  </p>
                )}
              </div>
            )}
            {selected.screenshotCount > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {selected.screenshots.map((screenshot, index) => (
                  <FeedbackScreenshotImage
                    key={`${selected.id}-${index}`}
                    feedbackId={selected.id}
                    index={index}
                    filename={screenshot.filename}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={!!resolveTarget}
        onClose={() => {
          if (!resolvePending) {
            setResolveTarget(null);
            setResolveError(null);
          }
        }}
        title="Mark feedback resolved?"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={resolvePending}
              onClick={() => setResolveTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={resolvePending} onClick={() => void confirmResolve()}>
              {resolvePending ? "Sending…" : "Mark resolved & notify"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            The reporter will receive an email and an in-app notification that their bug or
            feedback has been solved. Feedback status will not change if the email cannot be sent.
          </p>
          <div>
            <label
              htmlFor="resolve-email"
              className="mb-1 block text-[12px] font-medium text-[var(--color-ink-muted)]"
            >
              Reporter email
            </label>
            <Input
              id="resolve-email"
              type="email"
              value={resolveEmail}
              onChange={(event) => setResolveEmail(event.target.value)}
              placeholder="reporter@example.com"
              required
            />
            {!resolveTarget?.userEmail && (
              <p className="mt-1 text-[12px] text-[var(--color-warning-fg,#b45309)]">
                No reporter email on file. Enter one to send the resolution notification.
              </p>
            )}
          </div>
          {resolveError && (
            <p className="text-[12px] text-[var(--color-danger-fg)]" role="alert">
              {resolveError}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete feedback?"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          This permanently removes the feedback row and screenshots. The audit log will retain a
          deletion record.
        </p>
      </Modal>
    </div>
  );
}
