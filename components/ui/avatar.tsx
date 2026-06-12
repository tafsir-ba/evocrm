import { cn } from "@/lib/utils";
import type { User } from "@/lib/mock-data";

const PALETTE = [
  "#2563eb",
  "#9333ea",
  "#0891b2",
  "#16a34a",
  "#dc2626",
  "#ea580c",
  "#7c3aed",
  "#0f766e",
];

function colorFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum = (sum + id.charCodeAt(i)) % 1000;
  return PALETTE[sum % PALETTE.length];
}

export function Avatar({
  user,
  size = 28,
  className,
}: {
  user?: Pick<User, "id" | "initials" | "name">;
  size?: number;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-[var(--color-muted)] text-[var(--color-ink-muted)] text-[11px] font-semibold",
          className,
        )}
        style={{ width: size, height: size }}
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-semibold uppercase",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: colorFor(user.id),
        fontSize: Math.max(10, size * 0.4),
      }}
      title={user.name}
    >
      {user.initials}
    </span>
  );
}

export function AvatarWithName({
  user,
  size = 24,
  subtle = false,
}: {
  user: Pick<User, "id" | "initials" | "name">;
  size?: number;
  subtle?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar user={user} size={size} />
      <span
        className={cn(
          "truncate text-[13px]",
          subtle ? "text-[var(--color-ink-muted)]" : "text-[var(--color-ink)]",
        )}
      >
        {user.name}
      </span>
    </span>
  );
}
