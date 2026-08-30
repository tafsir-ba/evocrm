import "server-only";

import { CAMPAIGN_GUARD_BLOCK_REASON, canEnrollLeadInCampaigns } from "@/lib/campaign-enrollment-guard";
import { createAuditLog } from "@/server/audit/create-audit-log";
import { captureError } from "@/server/observability/capture-error";
import type { LeadRecord } from "@/server/repositories/leads";
import type { EnrollmentCondition, EnrollmentRules } from "@/server/repositories/campaigns";
import { findActiveAutoEnrollmentCampaigns } from "@/server/repositories/campaigns";
import { findLeadById } from "@/server/repositories/leads";
import { enrollLeadInCampaignWithContext } from "@/server/services/campaign-enrollments";

export type AutoEnrollmentTrigger = "new_lead" | "lead_updated";

export type ParsedCustomFieldCondition = {
  key: string | undefined;
  expectedValue: string | undefined;
};

/** Parses structured and legacy `field_key:expected` custom-field rule values. */
export function parseCustomFieldCondition(
  condition: EnrollmentCondition,
): ParsedCustomFieldCondition {
  if (condition.field !== "customField") {
    return { key: undefined, expectedValue: undefined };
  }

  if (condition.customFieldKey?.trim()) {
    const expectedValue =
      condition.operator === "is_empty" || condition.operator === "is_not_empty"
        ? undefined
        : condition.value != null
          ? String(condition.value)
          : undefined;

    return {
      key: condition.customFieldKey.trim(),
      expectedValue,
    };
  }

  if (typeof condition.value !== "string" || !condition.value.trim()) {
    return { key: undefined, expectedValue: undefined };
  }

  const colonIndex = condition.value.indexOf(":");

  if (colonIndex === -1) {
    return { key: condition.value.trim(), expectedValue: undefined };
  }

  return {
    key: condition.value.slice(0, colonIndex).trim(),
    expectedValue: condition.value.slice(colonIndex + 1),
  };
}

function getLeadFieldValue(
  lead: LeadRecord,
  field: EnrollmentCondition["field"],
  customFieldKey?: string,
): unknown {
  switch (field) {
    case "projectId":
      return lead.projectId;
    case "tags":
      return lead.tags;
    case "sourceId":
      return lead.sourceId;
    case "statusId":
      return lead.statusId;
    case "assignedTo":
      return lead.assignedTo;
    case "customField":
      if (!customFieldKey) {
        return null;
      }
      return lead.attributes?.[customFieldKey] ?? null;
    default:
      return null;
  }
}

function resolveComparisonValue(
  condition: EnrollmentCondition,
  parsedCustomField: ParsedCustomFieldCondition,
): EnrollmentCondition["value"] {
  if (condition.field !== "customField") {
    return condition.value;
  }

  if (parsedCustomField.expectedValue !== undefined) {
    return parsedCustomField.expectedValue;
  }

  if (condition.customFieldKey?.trim()) {
    return condition.value;
  }

  return condition.value;
}

