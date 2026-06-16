"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconPlus } from "@/lib/icons";
import { formatDnsHostFqdn } from "@/lib/sending-domain-dns";

type DnsRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  priority: number | null;
  ttl: string | null;
  status: "missing" | "pending" | "valid" | "invalid";
};

type SendingDomain = {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed" | "needs_attention";
  spfStatus: DnsRecord["status"];
  dkimStatus: DnsRecord["status"];
  dmarcStatus: DnsRecord["status"];
  defaultSenderEmail: string | null;
  dnsRecords: DnsRecord[];
  lastCheckedAt: string | null;
  verifiedAt: string | null;
};

const STATUS_LABELS: Record<SendingDomain["status"], string> = {
  pending: "DNS pending",
  verified: "Domain ready",
  failed: "Verification failed",
  needs_attention: "Needs attention",
};

const STATUS_TONES: Record<SendingDomain["status"], "muted" | "success" | "danger" | "warn"> = {
  pending: "warn",
  verified: "success",
  failed: "danger",
  needs_attention: "warn",
};

const RECORD_STATUS_LABELS: Record<DnsRecord["status"], string> = {
  missing: "Missing",
  pending: "Pending",
  valid: "Valid",
  invalid: "Invalid",
};

const RECORD_STATUS_DOT: Record<DnsRecord["status"], string> = {
  valid: "bg-[var(--color-success)]",
  invalid: "bg-[var(--color-danger)]",
  pending: "bg-[var(--color-warn)]",
  missing: "bg-[var(--color-ink-faint)]",
};

const DOMAIN_STATUS_BANNER: Record<
  SendingDomain["status"],
  { className: string; dotClassName: string; title: string; description: string }
> = {
  verified: {
    className: "border-[var(--color-success-border)] bg-[var(--color-success-bg)]",
    dotClassName: "bg-[var(--color-success)]",
    title: "Domain ready",
    description: "DNS is verified. Campaigns can send from this domain.",
  },
  pending: {
    className: "border-[var(--color-warn-border)] bg-[var(--color-warn-bg)]",
    dotClassName: "bg-[var(--color-warn)]",
    title: "DNS pending",
    description: "Add the DNS records below, then check verification.",
  },
  needs_attention: {
    className: "border-[var(--color-warn-border)] bg-[var(--color-warn-bg)]",
    dotClassName: "bg-[var(--color-warn)]",
    title: "Needs attention",
    description: "Some DNS records are still missing or pending.",
  },
  failed: {
    className: "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]",
    dotClassName: "bg-[var(--color-danger)]",
    title: "Verification failed",
    description: "DNS records did not verify. Review the records below and try again.",
  },
};

function HealthIndicator({
  label,
  status,
}: {
  label: string;
  status: DnsRecord["status"];
}) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-ink)]">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${RECORD_STATUS_DOT[status]}`}
        aria-hidden
      />
      <span>
        {label}: {RECORD_STATUS_LABELS[status]}
      </span>
    </div>
  );
}

type SendingDomainsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

