import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({
  getEnv: vi.fn(() => ({
    NEXTAUTH_SECRET: "test-nextauth-secret-for-credentials",
    INTEGRATION_API_KEY_PEPPER: undefined,
  })),
}));

import {
  ADVERTISING_ENABLED_DEFAULT,
  isAdvertisingEnabled,
} from "@/lib/advertising-feature";
import { AppError } from "@/server/errors";
import { assertAdvertisingEnabled } from "@/server/features/advertising";
import { getAdvertisingModuleStatus } from "@/server/services/advertising-status";
import {
  assertGrowthCampaignProjectId,
  assertProjectReassignAllowed,
  resolveTrustedDestinationProjectId,
} from "@/server/advertising/routing/project-invariant";
import {
  canExportConversion,
  emptyConsentState,
} from "@/server/advertising/attribution/consent";
import {
  NullAdvertisingPlatformAdapter,
  assertNoPlatformNetworkInPhase0,
} from "@/server/advertising/platforms/adapter";
import {
  buildAdvertisingIdempotencyKey,
  classifySyncFreshness,
} from "@/server/advertising/jobs/conventions";
import { ADVERTISING_DEFAULTS } from "@/server/advertising/defaults";
import {
  connectionCredentialVault,
  decryptOpaqueCredentials,
  encryptOpaqueCredentials,
} from "@/server/security/credential-vault";
import {
  decodeHubSpotCredentials,
  encodeHubSpotCredentials,
} from "@/server/security/integration-credentials";
import { isValidPermission } from "@/server/permissions/permissions";
import { getDefaultRolePermissions } from "@/server/permissions/roles";
import { evaluateConversionExportEligibility } from "@/server/repositories/conversion-events";

describe("advertising feature flag", () => {
  const original = process.env.ADVERTISING_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ADVERTISING_ENABLED;
    } else {
      process.env.ADVERTISING_ENABLED = original;
    }
  });

  it("defaults off", () => {
    delete process.env.ADVERTISING_ENABLED;
    expect(ADVERTISING_ENABLED_DEFAULT).toBe(false);
    expect(isAdvertisingEnabled()).toBe(false);
    expect(() => assertAdvertisingEnabled()).toThrow(AppError);
  });

  it("enables only via explicit env", () => {
    process.env.ADVERTISING_ENABLED = "true";
    expect(isAdvertisingEnabled()).toBe(true);
    expect(() => assertAdvertisingEnabled()).not.toThrow();
  });

  it("returns plain-language status", () => {
    delete process.env.ADVERTISING_ENABLED;
    const status = getAdvertisingModuleStatus();
    expect(status.enabled).toBe(false);
    expect(status.summary).toMatch(/turned off/i);
    expect(status.nextStepHint.length).toBeGreaterThan(10);
    expect(status.phase0Guarantees.noPlatformNetworkCalls).toBe(true);
  });
});

describe("advertising permissions", () => {
  it("registers advertising permission keys", () => {
    for (const key of [
      "advertising:read",
      "advertising:create",
      "advertising:update",
      "advertising:archive",
      "advertising:connect",
      "advertising:approve",
    ]) {
      expect(isValidPermission(key)).toBe(true);
    }
  });

  it("gives owner/admin full advertising perms and viewer read-only", () => {
    expect(getDefaultRolePermissions("owner")).toContain("advertising:approve");
    expect(getDefaultRolePermissions("admin")).toContain("advertising:connect");
    expect(getDefaultRolePermissions("agent")).toContain("advertising:read");
    expect(getDefaultRolePermissions("agent")).not.toContain("advertising:approve");
    expect(getDefaultRolePermissions("viewer")).toContain("advertising:read");
    expect(getDefaultRolePermissions("viewer")).not.toContain("advertising:create");
  });
});

