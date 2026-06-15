import { describe, expect, it } from "vitest";

import type { LeadRecord } from "@/server/repositories/leads";
import { evaluateEnrollmentConditions } from "@/server/services/campaign-auto-enrollment";
import { TEST_PROJECT_ID } from "@/tests/helpers/crm-fixtures";

function buildLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    workspaceId: "ws-1",
    projectId: TEST_PROJECT_ID,
    statusId: "status-1",
    sourceId: "source-1",
    ownerId: null,
    assignedTo: "user-1",
    firstName: "Jane",
    lastName: "Doe",
    fullName: "Jane Doe",
    email: "jane@example.com",
    emailNormalized: "jane@example.com",
    phone: null,
    phoneNormalized: null,
    language: null,
    preferredContactMethod: null,
    budgetMin: null,
    budgetMax: null,
    preferredAreas: [],
    propertyTypeInterests: [],
    transactionIntent: null,
    usagePurpose: null,
    notes: null,
    tags: ["tag-1"],
    attributes: { investor: "yes" },
    emailConsentStatus: "unknown",
    emailUnsubscribedAt: null,
    emailUnsubscribeReason: null,
    lastContactedAt: null,
    createdBy: "user-1",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("evaluateEnrollmentConditions", () => {
  it("enrolls all leads when conditions are empty", () => {
    expect(
      evaluateEnrollmentConditions({
        lead: buildLead(),
        conditions: [],
        logic: "AND",
      }),
    ).toBe(true);
  });

  it("matches project, source, status, and assigned user with AND logic", () => {
    const lead = buildLead();

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "AND",
        conditions: [
          { field: "projectId", operator: "equals", value: TEST_PROJECT_ID },
          { field: "sourceId", operator: "equals", value: "source-1" },
          { field: "statusId", operator: "equals", value: "status-1" },
          { field: "assignedTo", operator: "equals", value: "user-1" },
        ],
      }),
    ).toBe(true);
  });

  it("supports OR logic for mixed conditions", () => {
    const lead = buildLead({ sourceId: "other-source" });

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "OR",
        conditions: [
          { field: "sourceId", operator: "equals", value: "source-1" },
          { field: "projectId", operator: "equals", value: TEST_PROJECT_ID },
        ],
      }),
    ).toBe(true);
  });

  it("matches tag contains and rejects when tag is missing", () => {
    const lead = buildLead();

    expect(
      evaluateEnrollmentConditions({
        lead,
        logic: "AND",
        conditions: [{ field: "tags", operator: "contains", value: "tag-1" }],
      }),
    ).toBe(true);

    expect(
      evaluateEnrollmentConditions({
        lead: buildLead({ tags: [] }),
        logic: "AND",
        conditions: [{ field: "tags", operator: "contains", value: "tag-1" }],
      }),
    ).toBe(false);
  });
});
