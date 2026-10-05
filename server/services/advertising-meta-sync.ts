import "server-only";

import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import { classifySyncFreshness } from "@/server/advertising/jobs/conventions";
import {
  assertMetaReadOnlyCapabilities,
  MetaAdvertisingPlatformAdapter,
} from "@/server/advertising/platforms/meta/adapter";
import {
  decodeMetaCredentials,
  encodeMetaCredentials,
} from "@/server/advertising/platforms/meta/credentials";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { AppError } from "@/server/errors";
import { assertAdvertisingEnabled } from "@/server/features/advertising";
import {
  createAdConnection,
  findAdConnectionById,
  findAdConnections,
  updateAdConnection,
  type AdConnectionRecord,
} from "@/server/repositories/ad-connections";
import {
  findAdAccounts,
  upsertAdAccount,
  type AdAccountRecord,
} from "@/server/repositories/ad-accounts";
import {
  findAds,
  findAdGroups,
  findAdvertisingCampaigns,
  findMetricSnapshots,
  upsertAd,
  upsertAdGroup,
  upsertAdvertisingCampaign,
  upsertMetricSnapshot,
} from "@/server/repositories/advertising-hierarchy";
import { buildAdCopilotNextStep } from "@/lib/ad-copilot-next-step";
import {
  addTrustedDestination,
  createGrowthCampaign,
  findGrowthCampaigns,
  type GrowthCampaignRecord,
} from "@/server/repositories/growth-campaigns";
import { findIntegrations } from "@/server/repositories/integrations";
import {
  findProjectById,
  findProjectByReference,
} from "@/server/repositories/projects";
import {
  lastTouchAttributionLabel,
  summarizeProjectOutcomeFunnel,
} from "@/server/services/advertising-attribution";

function publicConnection(record: AdConnectionRecord) {
  return {
    id: record.id,
    platform: record.platform,
    name: record.name,
    status: record.status,
    externalBusinessId: record.externalBusinessId,
    grantedScopes: record.grantedScopes,
    writeScopesEnabled: record.writeScopesEnabled,
    healthMessage: record.healthMessage,
    lastSuccessfulSyncAt: record.lastSuccessfulSyncAt,
    lastSyncAttemptAt: record.lastSyncAttemptAt,
    lastSyncError: record.lastSyncError,
    freshness: classifySyncFreshness(record.lastSuccessfulSyncAt),
    freshnessLabel: freshnessLabel(classifySyncFreshness(record.lastSuccessfulSyncAt)),
  };
}

function freshnessLabel(
  status: ReturnType<typeof classifySyncFreshness>,
): string {
  switch (status) {
    case "fresh":
      return "Updated recently";
    case "stale":
      return "Needs a refresh soon";
    case "untrusted":
      return "Out of date — please refresh";
    default:
      return "Not synced yet";
  }
}

function buildMetaAdapter(connection: AdConnectionRecord): MetaAdvertisingPlatformAdapter {
  const credentials = decodeMetaCredentials(connection.credentialsEncrypted);
  if (connection.writeScopesEnabled) {
    throw new AppError(
      "FORBIDDEN",
      "This connection has write permissions turned on. The pilot only allows reading.",
    );
  }
  const adapter = credentials.useFixture
    ? MetaAdvertisingPlatformAdapter.fixture()
    : MetaAdvertisingPlatformAdapter.fromAccessToken(credentials.accessToken);
  assertMetaReadOnlyCapabilities(adapter);
  return adapter;
}

