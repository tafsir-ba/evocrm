export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Load the DB helper first so production autoIndex is disabled before
  // cron or the first request compiles Mongoose models.
  await import("./server/db/mongoose");

  const { startInternalCampaignCronWorker } = await import(
    "./server/campaign-cron-worker"
  );
  startInternalCampaignCronWorker();

  const { startInternalHubSpotSyncCronWorker } = await import(
    "./server/hubspot-sync-cron-worker"
  );
  startInternalHubSpotSyncCronWorker();
}
