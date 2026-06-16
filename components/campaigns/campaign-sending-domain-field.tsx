"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { IconPlus } from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type SendingDomain = {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed" | "needs_attention";
  defaultSenderEmail: string | null;
};

const STATUS_LABELS: Record<SendingDomain["status"], string> = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
  needs_attention: "Needs attention",
};

export type CampaignSendingDomainValue = {
  sendingDomainId: string;
  senderEmail: string;
};

type CampaignSendingDomainFieldProps = {
  workspaceSlug: string;
  value: CampaignSendingDomainValue;
  onChange: (value: CampaignSendingDomainValue) => void;
  disabled?: boolean;
};

export function CampaignSendingDomainField({
  workspaceSlug,
  value,
  onChange,
  disabled = false,
}: CampaignSendingDomainFieldProps) {
  const domainsApi = `/api/workspaces/${workspaceSlug}/sending-domains`;
  const [domains, setDomains] = useState<SendingDomain[]>([]);
  const [senderEmails, setSenderEmails] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [loadingDomains, setLoadingDomains] = useState(true);
  const [domainsForbidden, setDomainsForbidden] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const selectedDomain = domains.find((domain) => domain.id === value.sendingDomainId) ?? null;
  const verifiedDomains = domains.filter((domain) => domain.status === "verified");

  const loadDomains = useCallback(async () => {
    setLoadingDomains(true);

    try {
      const response = await fetch(domainsApi);
      const payload = await response.json();

      if (response.status === 403) {
        setDomainsForbidden(true);
        setDomains([]);
        return;
      }

      setDomainsForbidden(false);

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load sending domains.");
      }

      setDomains(payload.data?.domains ?? []);
    } catch (loadError) {
      setActionMessage(
        loadError instanceof Error ? loadError.message : "Failed to load sending domains.",
      );
    } finally {
      setLoadingDomains(false);
    }
  }, [domainsApi]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  useEffect(() => {
    if (!value.sendingDomainId) {
      setSenderEmails([]);
      return;
    }

    if (selectedDomain?.status !== "verified") {
      setSenderEmails([]);
      return;
    }

    void (async () => {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/sender-emails?sendingDomainId=${value.sendingDomainId}`,
      );
      const payload = await response.json();

      if (response.ok) {
        setSenderEmails(payload.data?.senderEmails ?? []);
      }
    })();
  }, [selectedDomain?.status, value.sendingDomainId, workspaceSlug]);

  async function handleAddDomain() {
    if (!newDomain.trim()) {
      return;
    }

    setAddingDomain(true);
    setActionMessage(null);

    try {
      const response = await fetch(domainsApi, {
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
      setActionMessage(
        domain.status === "verified"
          ? "Domain linked. Select a sender email below."
          : "Domain added. Verify DNS in Settings before launching campaigns.",
      );
      onChange({
        sendingDomainId: domain.id,
        senderEmail: domain.status === "verified" ? value.senderEmail : "",
      });
      await loadDomains();
    } catch (submitError) {
      setActionMessage(
        submitError instanceof Error ? submitError.message : "Could not add this domain.",
      );
    } finally {
      setAddingDomain(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
      <div>
        <h3 className="text-[14px] font-semibold text-[var(--color-ink)]">Sending domain</h3>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Choose a verified domain for campaign emails, or add one now.
        </p>
      </div>

      {domainsForbidden ? (
        <p className="text-[12px] text-[var(--color-ink-muted)]">
          You do not have permission to manage sending domains. Ask a workspace owner to configure
          them in{" "}
          <Link
            href={workspacePath(workspaceSlug, "settings/sending-domains")}
            className="text-[var(--color-brand-600)] hover:underline"
          >
            Settings → Sending Domains
          </Link>
          .
        </p>
      ) : null}

      <div>
        <Label htmlFor="campaign-sending-domain">Domain</Label>
        <select
          id="campaign-sending-domain"
          className="mt-1 w-full h-9 rounded-md border border-[var(--color-line)] px-3 text-[13px] bg-white"
          value={value.sendingDomainId}
          disabled={disabled || loadingDomains || domainsForbidden}
          onChange={(event) => {
            onChange({
              sendingDomainId: event.target.value,
              senderEmail: "",
            });
          }}
        >
          <option value="">Select sending domain</option>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.domain} ({STATUS_LABELS[domain.status]})
            </option>
          ))}
        </select>
        {selectedDomain && selectedDomain.status !== "verified" ? (
          <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
            This domain is not verified yet.{" "}
            <Link
              href={workspacePath(workspaceSlug, "settings/sending-domains")}
              className="text-[var(--color-brand-600)] hover:underline"
            >
              Complete DNS verification
            </Link>
          </p>
        ) : null}
        {!loadingDomains && verifiedDomains.length === 0 ? (
          <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
            No verified domain yet. Add one below, then verify DNS in Settings.
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="campaign-sender-email">Sender email</Label>
        <select
          id="campaign-sender-email"
          className="mt-1 w-full h-9 rounded-md border border-[var(--color-line)] px-3 text-[13px] bg-white"
          value={value.senderEmail}
          disabled={disabled || !value.sendingDomainId || selectedDomain?.status !== "verified"}
          onChange={(event) => {
            onChange({
              sendingDomainId: value.sendingDomainId,
              senderEmail: event.target.value,
            });
          }}
        >
          <option value="">Select sender email</option>
          {senderEmails.map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="campaign-new-domain">Add sending domain</Label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Input
            id="campaign-new-domain"
            value={newDomain}
            onChange={(event) => setNewDomain(event.target.value)}
            placeholder="example.com"
            disabled={disabled || addingDomain || domainsForbidden}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || addingDomain || !newDomain.trim()}
            onClick={() => void handleAddDomain()}
          >
            <IconPlus size={14} />
            Add domain
          </Button>
        </div>
      </div>

      {actionMessage ? (
        <p className="text-[12px] text-[var(--color-ink-muted)]">{actionMessage}</p>
      ) : null}
    </div>
  );
}