describe("credential vault", () => {
  it("round-trips opaque credentials", () => {
    const ciphertext = encryptOpaqueCredentials('{"token":"secret-value"}');
    expect(ciphertext.startsWith("evocrm_cred_v1.")).toBe(true);
    expect(decryptOpaqueCredentials(ciphertext)).toBe('{"token":"secret-value"}');
    expect(connectionCredentialVault.decrypt(ciphertext)).toContain("secret-value");
  });

  it("preserves HubSpot encode/decode path via vault", () => {
    const encoded = encodeHubSpotCredentials({
      accessToken: "pat-test-token",
      clientSecret: "hs-secret",
      portalId: "12345",
    });
    const decoded = decodeHubSpotCredentials(encoded);
    expect(decoded).toEqual({
      accessToken: "pat-test-token",
      clientSecret: "hs-secret",
      portalId: "12345",
    });
  });
});

describe("project routing invariant", () => {
  it("requires projectId", () => {
    expect(() => assertGrowthCampaignProjectId("")).toThrow(AppError);
    expect(assertGrowthCampaignProjectId("proj-1")).toBe("proj-1");
  });

  it("rejects browser project override", () => {
    expect(() =>
      resolveTrustedDestinationProjectId({
        growthCampaignProjectId: "proj-locked",
        clientProjectId: "proj-other",
      }),
    ).toThrow(/cannot choose/i);

    expect(
      resolveTrustedDestinationProjectId({
        growthCampaignProjectId: "proj-locked",
        clientProjectId: "proj-locked",
      }),
    ).toBe("proj-locked");
  });

  it("blocks project reassign when destinations exist", () => {
    expect(() =>
      assertProjectReassignAllowed({ hasTrustedDestinations: true }),
    ).toThrow(AppError);
  });
});

describe("platform adapter contract (no network)", () => {
  it("null adapter returns empty sync without I/O", async () => {
    const adapter = new NullAdvertisingPlatformAdapter("meta");
    assertNoPlatformNetworkInPhase0(adapter);
    expect(await adapter.discoverAccounts()).toEqual([]);
    const sync = await adapter.syncReadOnly({ externalAccountIds: [] });
    expect(sync.accounts).toEqual([]);
    expect(sync.hierarchy).toEqual([]);
  });
});

describe("job conventions + consent scaffolding", () => {
  it("classifies sync freshness", () => {
    expect(classifySyncFreshness(null)).toBe("never_synced");
    expect(classifySyncFreshness(new Date())).toBe("fresh");
    expect(
      classifySyncFreshness(new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ).toBe("stale");
    expect(
      classifySyncFreshness(new Date(Date.now() - 25 * 60 * 60 * 1000)),
    ).toBe("untrusted");
  });

  it("builds idempotency keys", () => {
    expect(
      buildAdvertisingIdempotencyKey({
        workspaceId: "ws",
        jobKind: "hierarchy_sync",
        externalId: "act-1",
        cursorOrVersion: "v1",
      }),
    ).toBe("ws:hierarchy_sync:act-1:v1");
  });

  it("blocks conversion export without consent", () => {
    const consent = emptyConsentState();
    expect(canExportConversion(consent)).toBe(false);
    expect(evaluateConversionExportEligibility(consent)).toBe(
      "blocked_missing_consent",
    );

    consent.granted = true;
    consent.purposes = ["conversion_export"];
    expect(evaluateConversionExportEligibility(consent)).toBe("pending");
  });

  it("adopts brief recommended defaults", () => {
    expect(ADVERTISING_DEFAULTS.readPilotPlatforms).toEqual(["meta"]);
    expect(ADVERTISING_DEFAULTS.attributionPolicyV1).toBe("last_touch");
    expect(ADVERTISING_DEFAULTS.mediaStorage.provider).toBe("digitalocean_spaces");
    expect(ADVERTISING_DEFAULTS.consent.marketsFirst).toEqual(["CH", "EU"]);
    expect(ADVERTISING_DEFAULTS.maxAutomatedBudgetAdjustment.percentOfDailyBudget).toBe(
      10,
    );
  });
});
