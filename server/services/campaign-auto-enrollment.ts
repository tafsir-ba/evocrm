import "server-only";

import type { LeadRecord } from "@/server/repositories/leads";
import type { EnrollmentCondition, EnrollmentRules } from "@/server/repositories/campaigns";
import { findActiveAutoEnrollmentCampaigns } from "@/server/repositories/campaigns";
import { findLeadById } from "@/server/repositories/leads";
import { enrollLeadInCampaignWithContext } from "@/server/services/campaign-enrollments";

export type AutoEnrollmentTrigger = "new_lead" | "lead_updated";

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

function evaluateCondition(lead: LeadRecord, condition: EnrollmentCondition): boolean {
  const customFieldKey =
    condition.field === "customField" && typeof condition.value === "string"
      ? condition.value.split(":")[0]
      : undefined;
  const actual = getLeadFieldValue(lead, condition.field, customFieldKey);

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
      if (Array.isArray(condition.value)) {
        if (Array.isArray(actual)) {
          return condition.value.every((item) => actual.includes(String(item)));
        }
        return condition.value.map(String).includes(String(actual));
      }
      return String(actual) === String(condition.value);
    }
    case "not_equals": {
      if (Array.isArray(condition.value)) {
        if (Array.isArray(actual)) {
          return !condition.value.every((item) => actual.includes(String(item)));
        }
        return !condition.value.map(String).includes(String(actual));
      }
      return String(actual) !== String(condition.value);
    }
    case "contains": {
      if (Array.isArray(actual)) {
        if (Array.isArray(condition.value)) {
          return condition.value.some((item) => actual.includes(String(item)));
        }
        return actual.includes(String(condition.value));
      }
      if (typeof actual === "string" && condition.value != null) {
        return actual.toLowerCase().includes(String(condition.value).toLowerCase());
      }
      return false;
    }
    case "not_contains": {
      if (Array.isArray(actual)) {
        if (Array.isArray(condition.value)) {
          return !condition.value.some((item) => actual.includes(String(item)));
        }
        return !actual.includes(String(condition.value));
      }
      if (typeof actual === "string" && condition.value != null) {
        return !actual.toLowerCase().includes(String(condition.value).toLowerCase());
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

    await enrollLeadInCampaignWithContext({
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
  }
}