function evaluateCondition(lead: LeadRecord, condition: EnrollmentCondition): boolean {
  const parsedCustomField = parseCustomFieldCondition(condition);
  const customFieldKey =
    condition.field === "customField" ? parsedCustomField.key : undefined;
  const actual = getLeadFieldValue(lead, condition.field, customFieldKey);
  const comparisonValue = resolveComparisonValue(condition, parsedCustomField);

  switch (condition.operator) {
    case "is_empty":
      return (
        actual === null ||
        actual === undefined ||
        actual === "" ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case "is_not_empty":
      return !(
        actual === null ||
        actual === undefined ||
        actual === "" ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case "equals": {
      if (Array.isArray(comparisonValue)) {
        if (Array.isArray(actual)) {
          return comparisonValue.every((item) => actual.includes(String(item)));
        }
        return comparisonValue.map(String).includes(String(actual));
      }
      return String(actual) === String(comparisonValue);
    }
    case "not_equals": {
      if (Array.isArray(comparisonValue)) {
        if (Array.isArray(actual)) {
          return !comparisonValue.every((item) => actual.includes(String(item)));
        }
        return !comparisonValue.map(String).includes(String(actual));
      }
      return String(actual) !== String(comparisonValue);
    }
    case "contains": {
      if (Array.isArray(actual)) {
        if (Array.isArray(comparisonValue)) {
          return comparisonValue.some((item) => actual.includes(String(item)));
        }
        return actual.includes(String(comparisonValue));
      }
      if (typeof actual === "string" && comparisonValue != null) {
        return actual.toLowerCase().includes(String(comparisonValue).toLowerCase());
      }
      return false;
    }
    case "not_contains": {
      if (Array.isArray(actual)) {
        if (Array.isArray(comparisonValue)) {
          return !comparisonValue.some((item) => actual.includes(String(item)));
        }
        return !actual.includes(String(comparisonValue));
      }
      if (typeof actual === "string" && comparisonValue != null) {
        return !actual.toLowerCase().includes(String(comparisonValue).toLowerCase());
      }
      return true;
    }
    default:
      return false;
  }
}

export function evaluateEnrollmentConditions(input: {
  lead: LeadRecord;
  conditions: EnrollmentCondition[];
  logic: EnrollmentRules["logic"];
}): boolean {
  const { lead, conditions, logic } = input;

  if (conditions.length === 0) {
    return true;
  }

  if (logic === "OR") {
    return conditions.some((condition) => evaluateCondition(lead, condition));
  }

  return conditions.every((condition) => evaluateCondition(lead, condition));
}

export function logAutoEnrollmentFailure(
  input: {
    workspaceId: string;
    leadId: string;
    trigger: AutoEnrollmentTrigger;
    actorId: string;
  },
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);

  captureError(error, {
    workspaceId: input.workspaceId,
    tags: {
      leadId: input.leadId,
      trigger: input.trigger,
      domain: "campaign_auto_enrollment",
    },
  });

  void Promise.resolve(
    createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "campaign.auto_enrollment_failed",
      entityType: "lead",
      entityId: input.leadId,
      after: {
        trigger: input.trigger,
        message,
      },
    }),
  ).catch(() => undefined);
}

export function scheduleCampaignAutoEnrollmentForLead(input: {
  workspaceId: string;
  leadId: string;
  trigger: AutoEnrollmentTrigger;
  actorId: string;
}): void {
  void Promise.resolve(evaluateCampaignAutoEnrollmentForLead(input)).catch((error) => {
    logAutoEnrollmentFailure(input, error);
  });
}

export async function evaluateCampaignAutoEnrollmentForLead(input: {
  workspaceId: string;
  leadId: string;
  trigger: AutoEnrollmentTrigger;
  actorId: string;
}): Promise<void> {
  const lead = await findLeadById(input.workspaceId, input.leadId);

  if (!lead || lead.archivedAt) {
    return;
  }

  if (!lead.projectId) {
    return;
  }

  if (!canEnrollLeadInCampaigns(lead.attributes)) {
    await createAuditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "campaign.auto_enrollment_skipped",
      entityType: "lead",
      entityId: lead.id,
      after: {
        trigger: input.trigger,
        reason: CAMPAIGN_GUARD_BLOCK_REASON,
      },
    });
    return;
  }

  const campaigns = await findActiveAutoEnrollmentCampaigns(input.workspaceId, {
    audienceType: "leads",
    trigger: input.trigger,
  });

  for (const campaign of campaigns) {
    if (campaign.projectIds.length > 0 && !campaign.projectIds.includes(lead.projectId)) {
      continue;
    }

    const matches = evaluateEnrollmentConditions({
      lead,
      conditions: campaign.enrollmentRules.conditions,
      logic: campaign.enrollmentRules.logic,
    });

    if (!matches) {
      continue;
    }

    const enrolled = await enrollLeadInCampaignWithContext({
      workspaceId: input.workspaceId,
      campaignId: campaign.id,
      leadId: lead.id,
      actorId: input.actorId,
      projectId: lead.projectId,
      enrollmentSource: "rule_based_auto_enrollment",
      enrollmentReason: {
        trigger: input.trigger,
        matchedConditions: campaign.enrollmentRules.conditions,
      },
    });

    if (!enrolled) {
      await createAuditLog({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "campaign.auto_enrollment_skipped",
        entityType: "lead",
        entityId: lead.id,
        after: {
          trigger: input.trigger,
          campaignId: campaign.id,
        },
      });
    }
  }
}
