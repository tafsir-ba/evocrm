/**
 * Downloadable vCard for a lead.
 *
 * This CRM has no phone address-book integration, so the card is a .vcf
 * the user imports. It is not automatic contact sync.
 *
 * Name fields are mapped for the phone's Contacts app:
 *   GIVEN (first name)  = "{Project name} Client"
 *   FAMILY (last name)  = the lead's full name
 * The project label is taken from that lead's project. Other properties are
 * written only when the CRM has a value.
 *
 * UID is the lead id. Importing the same card again can update one contact
 * on address books that match UID. A file download cannot force that merge.
 */

export function projectClientLabel(
  projectName: string | null | undefined,
): string | null {
  const name = projectName?.replace(/\s+/g, " ").trim();
  if (!name) {
    return null;
  }
  return name.toLowerCase().endsWith(" client") ? name : `${name} Client`;
}

export type LeadContactNameFields = {
  /** vCard N given name: "{Project name} Client", or empty when the lead has no project. */
  given: string;
  /** vCard N family name: the lead's full name. */
  family: string;
  /** vCard FN, given name then family name. */
  formatted: string;
};

function collapse(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function leadContactNameFields(input: {
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  projectName?: string | null;
}): LeadContactNameFields {
  const explicit = collapse(input.fullName);
  const combined = [collapse(input.firstName), collapse(input.lastName)]
    .filter(Boolean)
    .join(" ");
  const family = explicit || combined;
  const given = projectClientLabel(input.projectName) ?? "";
  return {
    given,
    family,
    formatted: [given, family].filter(Boolean).join(" "),
  };
}

export function leadPhoneContactName(
  fullName: string,
  projectName: string | null | undefined,
): string {
  return leadContactNameFields({ fullName, projectName }).formatted;
}

export type LeadContactCardInput = {
  leadId: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  projectName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  country?: string | null;
  notes?: string | null;
  profileUrl?: string | null;
  updatedAt?: string | null;
};

export type LeadContactCard = {
  contactName: string;
  givenName: string;
  familyName: string;
  fileName: string;
  vcard: string;
  uid: string;
};

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatRev(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) {
    return null;
  }
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function fileSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return slug.slice(0, 80) || "lead-contact";
}

function phoneForCard(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return trimmed;
  }
  return hasPlus ? `+${digits}` : digits;
}

function publicProfileUrl(value: string | null | undefined): string | null {
  const trimmed = collapse(value);
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function leadContactUid(leadId: string): string {
  return `urn:evocrm:lead:${leadId.trim()}`;
}

/** Returns null when there is no phone number to put on the card. */
export function buildLeadContactCard(
  input: LeadContactCardInput,
): LeadContactCard | null {
  const phone = input.phone.trim();
  const leadId = input.leadId.trim();
  if (!phone || !leadId) {
    return null;
  }

  const names = leadContactNameFields(input);
  const contactName = names.formatted || phoneForCard(phone);
  const uid = leadContactUid(leadId);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//EvoHome CRM//Lead Contact//EN",
    `UID:${escapeVCard(uid)}`,
    `FN:${escapeVCard(contactName)}`,
    `N:${escapeVCard(names.family)};${escapeVCard(names.given)};;;`,
  ];

  lines.push(`TEL;TYPE=CELL:${escapeVCard(phoneForCard(phone))}`);

  const email = collapse(input.email);
  if (email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);
  }

  const company = collapse(input.companyName);
  if (company) {
    lines.push(`ORG:${escapeVCard(company)}`);
  }

  const title = collapse(input.jobTitle);
  if (title) {
    lines.push(`TITLE:${escapeVCard(title)}`);
  }

  const city = collapse(input.city);
  const region = collapse(input.stateRegion);
  const country = collapse(input.country);
  if (city || region || country) {
    lines.push(
      `ADR:;;;${escapeVCard(city)};${escapeVCard(region)};;${escapeVCard(country)}`,
    );
  }

  const profile = publicProfileUrl(input.profileUrl);
  if (profile) {
    lines.push(`URL:${escapeVCard(profile)}`);
  }

  const noteParts = [`EvoHome CRM lead ${leadId}.`];
  const notes = input.notes?.trim();
  if (notes) {
    noteParts.unshift(notes);
  }
  lines.push(`NOTE:${escapeVCard(noteParts.join("\n"))}`);
  lines.push(`X-EVOCRM-LEAD-ID:${escapeVCard(leadId)}`);

  const rev = formatRev(input.updatedAt);
  if (rev) {
    lines.push(`REV:${rev}`);
  }
  lines.push("END:VCARD");

  const fileName = `${fileSlug(contactName)}.vcf`;
  return {
    contactName,
    givenName: names.given,
    familyName: names.family,
    fileName,
    vcard: `${lines.join("\r\n")}\r\n`,
    uid,
  };
}
