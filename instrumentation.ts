export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startInternalCampaignCronWorker } = await import(
    "@/server/campaign-cron-worker"
  );
  startInternalCampaignCronWorker();
}
