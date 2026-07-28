"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ProjectSelector,
  type ProjectSelectorProject,
} from "@/components/domain/project-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconGoogle } from "@/lib/icons";

type IntegrationRecord = {
  id: string;
  type: "mls" | "website" | "google_ads" | "meta_ads";
  name: string;
  status: "active" | "paused" | "archived" | "error";
  hasApiKey: boolean;
  defaultProjectId: string | null;
  allowProjectOverride: boolean;
  createdAt: string;
  archivedAt: string | null;
};

type IntegrationLogRecord = {
  id: string;
  direction: "inbound" | "outbound";
  status: "success" | "failed";
  eventType: string;
  payloadSummary: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<IntegrationRecord["type"], string> = {
  website: "Website",
  mls: "MLS Import",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
};

type IntegrationsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

const EXAMPLE_PAYLOAD = {
  externalId: "form-submit-123",
  idempotencyKey: "form-submit-123",
  firstName: "John",
  lastName: "Smith",
  email: "john@example.com",
  phone: "+41 79 123 45 67",
  message: "Interested in a 2-bedroom apartment.",
  source: "website",
  preferredAreas: ["Geneva"],
  budgetMin: 800000,
  budgetMax: 1200000,
  propertyReference: "GV-APT-12",
  projectId: "REPLACE_WITH_PROJECT_ID_IF_OVERRIDE_ENABLED",
  emailConsentStatus: "subscribed",
  utm: {
    source: "google",
    medium: "cpc",
    campaign: "spring-buyers",
  },
};

export function IntegrationsPanel({ workspaceSlug, canUpdate }: IntegrationsPanelProps) {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<IntegrationLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newWebsiteName, setNewWebsiteName] = useState("Website Lead Capture");
  const [newDefaultProjectId, setNewDefaultProjectId] = useState<string | null>(null);
  const [editDefaultProjectId, setEditDefaultProjectId] = useState<string | null>(null);
  const [editAllowOverride, setEditAllowOverride] = useState(false);
  const [routingSaving, setRoutingSaving] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/website/leads`
      : "/api/integrations/website/leads";

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/projects`);
      const payload = await response.json();
      if (response.ok) {
        setProjects(payload.data.projects as ProjectSelectorProject[]);
      }
    } catch {
      // Non-blocking for integrations list.
    }
  }, [apiBase]);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const response = await fetch(`${apiBase}/integrations`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load integrations.");
      }

      setIntegrations(payload.data.integrations as IntegrationRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const loadLogs = useCallback(
    async (integrationId: string) => {
      setLogsLoading(true);

      try {
        const response = await fetch(`${apiBase}/integrations/${integrationId}/logs?limit=20`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error?.message ?? "Failed to load logs.");
        }

        setLogs(payload.data.logs as IntegrationLogRecord[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load logs.");
      } finally {
        setLogsLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void loadIntegrations();
    void loadProjects();
  }, [loadIntegrations, loadProjects]);

  useEffect(() => {
    if (selectedId) {
      void loadLogs(selectedId);
    } else {
      setLogs([]);
    }
  }, [selectedId, loadLogs]);

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedId) ?? null,
    [integrations, selectedId],
  );

  useEffect(() => {
    if (!selectedIntegration || selectedIntegration.type !== "website") {
      return;
    }

    setEditDefaultProjectId(selectedIntegration.defaultProjectId);
    setEditAllowOverride(selectedIntegration.allowProjectOverride);
  }, [selectedIntegration]);

  const websiteIntegrations = integrations.filter((integration) => integration.type === "website");
  const configuredTypes = new Set(integrations.map((integration) => integration.type));
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(
        project.id,
        project.reference ? `${project.name} (${project.reference})` : project.name,
      );
    }
    return map;
  }, [projects]);

  async function createWebsiteIntegration() {
    setActionMessage(null);
    setError(null);

    const response = await fetch(`${apiBase}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "website",
        name: newWebsiteName.trim() || "Website Lead Capture",
        defaultProjectId: newDefaultProjectId,
        allowProjectOverride: false,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to create website integration.");
      return;
    }

    if (payload.data.apiKey) {
      setRevealedApiKey(payload.data.apiKey as string);
      setActionMessage("Copy your API key now. It cannot be viewed again.");
    }

    setSelectedId(payload.data.integration.id as string);
    setNewWebsiteName("Website Lead Capture");
    setNewDefaultProjectId(null);
    await loadIntegrations();
  }

  async function createPlaceholder(type: IntegrationRecord["type"], name: string) {
    setActionMessage(null);
    setError(null);

    const response = await fetch(`${apiBase}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to create placeholder integration.");
      return;
    }

    setActionMessage("Placeholder created. Connection is not implemented yet.");
    await loadIntegrations();
  }

  async function updateIntegrationStatus(
    integrationId: string,
    status: IntegrationRecord["status"],
  ) {
    setActionMessage(null);
    setError(null);

    const response = await fetch(`${apiBase}/integrations/${integrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to update integration.");
      return;
    }

    await loadIntegrations();
  }

  async function saveWebsiteRouting(integrationId: string) {
    setRoutingSaving(true);
    setActionMessage(null);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/integrations/${integrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProjectId: editDefaultProjectId,
          allowProjectOverride: editAllowOverride,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to save project routing.");
        return;
      }

      setActionMessage("Website project routing saved.");
      await loadIntegrations();
    } finally {
      setRoutingSaving(false);
    }
  }

  async function archiveIntegration(integrationId: string, name: string) {
    const confirmed = window.confirm(`Archive "${name}"? Inbound payloads will be rejected.`);

    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setError(null);

    const response = await fetch(`${apiBase}/integrations/${integrationId}`, {
      method: "DELETE",
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to archive integration.");
      return;
    }

    if (selectedId === integrationId) {
      setSelectedId(null);
    }

    await loadIntegrations();
  }

  async function rotateApiKey(integrationId: string) {
    setActionMessage(null);
    setError(null);

    const response = await fetch(`${apiBase}/integrations/${integrationId}/rotate-api-key`, {
      method: "POST",
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error?.message ?? "Failed to rotate API key.");
      return;
    }

    setRevealedApiKey(payload.data.apiKey as string);
    setActionMessage("New API key generated. Copy it now — it cannot be viewed again.");
    await loadIntegrations();
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setActionMessage(`${label} copied to clipboard.`);
    } catch {
      setActionMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  const exampleCurl = `curl -X POST '${webhookUrl}' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(EXAMPLE_PAYLOAD)}'`;

  if (forbidden) {
    return (
      <PermissionDenied
        title="Integrations unavailable"
        description="You do not have permission to view integrations. Requires settings:read."
      />
    );
  }

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-24 w-full" />
      </Card>
    );
  }

  if (error && integrations.length === 0) {
    return (
      <ErrorState
        title="Could not load integrations"
        description={error}
        primaryAction={{ label: "Retry", onClick: () => void loadIntegrations() }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card>
          <p className="text-[13px] text-[var(--color-danger-600)]">{error}</p>
        </Card>
      )}

      {actionMessage && (
        <Card>
          <p className="text-[13px] text-[var(--color-brand-700)]">{actionMessage}</p>
        </Card>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Website lead capture
          </h2>
          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
            Authenticated webhook for inbound website forms. Each website integration routes leads
            to a default project unless override is explicitly enabled.
          </p>
        </div>

        <Card>
          <div className="space-y-4">
            <Info label="Webhook endpoint" value={webhookUrl} />
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Authenticate with{" "}
              <code className="text-[12px]">Authorization: Bearer &lt;apiKey&gt;</code>.
            </p>

            {canUpdate && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <Label htmlFor="new-website-name">Integration name</Label>
                  <Input
                    id="new-website-name"
                    value={newWebsiteName}
                    onChange={(event) => setNewWebsiteName(event.target.value)}
                    placeholder="Website Lead Capture"
                  />
                </div>
                <div>
                  <Label htmlFor="new-default-project">Default project</Label>
                  <ProjectSelector
                    id="new-default-project"
                    projects={projects}
                    selectedProjectId={newDefaultProjectId}
                    onChange={setNewDefaultProjectId}
                    placeholder="Select destination project"
                    emptyLabel="Create a project before connecting a website."
                  />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={() => void createWebsiteIntegration()}>
                    Create website integration
                  </Button>
                </div>
              </div>
            )}

            {revealedApiKey && (
              <div className="rounded-lg border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] p-4 space-y-2">
                <p className="text-[13px] font-semibold text-[var(--color-brand-800)]">
                  API key (shown once)
                </p>
                <code className="block text-[12px] break-all text-[var(--color-ink)]">
                  {revealedApiKey}
                </code>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void copyText("API key", revealedApiKey)}>
                    Copy API key
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRevealedApiKey(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Connected integrations
          </h2>
          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
            Website destination project is shown for each connection so routing stays auditable.
          </p>
        </div>

        {integrations.length === 0 ? (
          <EmptyState
            title="No integrations yet"
            description="Create a website integration to start receiving inbound leads."
          />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-[var(--color-line)]">
              {integrations.map((integration) => (
                <li
                  key={integration.id}
                  className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-medium text-[var(--color-ink)]">
                        {integration.name}
                      </p>
                      <Badge tone="muted" size="sm">
                        {TYPE_LABELS[integration.type]}
                      </Badge>
                      <Badge
                        tone={
                          integration.status === "active"
                            ? "success"
                            : integration.status === "error"
                              ? "danger"
                              : "muted"
                        }
                        size="sm"
                      >
                        {integration.status}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                      Created {new Date(integration.createdAt).toLocaleString()}
                    </p>
                    {integration.type === "website" && (
                      <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                        Destination:{" "}
                        {integration.defaultProjectId
                          ? (projectNameById.get(integration.defaultProjectId) ??
                            integration.defaultProjectId)
                          : "Auto (single project) / unset"}
                        {" · "}
                        Override: {integration.allowProjectOverride ? "allowed" : "locked"}
                      </p>
                    )}
                    {integration.type === "website" && integration.hasApiKey && !revealedApiKey && (
                      <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                        API key cannot be viewed again. Rotate to generate a new key.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedId(integration.id)}
                    >
                      {integration.type === "website" ? "Configure" : "View logs"}
                    </Button>
                    {canUpdate && integration.type === "website" && integration.status !== "archived" && (
                      <>
                        {integration.status === "active" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void updateIntegrationStatus(integration.id, "paused")}
                          >
                            Pause
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void updateIntegrationStatus(integration.id, "active")}
                          >
                            Resume
                          </Button>
                        )}
                        <Button size="sm" onClick={() => void rotateApiKey(integration.id)}>
                          Rotate API key
                        </Button>
                      </>
                    )}
                    {canUpdate && integration.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void archiveIntegration(integration.id, integration.name)}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
          Placeholder integrations — not available yet
        </h2>
        <p className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
          MLS, Google Ads, and Meta Ads appear here for planning only. They are not production
          integrations in V1 — only website lead capture is live.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PlaceholderCard
            title="MLS Import"
            description="Placeholder only. Bidirectional MLS sync is not implemented."
            configured={configuredTypes.has("mls")}
            canUpdate={canUpdate}
            onConnect={() => void createPlaceholder("mls", "MLS Import")}
          />
          <PlaceholderCard
            title="Google Ads"
            description="Placeholder only. OAuth and campaign sync are not implemented."
            icon={<IconGoogle size={16} />}
            configured={configuredTypes.has("google_ads")}
            canUpdate={canUpdate}
            onConnect={() => void createPlaceholder("google_ads", "Google Ads")}
          />
          <PlaceholderCard
            title="Meta Ads"
            description="Placeholder only. OAuth and lead sync are not implemented."
            configured={configuredTypes.has("meta_ads")}
            canUpdate={canUpdate}
            onConnect={() => void createPlaceholder("meta_ads", "Meta Ads")}
          />
        </div>
      </section>

      {selectedIntegration?.type === "website" && (
        <section className="space-y-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Website integration details
          </h2>
          <Card>
            <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">
              {selectedIntegration.name}
            </h4>
            <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
              Configure which CRM project receives leads from this website. Keep override locked
              unless one website must deliberately feed multiple projects.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-default-project">Default project</Label>
                <ProjectSelector
                  id="edit-default-project"
                  projects={projects}
                  selectedProjectId={editDefaultProjectId}
                  onChange={setEditDefaultProjectId}
                  disabled={!canUpdate || routingSaving}
                  placeholder="Select destination project"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-start gap-2 text-[13px] text-[var(--color-ink)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={editAllowOverride}
                    disabled={!canUpdate || routingSaving}
                    onChange={(event) => setEditAllowOverride(event.target.checked)}
                  />
                  <span>
                    Allow payload <code className="text-[12px]">projectId</code> /{" "}
                    <code className="text-[12px]">projectReference</code> override
                    <span className="block text-[12px] text-[var(--color-ink-muted)] mt-0.5">
                      When off, Website A cannot send leads into another project.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {canUpdate && (
              <div className="mt-4">
                <Button
                  size="sm"
                  disabled={routingSaving}
                  onClick={() => void saveWebsiteRouting(selectedIntegration.id)}
                >
                  {routingSaving ? "Saving…" : "Save project routing"}
                </Button>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-4">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void copyText("Example payload", JSON.stringify(EXAMPLE_PAYLOAD, null, 2))
                }
              >
                Copy example payload
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copyText("Example curl", exampleCurl)}
              >
                Copy example curl
              </Button>
            </div>
          </Card>
        </section>
      )}

      {selectedId && (
        <section className="space-y-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            Recent integration logs
          </h2>
          {logsLoading ? (
            <Card>
              <Skeleton className="h-20 w-full" />
            </Card>
          ) : logs.length === 0 ? (
            <Card>
              <p className="text-[13px] text-[var(--color-ink-muted)]">No logs yet.</p>
            </Card>
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-[var(--color-line)]">
                {logs.map((log) => (
                  <li key={log.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={log.status === "success" ? "success" : "danger"} size="sm">
                        {log.status}
                      </Badge>
                      <Badge tone="muted" size="sm">
                        {log.direction}
                      </Badge>
                      <span className="text-[12.5px] font-medium text-[var(--color-ink)]">
                        {log.eventType}
                      </span>
                      <span className="text-[12px] text-[var(--color-ink-muted)]">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.payloadSummary && (
                      <pre className="mt-2 text-[11.5px] text-[var(--color-ink-muted)] whitespace-pre-wrap break-words">
                        {JSON.stringify(log.payloadSummary, null, 2)}
                      </pre>
                    )}
                    {log.error && (
                      <p className="mt-2 text-[12px] text-[var(--color-danger-600)]">{log.error}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {websiteIntegrations.length > 0 && !selectedId && (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Select a website integration and use Configure to set project routing and inspect logs.
        </p>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <p className="text-[13px] text-[var(--color-ink)] break-all">{value}</p>
    </div>
  );
}

function PlaceholderCard({
  title,
  description,
  configured,
  canUpdate,
  onConnect,
  icon,
}: {
  title: string;
  description: string;
  configured: boolean;
  canUpdate: boolean;
  onConnect: () => void;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-muted)]">
            {icon}
          </span>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{title}</p>
            <Badge tone="muted" size="sm">
              {configured ? "Placeholder" : "Not connected"}
            </Badge>
          </div>
          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1 leading-relaxed">
            {description}
          </p>
          {canUpdate && !configured && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={onConnect}>
              Connect later
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