export async function connectMetaForWorkspace(input: {
  workspaceId: string;
  actorId: string;
  name?: string;
  accessToken?: string;
  businessId?: string | null;
  /** Demo / CI path — never hits Meta Graph. */
  useFixture?: boolean;
}): Promise<{ connection: ReturnType<typeof publicConnection> }> {
  assertAdvertisingEnabled();

  const useFixture = Boolean(input.useFixture);
  if (!useFixture && !input.accessToken?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Paste your Meta access token, or choose the practice (demo) connection.",
    );
  }

  const credentialsEncrypted = encodeMetaCredentials({
    accessToken: input.accessToken?.trim() ?? "",
    businessId: input.businessId ?? null,
    useFixture,
  });

  const connection = await createAdConnection({
    workspaceId: input.workspaceId,
    platform: "meta",
    name: input.name?.trim() || "Meta Business",
    createdBy: input.actorId,
    status: "active",
    credentialsEncrypted,
    externalBusinessId: input.businessId ?? null,
    grantedScopes: [...ADVERTISING_DEFAULTS.metaReadOnlyScopes],
  });

  if (connection.writeScopesEnabled) {
    throw new AppError("FORBIDDEN", "Write scopes must stay off in Phase 1.");
  }

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "ad_connection.created",
    entityType: "ad_connection",
    entityId: connection.id,
    after: {
      platform: "meta",
      useFixture,
      grantedScopes: connection.grantedScopes,
      writeScopesEnabled: false,
    },
  });

  return { connection: publicConnection(connection) };
}

export async function listAdvertisingConnectionsForWorkspace(workspaceId: string) {
  assertAdvertisingEnabled();
  const connections = await findAdConnections(workspaceId);
  return { connections: connections.map(publicConnection) };
}