export function SendingDomainsPanel({ workspaceSlug, canUpdate }: SendingDomainsPanelProps) {
  const apiBase = `/api/workspaces/${workspaceSlug}/sending-domains`;
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editSenderEmail, setEditSenderEmail] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const selectedDomain = useMemo(
    () => domains.find((domain) => domain.id === selectedId) ?? null,
    [domains, selectedId],
  );

  useEffect(() => {
    setEditSenderEmail(
      selectedDomain?.defaultSenderEmail ?? (selectedDomain ? `hello@${selectedDomain.domain}` : ""),
    );
  }, [selectedDomain]);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(apiBase);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load sending domains.");
      }

      const nextDomains = payload.data.domains as SendingDomain[];
      setDomains(nextDomains);
      setSelectedId((current) => {
        if (current && nextDomains.some((domain) => domain.id === current)) {
          return current;
        }
        return nextDomains[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  async function handleAddDomain() {
    if (!newDomain.trim()) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not add this domain.");
      }

      const domain = payload.data.domain as SendingDomain;
      setNewDomain("");
      setSelectedId(domain.id);
      setActionMessage("Domain added. Add the DNS records below, then check verification.");
      await loadDomains();
    } catch (submitError) {
      setActionMessage(
        submitError instanceof Error ? submitError.message : "Could not add this domain.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(domainId: string) {
    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${apiBase}/${domainId}/verify`, { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error?.message ??
            "We could not verify this domain yet. Please check that the DNS records below were added exactly as shown.",
        );
      }

      setActionMessage("Verification check started. DNS changes can take time to propagate.");
      await loadDomains();
    } catch (verifyError) {
      setActionMessage(
        verifyError instanceof Error ? verifyError.message : "Could not verify this domain.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh(domainId: string) {
    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${apiBase}/${domainId}/refresh`, { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not refresh domain status.");
      }

      setActionMessage("Domain status refreshed.");
      await loadDomains();
    } catch (refreshError) {
      setActionMessage(
        refreshError instanceof Error ? refreshError.message : "Could not refresh domain status.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyValue(value: string) {
    await navigator.clipboard.writeText(value);
    setActionMessage("Copied to clipboard.");
  }

  async function handleSaveSettings(domainId: string) {
    if (!editSenderEmail.trim()) {
      setActionMessage("Enter a default sender email.");
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${apiBase}/${domainId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSenderEmail: editSenderEmail.trim() }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not save domain settings.");
      }

      setActionMessage("Domain settings saved.");
      await loadDomains();
    } catch (saveError) {
      setActionMessage(
        saveError instanceof Error ? saveError.message : "Could not save domain settings.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch(`${apiBase}/${domainId}`, { method: "DELETE" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not remove this domain.");
      }

      setDeleteModalOpen(false);
      setSelectedId(null);
      setActionMessage("Domain removed.");
      await loadDomains();
    } catch (deleteError) {
      setActionMessage(
        deleteError instanceof Error ? deleteError.message : "Could not remove this domain.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function closeDeleteModal() {
    if (submitting) {
      return;
    }
    setDeleteModalOpen(false);
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Permission denied"
        description="You do not have permission to view sending domains."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load sending domains"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadDomains() }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Add sending domain</h2>
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
              Verify a domain you own so campaigns can send from your business email addresses.
            </p>
            {canUpdate ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newDomain}
                  onChange={(event) => setNewDomain(event.target.value)}
                  placeholder="example.com"
                  aria-label="Domain name"
                />
                <Button onClick={() => void handleAddDomain()} disabled={submitting || !newDomain.trim()}>
                  <IconPlus size={14} />
                  Add domain
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {actionMessage ? (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">{actionMessage}</p>
      ) : null}

      {domains.length === 0 ? (
        <EmptyState
          title="No sending domains yet"
          description="Add and verify a domain before campaigns can send from your business email addresses."
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
          <Card padded={false}>
            <ul className="divide-y divide-[var(--color-line)]">
              {domains.map((domain) => (
                <li key={domain.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(domain.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-[var(--color-canvas)] ${
                      selectedId === domain.id ? "bg-[var(--color-brand-50)]" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{domain.domain}</p>
                      <Badge tone={STATUS_TONES[domain.status]} size="sm" dot>
                        {STATUS_LABELS[domain.status]}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                      {domain.defaultSenderEmail ?? `hello@${domain.domain}`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selectedDomain ? (
            <div className="space-y-4">
              <div
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${DOMAIN_STATUS_BANNER[selectedDomain.status].className}`}
              >
                <span
                  className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${DOMAIN_STATUS_BANNER[selectedDomain.status].dotClassName}`}
                  aria-hidden
                />
                <div>
                  <p className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                    {DOMAIN_STATUS_BANNER[selectedDomain.status].title}
                  </p>
                  <p className="text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                    {DOMAIN_STATUS_BANNER[selectedDomain.status].description}
                  </p>
                </div>
              </div>

              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-[16px] font-semibold text-[var(--color-ink)]">
                      {selectedDomain.domain}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      <HealthIndicator label="SPF" status={selectedDomain.spfStatus} />
                      <HealthIndicator label="DKIM" status={selectedDomain.dkimStatus} />
                      <HealthIndicator label="DMARC" status={selectedDomain.dmarcStatus} />
                    </div>
                    {selectedDomain.lastCheckedAt ? (
                      <p className="text-[12px] text-[var(--color-ink-faint)] mt-1">
                        Last checked {new Date(selectedDomain.lastCheckedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {canUpdate ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleRefresh(selectedDomain.id)}
                        disabled={submitting}
                      >
                        Refresh status
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleVerify(selectedDomain.id)}
                        disabled={submitting}
                      >
                        Check verification
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDeleteModalOpen(true)}
                        disabled={submitting}
                      >
                        Remove domain
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>

              {canUpdate ? (
                <Card>
                  <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">
                    Domain settings
                  </h4>
                  <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
                    Set the default sender address used when campaigns send from this domain.
                  </p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Label htmlFor="default-sender-email">Default sender email</Label>
                      <Input
                        id="default-sender-email"
                        type="email"
                        value={editSenderEmail}
                        onChange={(event) => setEditSenderEmail(event.target.value)}
                        placeholder={`hello@${selectedDomain.domain}`}
                        disabled={submitting}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleSaveSettings(selectedDomain.id)}
                      disabled={submitting || !editSenderEmail.trim()}
                    >
                      Save settings
                    </Button>
                  </div>
                </Card>
              ) : null}

              <Card padded={false}>
                <div className="px-5 py-4 border-b border-[var(--color-line)]">
                  <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">DNS records</h4>
                  <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
                    Add these records exactly as shown in your DNS host (GoDaddy, Cloudflare,
                    Namecheap, etc.). Use the full host name shown below. Remove older duplicate
                    records for the same host before checking verification again.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left">
                    <thead className="bg-[var(--color-canvas)]">
                      <tr>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                          Type
                        </th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                          Host
                        </th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                          Value
                        </th>
                        <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-ink-muted)]">
                          Status
                        </th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]">
                      {selectedDomain.dnsRecords.map((record) => (
                        <tr key={`${record.type}-${record.name}-${record.value}`}>
                          <td className="px-4 py-3 text-[12.5px] text-[var(--color-ink)]">
                            {record.type}
                            <div className="text-[11px] text-[var(--color-ink-muted)]">{record.record}</div>
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-[var(--color-ink)] font-mono">
                            <div>{record.name}</div>
                            <div className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
                              {formatDnsHostFqdn(record.name, selectedDomain.domain)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-[var(--color-ink)] font-mono max-w-[360px] break-all">
                            {record.value}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={
                                record.status === "valid"
                                  ? "success"
                                  : record.status === "invalid"
                                    ? "danger"
                                    : "warn"
                              }
                              size="sm"
                              dot
                            >
                              {RECORD_STATUS_LABELS[record.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void copyValue(record.value)}
                            >
                              Copy
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      )}

      {selectedDomain ? (
        <Modal
          open={deleteModalOpen}
          onClose={closeDeleteModal}
          title="Remove sending domain?"
          className="max-w-lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDeleteModal} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleDeleteDomain(selectedDomain.id)}
                disabled={submitting}
              >
                {submitting ? "Removing…" : "Remove domain"}
              </Button>
            </div>
          }
        >
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            This removes <strong>{selectedDomain.domain}</strong> from this workspace and from your
            email provider. Campaigns using this domain will need a different sending domain before
            they can send again.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
