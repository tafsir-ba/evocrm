/**
 * Project-list campaign counts are configuration attachment only.
 *
 * A campaign with empty projectIds is workspace-wide / global. It must never
 * be shown as a per-project "dripping" figure — that implied every project's
 * leads were enrolled. Enrollment is a separate data path and is not counted
 * or triggered here.
 */

export type CampaignProjectAttachment = {
  projectIds?: string[] | null;
};

export function isProjectAttachedCampaign(
  campaign: CampaignProjectAttachment,
  projectId: string,
): boolean {
  return (campaign.projectIds ?? []).includes(projectId);
}

export function countAttachedCampaignsByProject(
  campaigns: CampaignProjectAttachment[],
  projectIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const projectId of projectIds) {
    counts.set(projectId, 0);
  }

  for (const campaign of campaigns) {
    const attachedIds = new Set(
      (campaign.projectIds ?? []).filter((projectId) => counts.has(projectId)),
    );
    for (const projectId of attachedIds) {
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
    }
  }

  return counts;
}
