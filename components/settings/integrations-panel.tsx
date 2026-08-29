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
  type: "mls" | "website" | "google_ads" | "meta_ads" | "hubspot";
  name: string;
  status: "active" | "paused" | "archived" | "error";
  hasApiKey: boolean;
  hasCredentials?: boolean;
  hasClientSecret?: boolean;
  externalAccountId?: string | null;
  defaultProjectId: string | null;
  allowProjectOverride: boolean;
  createdAt: string;
  archivedAt: string | null;
};

type HubSpotProjectMappingRecord = {
  id: string;
  hubspotProjectId: string;
  hubspotProjectName: string;
  evoProjectId: string | null;
  status: "unmapped" | "mapped" | "skipped";
  reviewedAt: string | null;
};

type HubSpotProbeCheck = {
  key: string;
  ok: boolean;
  statusCode: number | null;
  detail: string;
};

type HubSpotProbeResult = {
  ok: boolean;
  checkedAt: string;
  checks: HubSpotProbeCheck[];
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
  hubspot: "HubSpot",
  mls: "MLS Import",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
};

type IntegrationsPanelProps = {
  workspaceSlug: string;
  canUpdate: boolean;
};

const LOCKED_EXAMPLE_PAYLOAD = {
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
  emailConsentStatus: "subscribed",
  utm: {
    source: "google",
    medium: "cpc",
    campaign: "spring-buyers",
  },
} as const;