export async function syncMetaConnectionForWorkspace(input: {
  workspaceId: string;
  actorId: string;
  connectionId: string;
  growthCampaignId?: string | null;
}): Promise<{
  accounts: number;
  campaigns: number;
  adGroups: number;
  ads: number;
  metrics: number;
  syncedAt: string;
  freshnessLabel: string;
}> {
  assertAdvertisingEnabled();

  const connection = await findAdConnectionById(input.workspaceId, input.connectionId);
  if (!connection || connection.platform !== "meta") {
    throw new AppError("NOT_FOUND", "We could not find that Meta connection.");
  }
  if (connection.writeScopesEnabled) {
    throw new AppError(
      "FORBIDDEN",
      "This connection can change ads. The pilot only allows reading — reconnect as read-only.",
    );
  }

  let growthCampaignId = input.growthCampaignId ?? null;
  if (!growthCampaignId) {
    const pilotProject = await findProjectByReference(
      input.workspaceId,
      ADVERTISING_DEFAULTS.pilotSelection.projectReference,
    );
    if (pilotProject) {
      const existing = await findGrowthCampaigns(input.workspaceId, {
        projectId: pilotProject.id,
      });
      growthCampaignId = existing[0]?.id ?? null;
    }
  }

  await updateAdConnection(input.workspaceId, connection.id, {
    lastSyncAttemptAt: new Date(),
    lastSyncError: null,
  });

  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "advertising.sync_started",
    entityType: "ad_connection",
    entityId: connection.id,
    after: { platform: "meta", writeScopesEnabled: false },
  });

  try {
    const adapter = buildMetaAdapter(connection);
    // Force mutate rejection path is covered in unit tests; never call mutate here.
    const result = await adapter.syncReadOnly({ externalAccountIds: [] });

    let campaignCount = 0;
    let adGroupCount = 0;
    let adCount = 0;
    let metricCount = 0;

    const accountByExternal = new Map<string, AdAccountRecord>();

    for (const account of result.accounts) {
      const saved = await upsertAdAccount({
        workspaceId: input.workspaceId,
        connectionId: connection.id,
        platform: "meta",
        externalAccountId: account.externalAccountId,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone,
        status: account.status,
        lastSuccessfulSyncAt: result.syncedAt,
        lastSyncAttemptAt: result.syncedAt,
      });
      accountByExternal.set(account.externalAccountId, saved);
    }

    const campaignByExternal = new Map<string, { id: string; adAccountId: string }>();
    const adGroupByExternal = new Map<string, { id: string; adAccountId: string }>();
    const adByExternal = new Map<string, { id: string; adAccountId: string }>();

    for (const node of result.hierarchy) {
      if (node.kind === "campaign") {
        const accountExternal = String(
          (node.observedState as { accountExternalId?: string } | undefined)
            ?.accountExternalId ?? "",
        );
        const account = accountByExternal.get(accountExternal);
        if (!account) continue;
        const saved = await upsertAdvertisingCampaign({
          workspaceId: input.workspaceId,
          adAccountId: account.id,
          growthCampaignId,
          platform: "meta",
          externalCampaignId: node.externalId,
          name: node.name,
          status: node.status,
          objective:
            ((node.observedState as { objective?: string | null } | undefined)
              ?.objective as string | null) ?? null,
          observedState: node.observedState ?? null,
          syncedAt: result.syncedAt,
        });
        campaignByExternal.set(node.externalId, {
          id: saved.id,
          adAccountId: account.id,
        });
        campaignCount += 1;
      }
    }

    for (const node of result.hierarchy) {
      if (node.kind !== "ad_group" || !node.parentExternalId) continue;
      const campaign = campaignByExternal.get(node.parentExternalId);
      const accountExternal = String(
        (node.observedState as { accountExternalId?: string } | undefined)
          ?.accountExternalId ?? "",
      );
      const account = accountByExternal.get(accountExternal);
      if (!campaign || !account) continue;
      const saved = await upsertAdGroup({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        advertisingCampaignId: campaign.id,
        platform: "meta",
        externalAdGroupId: node.externalId,
        name: node.name,
        status: node.status,
        observedState: node.observedState ?? null,
        syncedAt: result.syncedAt,
      });
      adGroupByExternal.set(node.externalId, {
        id: saved.id,
        adAccountId: account.id,
      });
      adGroupCount += 1;
    }

    for (const node of result.hierarchy) {
      if (node.kind !== "ad" || !node.parentExternalId) continue;
      const adGroup = adGroupByExternal.get(node.parentExternalId);
      const accountExternal = String(
        (node.observedState as { accountExternalId?: string } | undefined)
          ?.accountExternalId ?? "",
      );
      const campaignExternal = String(
        (node.observedState as { campaignExternalId?: string } | undefined)
          ?.campaignExternalId ?? "",
      );
      const account = accountByExternal.get(accountExternal);
      const campaign = campaignByExternal.get(campaignExternal);
      if (!adGroup || !account || !campaign) continue;
      const saved = await upsertAd({
        workspaceId: input.workspaceId,
        adAccountId: account.id,
        advertisingCampaignId: campaign.id,
        adGroupId: adGroup.id,
        platform: "meta",
        externalAdId: node.externalId,
        name: node.name,
        status: node.status,
        observedState: node.observedState ?? null,
        syncedAt: result.syncedAt,
      });
      adByExternal.set(node.externalId, {
        id: saved.id,
        adAccountId: account.id,
      });
      adCount += 1;
    }

    for (const point of result.metrics) {
      const mapped =
        point.entityKind === "ad"
          ? adByExternal.get(point.externalEntityId)
          : point.entityKind === "ad_group"
            ? adGroupByExternal.get(point.externalEntityId)
            : point.entityKind === "campaign"
              ? campaignByExternal.get(point.externalEntityId)
              : undefined;

      const fallbackAccount = [...accountByExternal.values()][0] ?? null;
      const adAccountId = mapped?.adAccountId ?? fallbackAccount?.id;
      const entityId = mapped?.id ?? fallbackAccount?.id;
      if (!adAccountId || !entityId) continue;

      await upsertMetricSnapshot({
        workspaceId: input.workspaceId,
        platform: "meta",
        adAccountId,
        entityKind: point.entityKind,
        entityId,
        externalEntityId: point.externalEntityId,
        date: point.date,
        metrics: point.metrics,
        capturedAt: result.syncedAt,
      });
      metricCount += 1;
    }

    await updateAdConnection(input.workspaceId, connection.id, {
      status: "active",
      lastSuccessfulSyncAt: result.syncedAt,
      lastSyncAttemptAt: result.syncedAt,
      lastSyncError: null,
      healthMessage: "Reading ads data is working.",
    });

    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "advertising.sync_completed",
      entityType: "ad_connection",
      entityId: connection.id,
      after: {
        accounts: result.accounts.length,
        campaigns: campaignCount,
        adGroups: adGroupCount,
        ads: adCount,
        metrics: metricCount,
      },
    });

    return {
      accounts: result.accounts.length,
      campaigns: campaignCount,
      adGroups: adGroupCount,
      ads: adCount,
      metrics: metricCount,
      syncedAt: result.syncedAt.toISOString(),
      freshnessLabel: freshnessLabel("fresh"),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while reading Meta.";
    await updateAdConnection(input.workspaceId, connection.id, {
      status: "error",
      lastSyncError: message.slice(0, 500),
      healthMessage: "We could not refresh Meta. Try again in a few minutes.",
    });
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "advertising.sync_failed",
      entityType: "ad_connection",
      entityId: connection.id,
      after: { error: message.slice(0, 200) },
    });
    throw error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "We could not refresh Meta right now.", {
          cause: error,
        });
  }
}

