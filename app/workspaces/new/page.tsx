import Link from "next/link";

import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Create workspace — EvoHome CRM" };

export default function NewWorkspacePage() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <div className="max-w-lg mx-auto px-6 py-10">
        <PageHeader
          title="Create workspace"
          description="Set up a new workspace for your team. You will be assigned the Owner role."
        />

        <div className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-6">
          <CreateWorkspaceForm />
        </div>

        <p className="mt-6 text-center text-[13px] text-[var(--color-ink-muted)]">
          <Link href="/workspaces" className="hover:text-[var(--color-ink)] focus-ring rounded">
            Back to workspaces
          </Link>
        </p>
      </div>
    </div>
  );
}
