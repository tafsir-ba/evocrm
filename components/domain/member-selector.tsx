"use client";

import { cn } from "@/lib/utils";

export type MemberSelectorMember = {
  userId: string;
  name: string | null;
  email: string;
};

export type MemberSelectorProps = {
  members: MemberSelectorMember[];
  selectedUserId?: string | null;
  onChange?: (userId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  id?: string;
  name?: string;
};

export function MemberSelector({
  members,
  selectedUserId = null,
  onChange,
  disabled = false,
  placeholder = "Unassigned",
  emptyLabel = "No workspace members available",
  className,
  id,
  name,
}: MemberSelectorProps) {
  if (members.length === 0) {
    return (
      <p className={cn("text-[12.5px] text-[var(--color-ink-muted)]", className)}>
        {emptyLabel}
      </p>
    );
  }

  if (!onChange) {
    const selected = members.find((member) => member.userId === selectedUserId);

    return (
      <p className={cn("text-[13px] text-[var(--color-ink)]", className)}>
        {selected ? formatMemberLabel(selected) : placeholder}
      </p>
    );
  }

  return (
    <select
      id={id}
      name={name}
      value={selectedUserId ?? ""}
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        onChange(value === "" ? null : value);
      }}
      className={cn(
        "w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] text-[var(--color-ink)] focus-ring",
        disabled && "opacity-60 cursor-not-allowed",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {formatMemberLabel(member)}
        </option>
      ))}
    </select>
  );
}

function formatMemberLabel(member: MemberSelectorMember): string {
  if (member.name) {
    return `${member.name} (${member.email})`;
  }

  return member.email;
}
