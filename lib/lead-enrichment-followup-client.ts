import { shouldRequestMarketEstimateAfterEnrichment } from "@/lib/lead-financial-situation";

type EnrichedLeadSnapshot = {
  jobTitle?: string | null;
  industry?: string | null;
  company?: { name?: string | null } | null;
  professionalProfileUrl?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
};

/**
 * After a unique enrichment reveal, requests the occupational market estimate using the same
 * eligibility rule as the lead profile. Returns true when an estimate request succeeded.
 */
export async function requestMarketEstimateAfterEnrichment({
  apiBase,
  leadId,
}: {
  apiBase: string;
  leadId: string;
}): Promise<boolean> {
  const leadResponse = await fetch(`${apiBase}/leads/${leadId}`);
  if (!leadResponse.ok) {
    return false;
  }
  const payload = (await leadResponse.json()) as { data?: { lead?: EnrichedLeadSnapshot } };
  const lead = payload.data?.lead;
  if (
    !lead ||
    !shouldRequestMarketEstimateAfterEnrichment({
      uniqueReveal: true,
      jobTitle: lead.jobTitle,
      industry: lead.industry,
      companyName: lead.company?.name,
      professionalProfileUrl: lead.professionalProfileUrl,
      city: lead.city,
      stateRegion: lead.stateRegion,
      country: lead.country,
    })
  ) {
    return false;
  }

  const estimateResponse = await fetch(
    `${apiBase}/leads/${leadId}/financial-situation/market-estimate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  return estimateResponse.ok;
}
