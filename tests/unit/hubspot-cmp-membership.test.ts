import { describe, expect, it } from "vitest";

import {
  CMP_PROJECT_ID,
  decideCmpMembership,
  hubspotCmpProjectIdempotencyKey,
} from "@/lib/hubspot-cmp-membership";
import { hubspotContactIdempotencyKey } from "@/lib/hubspot-gv-pilot";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    hubspotContactId: "9001",
    projectValues: [] as string[],
    notesValues: [] as string[],
    brokerPrefixes: [] as string[],
    firstName: "",
    lastName: "",
    emailNormalized: "buyer@example.com",
    hasPhone: false,
    nameKey: "",
    productValues: ["CMP"],
    ...overrides,
  };
}

describe("decideCmpMembership", () => {
  it("parks contacts without email and phone", () => {
    expect(
      decideCmpMembership({
        snapshot: snapshot({ emailNormalized: null, hasPhone: false }),
        existingOnCmp: false,
        classicKeyTakenElsewhere: false,
        hasHubspotLeadElsewhere: false,
      }),
    ).toEqual({ action: "park", reason: "missing_email_and_phone" });
  });

  it("returns already_on_cmp when membership present", () => {
    expect(
      decideCmpMembership({
        snapshot: snapshot(),
        existingOnCmp: true,
        classicKeyTakenElsewhere: false,
        hasHubspotLeadElsewhere: false,
      }).action,
    ).toBe("already_on_cmp");
  });

  it("creates primary membership for CMP-only signal", () => {
    const decision = decideCmpMembership({
      snapshot: snapshot({ projectValues: [] }),
      existingOnCmp: false,
      classicKeyTakenElsewhere: false,
      hasHubspotLeadElsewhere: false,
    });
    expect(decision).toMatchObject({
      action: "create_cmp_membership",
      role: "primary",
      idempotencyKey: hubspotContactIdempotencyKey("9001"),
    });
  });

  it("creates additional membership when other project attribution exists", () => {
    const decision = decideCmpMembership({
      snapshot: snapshot({ projectValues: ["k2"] }),
      existingOnCmp: false,
      classicKeyTakenElsewhere: true,
      hasHubspotLeadElsewhere: true,
    });
    expect(decision).toMatchObject({
      action: "create_cmp_membership",
      role: "additional",
      idempotencyKey: hubspotCmpProjectIdempotencyKey("9001"),
    });
    expect(hubspotCmpProjectIdempotencyKey("9001")).toContain(CMP_PROJECT_ID);
  });

  it("creates additional membership for multi-project without reassigning", () => {
    const decision = decideCmpMembership({
      snapshot: snapshot({ projectValues: ["k2", "v77"] }),
      existingOnCmp: false,
      classicKeyTakenElsewhere: false,
      hasHubspotLeadElsewhere: false,
    });
    expect(decision).toMatchObject({
      action: "create_cmp_membership",
      role: "additional",
    });
  });
});
