import { AdminShell } from "@/components/layout/admin-shell";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { isPlatformAdminEmail } from "@/server/auth/platform-admin";
import { requireAuth } from "@/server/auth/require-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  if (!isPlatformAdminEmail(session.user.email)) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <PermissionDenied
            title="Platform admin required"
            description="This area is restricted to the platform operator account."
          />
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      user={{
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      }}
    >
      {children}
    </AdminShell>
  );
}
