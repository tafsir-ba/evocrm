import { SessionRecovery } from "@/components/auth/session-recovery";

export const metadata = { title: "Refreshing session — EvoHome CRM" };

export default function SessionExpiredPage() {
  return <SessionRecovery />;
}