const SETUP_STEPS = [
  "Create (or select) the destination project under Settings → Projects.",
  "Create a website integration below and set its default project (required when multiple projects exist).",
  "Copy the one-time API key immediately — it cannot be viewed again.",
  "Keep project override locked unless one website must feed multiple projects.",
  "POST form submissions to the webhook with Bearer auth. Required: firstName, lastName, and email or phone.",
  "When override is locked, omit projectId / projectReference from the payload.",
  "Confirm the lead appears under the destination project and check Configure → logs.",
] as const;

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
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [newHubSpotName, setNewHubSpotName] = useState("HubSpot CRM");
  const [newHubSpotProjectId, setNewHubSpotProjectId] = useState<string | null>(null);
  const [hubspotAccessToken, setHubspotAccessToken] = useState("");
  const [hubspotClientSecret, setHubspotClientSecret] = useState("");
  const [hubspotPortalId, setHubspotPortalId] = useState("");
  const [hubspotCreating, setHubspotCreating] = useState(false);
  const [hubspotProbe, setHubspotProbe] = useState<HubSpotProbeResult | null>(null);
  const [hubspotProbeLoading, setHubspotProbeLoading] = useState(false);
  const [hubspotMappings, setHubspotMappings] = useState<HubSpotProjectMappingRecord[]>([]);
  const [hubspotMappingsLoading, setHubspotMappingsLoading] = useState(false);
  const [hubspotMappingSavingId, setHubspotMappingSavingId] = useState<string | null>(null);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/website/leads`
      : "/api/integrations/website/leads";
  const hubspotWebhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/integrations/hubspot/webhooks`
      : "/api/integrations/hubspot/webhooks";

  const loadProjects = useCallback(async () => {
    setProjectsLoadError(null);

    try {
      const response = await fetch(`${apiBase}/projects`);
      const payload = await response.json();
      if (!response.ok) {
        setProjects([]);
        setProjectsLoadError(
          payload.error?.message ?? "Failed to load projects for destination mapping.",
        );
        return;
      }

      setProjects(payload.data.projects as ProjectSelectorProject[]);
    } catch {
      setProjects([]);
      setProjectsLoadError("Failed to load projects for destination mapping.");
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
    if (!selectedIntegration || (selectedIntegration.type !== "website" && selectedIntegration.type !== "hubspot")) {
      return;
    }

    setEditDefaultProjectId(selectedIntegration.defaultProjectId);
    setEditAllowOverride(selectedIntegration.allowProjectOverride);
  }, [selectedIntegration]);

  const websiteIntegrations = integrations.filter((integration) => integration.type === "website");
  const hubspotIntegrations = integrations.filter((integration) => integration.type === "hubspot");
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

    if (projects.length === 0) {
      setError("Create a project before connecting a website.");
      return;
    }

    if (projects.length > 1 && !newDefaultProjectId) {
      setError(
        "Select a default project. Multi-project workspaces require a destination before the API key is issued.",
      );
      return;
    }

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

  useEffect(() => {
    if (!selectedIntegration || selectedIntegration.type !== "hubspot") {
      setHubspotMappings([]);
      setHubspotProbe(null);
      return;
    }

    void loadHubSpotMappings(selectedIntegration.id);
  }, [selectedIntegration?.id, selectedIntegration?.type]);

  async function loadHubSpotMappings(integrationId: string) {
    setHubspotMappingsLoading(true);
    try {
      const response = await fetch(
        `${apiBase}/integrations/${integrationId}/hubspot/project-mappings`,
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to load HubSpot project mappings.");
        return;
      }
      setHubspotMappings(payload.data.mappings as HubSpotProjectMappingRecord[]);
    } finally {
      setHubspotMappingsLoading(false);
    }
  }

  async function createHubSpotIntegration() {
    setActionMessage(null);
    setError(null);

    if (projects.length === 0) {
      setError("Create a project before connecting HubSpot.");
      return;
    }

    if (projects.length > 1 && !newHubSpotProjectId) {
      setError("Select a default project for HubSpot leads.");
      return;
    }

    if (!hubspotAccessToken.trim() || !hubspotPortalId.trim()) {
      setError("HubSpot access token and portal ID are required.");
      return;
    }

    setHubspotCreating(true);

    try {
      const response = await fetch(`${apiBase}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "hubspot",
          name: newHubSpotName.trim() || "HubSpot CRM",
          defaultProjectId: newHubSpotProjectId,
          hubspotAccessToken: hubspotAccessToken.trim(),
          ...(hubspotClientSecret.trim()
            ? { hubspotClientSecret: hubspotClientSecret.trim() }
            : {}),
          hubspotPortalId: hubspotPortalId.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to create HubSpot integration.");
        return;
      }

      setSelectedId(payload.data.integration.id as string);
      setHubspotAccessToken("");
      setHubspotClientSecret("");
      setActionMessage(
        "HubSpot connected for historical migration. Run the capability probe, then map HubSpot projects. Live webhooks stay deferred until a client secret is added.",
      );
      await loadIntegrations();
    } finally {
      setHubspotCreating(false);
    }
  }

  async function runHubSpotProbe(integrationId: string) {
    setHubspotProbeLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/integrations/${integrationId}/hubspot/probe`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "HubSpot capability probe failed.");
        return;
      }
      setHubspotProbe(payload.data.probe as HubSpotProbeResult);
      setActionMessage(
        payload.data.probe.ok
          ? "HubSpot capability probe passed."
          : "HubSpot capability probe finished with failures — review checks below.",
      );
    } finally {
      setHubspotProbeLoading(false);
    }
  }

  async function refreshHubSpotProjects(integrationId: string) {
    setHubspotMappingsLoading(true);
    setActionMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/integrations/${integrationId}/hubspot/project-mappings`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to refresh HubSpot projects.");
        return;
      }
      setHubspotMappings(payload.data.mappings as HubSpotProjectMappingRecord[]);
      setActionMessage(
        `Loaded ${payload.data.hubspotProjectCount as number} HubSpot project(s). Map each to an Evohome project before any import.`,
      );
    } finally {
      setHubspotMappingsLoading(false);
    }
  }

  async function saveHubSpotMapping(
    integrationId: string,
    mapping: HubSpotProjectMappingRecord,
    next: { status: HubSpotProjectMappingRecord["status"]; evoProjectId: string | null },
  ) {
    setHubspotMappingSavingId(mapping.hubspotProjectId);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/integrations/${integrationId}/hubspot/project-mappings/update`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hubspotProjectId: mapping.hubspotProjectId,
            status: next.status,
            evoProjectId: next.evoProjectId,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to save project mapping.");
        return;
      }
      const saved = payload.data.mapping as HubSpotProjectMappingRecord;
      setHubspotMappings((current) =>
        current.map((item) =>
          item.hubspotProjectId === saved.hubspotProjectId ? saved : item,
        ),
      );
    } finally {
      setHubspotMappingSavingId(null);
    }
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

  async function saveHubSpotRouting(integrationId: string) {
    setRoutingSaving(true);
    setActionMessage(null);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/integrations/${integrationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProjectId: editDefaultProjectId,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error?.message ?? "Failed to save HubSpot destination project.");
        return;
      }

      setActionMessage("HubSpot destination project saved.");
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

  const examplePayload = useMemo(() => {
    if (selectedIntegration?.type !== "website") {
      return { ...LOCKED_EXAMPLE_PAYLOAD };
    }

    // Prefer unsaved Configure form state so copy buttons match what the admin is editing.
    if (editAllowOverride) {
      const projectId = editDefaultProjectId ?? selectedIntegration.defaultProjectId;
      return projectId
        ? { ...LOCKED_EXAMPLE_PAYLOAD, projectId }
        : { ...LOCKED_EXAMPLE_PAYLOAD };
    }

    return { ...LOCKED_EXAMPLE_PAYLOAD };
  }, [selectedIntegration, editAllowOverride, editDefaultProjectId]);

  const exampleCurl = useMemo(
    () => `curl -X POST '${webhookUrl}' \\
  -H 'Authorization: Bearer YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(examplePayload)}'`,
    [examplePayload, webhookUrl],
  );

  const exampleModeNote = (() => {
    if (selectedIntegration?.type !== "website") {
      return "Select a website integration to copy a mode-aware example.";
    }

    if (editAllowOverride) {
      if (editDefaultProjectId ?? selectedIntegration.defaultProjectId) {
        return "Override is on in the form below — example includes that projectId. Save routing before relying on it in production.";
      }
      return "Override is on but no default project is selected — add projectId or projectReference yourself for every request, then Save.";
    }

    return "Override is locked in the form below — omit projectId / projectReference. Leads route to the integration default project.";
  })();

  const canCopyOverrideExample =
    selectedIntegration?.type === "website" &&
    (!editAllowOverride || Boolean(editDefaultProjectId ?? selectedIntegration.defaultProjectId));

  const requiresDefaultProject = projects.length > 1;
  const createDisabled =
    !canUpdate ||
    projects.length === 0 ||
    (requiresDefaultProject && !newDefaultProjectId);

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
      {projectsLoadError && (
        <Card>
          <p className="text-[13px] text-[var(--color-danger-600)]">{projectsLoadError}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => void loadProjects()}>
            Retry projects
          </Button>
        </Card>
      )}

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
            Authenticated webhook for inbound website forms. Each website integration is locked to
            its default project unless you explicitly enable override.
          </p>
        </div>

        <Card>
          <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">Setup protocol</h4>
          <ol className="mt-3 list-decimal pl-5 space-y-1.5 text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
            {SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>

        <Card>
          <div className="space-y-4">
            <Info label="Webhook endpoint" value={webhookUrl} />
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Authenticate with{" "}
              <code className="text-[12px]">Authorization: Bearer &lt;apiKey&gt;</code>
              {" "}or{" "}
              <code className="text-[12px]">X-Integration-Key: &lt;apiKey&gt;</code>.
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
                  <Label htmlFor="new-default-project">
                    Default project{requiresDefaultProject ? " (required)" : ""}
                  </Label>
                  <ProjectSelector
                    id="new-default-project"
                    projects={projects}
                    selectedProjectId={newDefaultProjectId}
                    onChange={setNewDefaultProjectId}
                    placeholder="Select destination project"
                    emptyLabel="Create a project before connecting a website."
                  />
                  <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
                    {requiresDefaultProject
                      ? "Required when the workspace has multiple active projects."
                      : "Recommended. If unset with a single active project, capture uses that project automatically."}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Button
                    disabled={createDisabled}
                    onClick={() => void createWebsiteIntegration()}
                  >
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
                <p className="text-[12px] text-[var(--color-brand-800)]">
                  Next: POST to the webhook with this key. Leave projectId out of the payload while
                  override stays locked.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void copyText("API key", revealedApiKey)}>
                    Copy API key
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void copyText(
                        "Minimal curl",
                        `curl -X POST '${webhookUrl}' \\\n  -H 'Authorization: Bearer ${revealedApiKey}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({
                          firstName: "John",
                          lastName: "Smith",
                          email: "john@example.com",
                          idempotencyKey: "form-submit-123",
                        })}'`,
                      )
                    }
                  >
                    Copy working curl
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
                    {integration.type === "website" && (
                      <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                        Destination:{" "}
                        {integration.defaultProjectId
                          ? (projectNameById.get(integration.defaultProjectId) ?? "Unknown project")
                          : "Auto (single project) / not set"}
                        {" · "}
                        Override {integration.allowProjectOverride ? "enabled" : "locked"}
                      </p>
                    )}
                    {integration.type === "hubspot" && (
                      <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                        Portal {integration.externalAccountId ?? "—"}
                        {" · "}
                        Destination:{" "}
                        {integration.defaultProjectId
                          ? (projectNameById.get(integration.defaultProjectId) ?? "Unknown project")
                          : "Auto (single project) / not set"}
                        {" · "}
                        Credentials {integration.hasCredentials ? "configured" : "missing"}
                      </p>
                    )}
                    <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                      Created {new Date(integration.createdAt).toLocaleString()}
                    </p>
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
                      {integration.type === "website" || integration.type === "hubspot"
                        ? "Configure"
                        : "View logs"}
                    </Button>
                    {canUpdate &&
                      (integration.type === "website" || integration.type === "hubspot") &&
                      integration.status !== "archived" && (
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
                        {integration.type === "website" && (
                          <Button size="sm" onClick={() => void rotateApiKey(integration.id)}>
                            Rotate API key
                          </Button>
                        )}
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
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            HubSpot CRM
          </h2>
          <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-0.5">
            Connect a HubSpot Private App so new contacts create Evohome leads automatically.
          </p>
        </div>

        <Card>
          <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">Setup</h4>
          <ol className="mt-3 list-decimal pl-5 space-y-1.5 text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
            <li>
              In HubSpot: create a Private App with contacts, companies, and projects read scopes.
            </li>
            <li>Copy the access token and Hub ID (portal ID). Client secret is optional for now.</li>
            <li>Paste them below and choose a fallback Evohome project.</li>
            <li>
              After connect: run the capability probe, refresh HubSpot projects, and map each source
              project explicitly. Historical import and live webhooks are not enabled in this step.
            </li>
          </ol>
          <div className="mt-4">
            <Info label="HubSpot webhook URL (deferred)" value={hubspotWebhookUrl} />
            <p className="text-[12px] text-[var(--color-ink-muted)] mt-1.5">
              Live webhooks stay deferred until a client secret is saved and webhook setup is
              approved later.
            </p>
          </div>
        </Card>

        {canUpdate && (
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hubspot-name">Integration name</Label>
                <Input
                  id="hubspot-name"
                  value={newHubSpotName}
                  onChange={(event) => setNewHubSpotName(event.target.value)}
                  placeholder="HubSpot CRM"
                />
              </div>
              <div>
                <Label htmlFor="hubspot-project">Fallback default project</Label>
                <ProjectSelector
                  id="hubspot-project"
                  projects={projects}
                  selectedProjectId={newHubSpotProjectId}
                  onChange={setNewHubSpotProjectId}
                  placeholder="Select destination project"
                  emptyLabel="Create a project before connecting HubSpot."
                />
              </div>
              <div>
                <Label htmlFor="hubspot-portal">HubSpot portal / Hub ID</Label>
                <Input
                  id="hubspot-portal"
                  value={hubspotPortalId}
                  onChange={(event) => setHubspotPortalId(event.target.value)}
                  placeholder="e.g. 12345678"
                />
              </div>
              <div>
                <Label htmlFor="hubspot-token">Private app access token</Label>
                <Input
                  id="hubspot-token"
                  type="password"
                  value={hubspotAccessToken}
                  onChange={(event) => setHubspotAccessToken(event.target.value)}
                  placeholder="pat-..."
                  autoComplete="off"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="hubspot-secret">Client secret (optional — live webhooks later)</Label>
                <Input
                  id="hubspot-secret"
                  type="password"
                  value={hubspotClientSecret}
                  onChange={(event) => setHubspotClientSecret(event.target.value)}
                  placeholder="Leave blank for historical migration"
                  autoComplete="off"
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  disabled={hubspotCreating || projects.length === 0}
                  onClick={() => void createHubSpotIntegration()}
                >
                  {hubspotCreating ? "Connecting…" : "Connect HubSpot"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {hubspotIntegrations.length > 0 && (
          <Card>
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Connected portals:{" "}
              {hubspotIntegrations
                .map((item) => item.externalAccountId ?? item.name)
                .join(", ")}
              . Select an integration above to pause, resume, archive, or inspect logs.
            </p>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
          Placeholder integrations — not available yet
        </h2>
        <p className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
          MLS, Google Ads, and Meta Ads appear here for planning only. They are not production
          integrations in V1 — website and HubSpot lead capture are live.
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

      {selectedIntegration?.type === "hubspot" && (
        <section className="space-y-3">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)] tracking-tight">
            HubSpot migration prep
          </h2>
          <Card>
            <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">
              {selectedIntegration.name}
            </h4>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Info label="Portal / Hub ID" value={selectedIntegration.externalAccountId ?? "—"} />
              <Info
                label="Credentials"
                value={
                  selectedIntegration.hasCredentials
                    ? selectedIntegration.hasClientSecret
                      ? "Token + client secret"
                      : "Token only (historical)"
                    : "Missing"
                }
              />
              <div className="md:col-span-2">
                <Label htmlFor="edit-hubspot-default-project">Fallback default project</Label>
                <ProjectSelector
                  id="edit-hubspot-default-project"
                  projects={projects}
                  selectedProjectId={editDefaultProjectId}
                  onChange={setEditDefaultProjectId}
                  disabled={!canUpdate || routingSaving}
                  placeholder="Select destination project"
                />
              </div>
            </div>
            {canUpdate && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={routingSaving}
                  onClick={() => void saveHubSpotRouting(selectedIntegration.id)}
                >
                  {routingSaving ? "Saving…" : "Save fallback project"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={hubspotProbeLoading}
                  onClick={() => void runHubSpotProbe(selectedIntegration.id)}
                >
                  {hubspotProbeLoading ? "Probing…" : "Run capability probe"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={hubspotMappingsLoading}
                  onClick={() => void refreshHubSpotProjects(selectedIntegration.id)}
                >
                  {hubspotMappingsLoading ? "Refreshing…" : "Refresh HubSpot projects"}
                </Button>
              </div>
            )}
          </Card>

          {hubspotProbe && (
            <Card>
              <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">
                Capability probe {hubspotProbe.ok ? "passed" : "needs attention"}
              </h4>
              <p className="text-[12px] text-[var(--color-ink-muted)] mt-1">
                Checked {new Date(hubspotProbe.checkedAt).toLocaleString()}
              </p>
              <ul className="mt-3 divide-y divide-[var(--color-line)]">
                {hubspotProbe.checks.map((check) => (
                  <li key={check.key} className="py-2 flex items-start gap-2">
                    <Badge tone={check.ok ? "success" : "danger"} size="sm">
                      {check.ok ? "ok" : "fail"}
                    </Badge>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--color-ink)]">{check.key}</p>
                      <p className="text-[12.5px] text-[var(--color-ink-muted)]">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card padded={false}>
            <div className="px-5 py-4 border-b border-[var(--color-line)]">
              <h4 className="text-[14px] font-semibold text-[var(--color-ink)]">
                HubSpot project → Evohome project mapping
              </h4>
              <p className="text-[12.5px] text-[var(--color-ink-muted)] mt-1">
                Explicit mapping only. No auto-create. Import stays blocked until Phase 2–3.
              </p>
            </div>
            {hubspotMappingsLoading && hubspotMappings.length === 0 ? (
              <div className="px-5 py-4">
                <Skeleton className="h-16 w-full" />
              </div>
            ) : hubspotMappings.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[var(--color-ink-muted)]">
                No HubSpot projects loaded yet. Click Refresh HubSpot projects.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {hubspotMappings.map((mapping) => (
                  <li key={mapping.hubspotProjectId} className="px-5 py-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-[var(--color-ink)]">
                        {mapping.hubspotProjectName}
                      </p>
                      <Badge tone="muted" size="sm">
                        {mapping.hubspotProjectId}
                      </Badge>
                      <Badge
                        tone={
                          mapping.status === "mapped"
                            ? "success"
                            : mapping.status === "skipped"
                              ? "muted"
                              : "danger"
                        }
                        size="sm"
                      >
                        {mapping.status}
                      </Badge>
                    </div>
                    {canUpdate && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[220px] flex-1">
                          <Label htmlFor={`map-${mapping.hubspotProjectId}`}>Evohome project</Label>
                          <ProjectSelector
                            id={`map-${mapping.hubspotProjectId}`}
                            projects={projects}
                            selectedProjectId={mapping.evoProjectId}
                            onChange={(projectId) => {
                              // Draft destination only — status stays until Save/Skip/Clear persists.
                              setHubspotMappings((current) =>
                                current.map((item) =>
                                  item.hubspotProjectId === mapping.hubspotProjectId
                                    ? {
                                        ...item,
                                        evoProjectId: projectId,
                                      }
                                    : item,
                                ),
                              );
                            }}
                            disabled={hubspotMappingSavingId === mapping.hubspotProjectId}
                            placeholder="Select destination"
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={
                            hubspotMappingSavingId === mapping.hubspotProjectId ||
                            !mapping.evoProjectId
                          }
                          onClick={() =>
                            void saveHubSpotMapping(selectedIntegration.id, mapping, {
                              status: "mapped",
                              evoProjectId: mapping.evoProjectId,
                            })
                          }
                        >
                          Save mapped
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={hubspotMappingSavingId === mapping.hubspotProjectId}
                          onClick={() =>
                            void saveHubSpotMapping(selectedIntegration.id, mapping, {
                              status: "skipped",
                              evoProjectId: null,
                            })
                          }
                        >
                          Skip
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={hubspotMappingSavingId === mapping.hubspotProjectId}
                          onClick={() =>
                            void saveHubSpotMapping(selectedIntegration.id, mapping, {
                              status: "unmapped",
                              evoProjectId: null,
                            })
                          }
                        >
                          Clear
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

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

            <div className="mt-5 space-y-3 border-t border-[var(--color-line)] pt-4">
              <div>
                <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
                  Integrator example
                </p>
                <p className="text-[12.5px] text-[var(--color-ink-muted)] leading-relaxed">
                  Required fields: <code className="text-[12px]">firstName</code>,{" "}
                  <code className="text-[12px]">lastName</code>, and{" "}
                  <code className="text-[12px]">email</code> or{" "}
                  <code className="text-[12px]">phone</code>. {exampleModeNote}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canCopyOverrideExample && editAllowOverride}
                  onClick={() =>
                    void copyText("Example payload", JSON.stringify(examplePayload, null, 2))
                  }
                >
                  Copy example payload
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canCopyOverrideExample && editAllowOverride}
                  onClick={() => void copyText("Example curl", exampleCurl)}
                >
                  Copy example curl
                </Button>
              </div>
              {editAllowOverride && !canCopyOverrideExample && (
                <p className="text-[12px] text-[var(--color-danger-600)]">
                  Select a default project before copying an override example, or include projectId
                  manually.
                </p>
              )}
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

      {(websiteIntegrations.length > 0 || hubspotIntegrations.length > 0) && !selectedId && (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">
          Select a website or HubSpot integration and use Configure to set destination project and
          inspect logs.
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
