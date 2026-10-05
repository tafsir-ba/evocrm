import type { ReactNode } from "react";

import { IconChat, IconMail, IconPhone } from "@/lib/icons";
import { telHref, whatsappHref } from "@/lib/leads-table";
import { cn } from "@/lib/utils";

function ContactAction({
  href,
  label,
  icon,
  external,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--color-line)] bg-white px-2 text-[14px] md:gap-1.5 md:px-3 font-medium text-[var(--color-ink)] shadow-[var(--shadow-xs)] hover:border-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] md:h-9 md:text-[13px]"
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

/** One-tap Call / WhatsApp / Email for brokers working from their phone. */
export function LeadContactActions({
  phone,
  email,
  className,
}: {
  phone?: string | null;
  email?: string | null;
  className?: string;
}) {
  const whatsapp = phone ? whatsappHref(phone) : null;
  if (!phone && !email) {
    return null;
  }

  return (
    <div role="group" className={cn("flex gap-2", className)} aria-label="Contact lead">
      {phone ? <ContactAction href={telHref(phone)} label="Call" icon={<IconPhone size={16} />} /> : null}
      {whatsapp ? (
        <ContactAction href={whatsapp} label="WhatsApp" icon={<IconChat size={16} />} external />
      ) : null}
      {email ? (
        <ContactAction href={`mailto:${email}`} label="Email" icon={<IconMail size={16} />} />
      ) : null}
    </div>
  );
}
