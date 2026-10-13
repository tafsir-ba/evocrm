"use client";

import { useState, type ReactNode } from "react";

import {
  WhatsAppHandoffDialog,
  type WhatsAppHandoffLead,
} from "@/components/leads/whatsapp-handoff-dialog";
import type { LeadContactCard } from "@/lib/lead-contact-card";
import { IconChat, IconDownload, IconMail, IconPhone } from "@/lib/icons";
import { telHref } from "@/lib/leads-table";
import { cn } from "@/lib/utils";

const actionClassName =
  "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--color-line)] bg-white px-2 text-[14px] font-medium text-[var(--color-ink)] shadow-[var(--shadow-xs)] hover:border-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] md:h-9 md:gap-1.5 md:px-3 md:text-[13px]";

function ContactAction({
  href,
  label,
  icon,
  external,
  title,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
  title?: string;
}) {
  return (
    <a
      href={href}
      title={title}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={actionClassName}
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

function downloadContactCard(card: LeadContactCard): void {
  const fileName = card.fileName.endsWith(".vcf")
    ? card.fileName
    : `${card.fileName}.vcf`;
  const url = URL.createObjectURL(
    new Blob([card.vcard], { type: "text/vcard;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** One-tap Call / WhatsApp / Email for brokers working from their phone. */
export function LeadContactActions({
  phone,
  email,
  className,
  whatsapp,
  contactCard,
  handoffNote,
  handoffNoteClassName,
}: {
  phone?: string | null;
  email?: string | null;
  className?: string;
  /** Enables the WhatsApp handoff, which confirms destination and draft before opening wa.me. */
  whatsapp?: {
    workspaceSlug: string;
    lead: WhatsAppHandoffLead;
    activeProjectId?: string | null;
  } | null;
  contactCard?: LeadContactCard | null;
  handoffNote?: string | null;
  handoffNoteClassName?: string;
}) {
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  if (!phone && !email && !contactCard) {
    return null;
  }

  return (
    <div className={className}>
      <div
        role="group"
        className="grid grid-cols-2 gap-2 md:flex"
        aria-label="Contact lead"
      >
        {phone ? (
          <ContactAction
            href={telHref(phone)}
            label="Call"
            icon={<IconPhone size={16} />}
          />
        ) : null}
        {phone && whatsapp ? (
          <button
            type="button"
            aria-haspopup="dialog"
            title="Check the destination and draft, then open WhatsApp. Nothing is sent until you press send."
            className={actionClassName}
            onClick={() => setWhatsappOpen(true)}
          >
            <IconChat size={16} />
            <span className="truncate">WhatsApp</span>
          </button>
        ) : null}
        {email ? (
          <ContactAction
            href={`mailto:${email}`}
            label="Email"
            icon={<IconMail size={16} />}
          />
        ) : null}
        {contactCard ? (
          <button
            type="button"
            title={`Download ${contactCard.fileName}. First name “${contactCard.givenName || "—"}”, last name “${contactCard.familyName}”. Open the .vcf in Contacts. This does not sync the phone automatically.`}
            className={actionClassName}
            onClick={() => downloadContactCard(contactCard)}
          >
            <IconDownload size={16} />
            <span className="truncate">Download .vcf</span>
          </button>
        ) : null}
      </div>
      {handoffNote ? (
        <p
          className={cn(
            "mt-2 text-[12px] leading-snug text-[var(--color-ink-muted)]",
            handoffNoteClassName,
          )}
        >
          {handoffNote}
        </p>
      ) : null}
      {phone && whatsapp ? (
        <WhatsAppHandoffDialog
          open={whatsappOpen}
          onClose={() => setWhatsappOpen(false)}
          workspaceSlug={whatsapp.workspaceSlug}
          lead={whatsapp.lead}
          activeProjectId={whatsapp.activeProjectId}
        />
      ) : null}
    </div>
  );
}
