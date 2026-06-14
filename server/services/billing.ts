import "server-only";

import { createAuditLog } from "@/server/audit/create-audit-log";

export type BillingShellView = {
  planName: string;
  planStatus: string;
  billingOwner: string;
  stripeConnected: boolean;
  message: string;
};

export async function getBillingShell(input: {
  workspaceId: string;
  actorId: string;
}): Promise<BillingShellView> {
  await createAuditLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "billing.placeholder_viewed",
    entityType: "billing",
    entityId: input.workspaceId,
  });

  return {
    planName: "Beta (placeholder)",
    planStatus: "No active subscription",
    billingOwner: "Workspace owner",
    stripeConnected: false,
    message:
      "Stripe integration is planned for a later release. No pricing or live billing is configured.",
  };
}