export async function ensurePilotGrowthCampaignForWorkspace(input: {
  workspaceId: string;
  actorId: string;
}): Promise<GrowthCampaignRecord> {
  assertAdvertisingEnabled();
  const pilot = ADVERTISING_DEFAULTS.pilotSelection;
  const project = await findProjectByReference(
    input.workspaceId,
    pilot.projectReference,
  );
  if (!project) {
    throw new AppError(
      "NOT_FOUND",
      `We could not find the pilot project “${pilot.projectName}” (${pilot.projectReference}) in this workspace.`,
      {
        details: {
          projectReference: pilot.projectReference,
          marketLabel: pilot.marketLabel,
        },
      },
    );
  }

  const existing = await findGrowthCampaigns(input.workspaceId, {
    projectId: project.id,
  });
  const growth =
    existing[0] ??
    (await createGrowthCampaign({
      workspaceId: input.workspaceId,
      projectId: project.id,
      name: `${pilot.projectName} — paid ads`,
      createdBy: input.actorId,
      objective: "qualified_leads",
      marketCountryCode: pilot.countryCode,
      outcomeTarget: "Qualified leads and visits for Satigny duplex in Geneva",
      attributionKey: `growth:${pilot.projectReference}`,
    }));

  return ensureSatignyTrustedDestination(input.workspaceId, growth, project.id);
}

async function ensureSatignyTrustedDestination(
  workspaceId: string,
  growth: GrowthCampaignRecord,
  pilotProjectId: string,
): Promise<GrowthCampaignRecord> {
  const websiteIntegrations = await findIntegrations(workspaceId, {
    type: "website",
  });
  const satignyIntegration =
    websiteIntegrations.find(
      (row) =>
        !row.archivedAt &&
        row.status === "active" &&
        (row.defaultProjectId === pilotProjectId ||
          /satigny/i.test(row.name ?? "")),
    ) ?? null;

  // Do not create a placeholder destination without a real website integration id —
  // otherwise capture cannot match the lock and project routing falls through.
  if (!satignyIntegration) {
    return growth;
  }

  const destinationKey = `website:${satignyIntegration.id}`;

  if (
    growth.trustedDestinations.some((dest) => dest.destinationKey === destinationKey)
  ) {
    return growth;
  }

  return addTrustedDestination(workspaceId, growth.id, {
    destinationKey,
    label: "Satigny duplex website — leads always go to this project",
    websiteIntegrationId: satignyIntegration.id,
  });
}

export async function getGrowthCampaignOverviewForWorkspace(input: {
  workspaceId: string;
  projectId: string;
}) {
  assertAdvertisingEnabled();

  const campaigns = await findGrowthCampaigns(input.workspaceId, {
    projectId: input.projectId,
  });
  const growth = campaigns[0] ?? null;
  const accounts = await findAdAccounts(input.workspaceId);
  const connections = await findAdConnections(input.workspaceId);

  // Prefer campaigns linked to this Growth Campaign. For the Satigny pilot only,
  // fall back to workspace Meta hierarchy so operators see sync before linking.
  let paidCampaigns = growth
    ? await findAdvertisingCampaigns(input.workspaceId, {
        growthCampaignId: growth.id,
      })
    : [];
  if (paidCampaigns.length === 0) {
    const project = await findProjectById(input.workspaceId, input.projectId);
    const isPilotProject =
      project?.reference === ADVERTISING_DEFAULTS.pilotSelection.projectReference;
    if (isPilotProject) {
      paidCampaigns = await findAdvertisingCampaigns(input.workspaceId);
    }
  }

  const hierarchy = [];
  for (const paid of paidCampaigns) {
    const groups = await findAdGroups(input.workspaceId, {
      advertisingCampaignId: paid.id,
    });
    const groupNodes = [];
    for (const group of groups) {
      const ads = await findAds(input.workspaceId, { adGroupId: group.id });
      groupNodes.push({
        id: group.id,
        name: group.name,
        status: group.status,
        ads: ads.map((ad) => ({
          id: ad.id,
          name: ad.name,
          status: ad.status,
        })),
      });
    }
    hierarchy.push({
      id: paid.id,
      name: paid.name,
      status: paid.status,
      objective: paid.objective,
      adAccountId: paid.adAccountId,
      adGroups: groupNodes,
    });
  }

  const latestSync = connections
    .map((connection) => connection.lastSuccessfulSyncAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const freshness = classifySyncFreshness(latestSync);
  const snapshots = await findMetricSnapshots(input.workspaceId, { limit: 50 });
  const spend = snapshots.reduce(
    (sum, row) => sum + (Number(row.metrics.spend) || 0),
    0,
  );
  const clicks = snapshots.reduce(
    (sum, row) => sum + (Number(row.metrics.clicks) || 0),
    0,
  );

  const outcomes = await summarizeProjectOutcomeFunnel(
    input.workspaceId,
    input.projectId,
    spend,
  );
  const funnel = {
    formLeads: outcomes.formLeads,
    qualifiedLeads: outcomes.qualifiedLeads,
    opportunities: outcomes.opportunities,
    wins: outcomes.wonCount,
  };
  const optimisation = buildAdCopilotNextStep({
    freshness,
    freshnessLabel: freshnessLabel(freshness),
    spend,
    clicks,
    funnel,
  });

  return {
    pilot: {
      projectName: ADVERTISING_DEFAULTS.pilotSelection.projectName,
      projectReference: ADVERTISING_DEFAULTS.pilotSelection.projectReference,
      marketLabel: ADVERTISING_DEFAULTS.pilotSelection.marketLabel,
      countryCode: ADVERTISING_DEFAULTS.pilotSelection.countryCode,
    },
    growthCampaign: growth
      ? {
          id: growth.id,
          name: growth.name,
          projectId: growth.projectId,
          status: growth.status,
          attributionPolicyLabel: lastTouchAttributionLabel(),
          trustedDestinationCount: growth.trustedDestinations.length,
          projectLockNotice:
            "Leads from the Satigny website always go to this project. The browser cannot pick a different one.",
        }
      : null,
    connections: connections.map(publicConnection),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      externalAccountId: account.externalAccountId,
      currency: account.currency,
      timezone: account.timezone,
      status: account.status,
      freshness: classifySyncFreshness(account.lastSuccessfulSyncAt),
      freshnessLabel: freshnessLabel(
        classifySyncFreshness(account.lastSuccessfulSyncAt),
      ),
    })),
    hierarchy,
    outcomes: {
      ...outcomes,
      hierarchyOrder: ADVERTISING_DEFAULTS.successMetricHierarchy,
      freshnessLabel: freshnessLabel(freshness),
    },
    analytics: {
      metricTier: 5,
      metricTierLabel:
        "Media efficiency only (clicks & spend) — not the main business goal",
      spend,
      clicks,
      snapshotCount: snapshots.length,
      freshness,
      freshnessLabel: freshnessLabel(freshness),
      lastSuccessfulSyncAt: latestSync,
    },
    funnel,
    optimisation,
    readOnly: true,
    nextStepHint: growth
      ? "Review business results first (won, opportunities, qualified leads). Refresh Meta when you want newer spend numbers. Changing ads still needs a later phase."
      : "Create the Satigny paid-ads plan (Growth Campaign), then refresh Meta.",
  };
}
