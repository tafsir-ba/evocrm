import { whatsappHref } from "@/lib/leads-table";

export const WHATSAPP_VIEWING_LINE =
  "Please reply if you would like to arrange a viewing.";

const MAX_MESSAGE_LENGTH = 1500;
const MAX_PROPERTIES = 3;

export type WelcomeProperty = {
  id?: string;
  title?: string | null;
  reference?: string | null;
  price?: number | null;
  currency?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  city?: string | null;
  address?: string | null;
  country?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
};

export type WelcomeDocument = {
  fileName: string;
  url?: string | null;
};

export type LeadWhatsAppWelcomeInput = {
  fullName: string;
  firstName?: string | null;
  projectName?: string | null;
  projectWebsite?: string | null;
  projectCity?: string | null;
  projectCountry?: string | null;
  projectAddress?: string | null;
  properties?: WelcomeProperty[];
  documents?: WelcomeDocument[];
};

export type LeadWhatsAppDraft = {
  message: string;
  unlinkedFileNames: string[];
};

type MaterialKind = "brochure" | "floor_plan";

type MaterialLink = {
  kind: MaterialKind;
  label: string;
  url: string | null;
};

const BROCHURE_PATTERN = /\bbrochures?\b/i;
const FLOOR_PLAN_PATTERN = /floor[\s_-]*plans?|floorplans?/i;
const MATERIAL_KEY_PATTERN = /brochure|floor[\s_-]*plan|floorplan/i;

export function publicHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/[),.;]+$/g, "");
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname || isExpiringSignedUrl(url)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Presigned object URLs expire and must not be pasted into a WhatsApp draft. */
function isExpiringSignedUrl(url: URL): boolean {
  const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  if (
    keys.some(
      (key) =>
        key.startsWith("x-amz-") ||
        key.startsWith("x-goog-") ||
        key === "awsaccesskeyid",
    )
  ) {
    return true;
  }
  const signed =
    keys.includes("signature") &&
    (keys.includes("expires") ||
      keys.includes("policy") ||
      keys.includes("key-pair-id"));
  return signed;
}

function classifyMaterialText(value: string): MaterialKind | null {
  if (FLOOR_PLAN_PATTERN.test(value)) {
    return "floor_plan";
  }
  if (BROCHURE_PATTERN.test(value)) {
    return "brochure";
  }
  return null;
}

function materialLabel(kind: MaterialKind): string {
  return kind === "floor_plan" ? "Floor plan" : "Brochure";
}

function collectAttributeLinks(
  attributes: Record<string, unknown> | null | undefined,
  into: MaterialLink[],
): void {
  if (!attributes) {
    return;
  }
  const visit = (key: string, value: unknown) => {
    if (!MATERIAL_KEY_PATTERN.test(key)) {
      if (value && typeof value === "object") {
        for (const [childKey, childValue] of Object.entries(
          value as Record<string, unknown>,
        )) {
          visit(childKey, childValue);
        }
      }
      return;
    }
    const kind = classifyMaterialText(key) ?? "brochure";
    if (typeof value === "string") {
      const url = publicHttpUrl(value);
      if (url) {
        into.push({ kind, label: materialLabel(kind), url });
      }
    }
  };
  for (const [key, value] of Object.entries(attributes)) {
    visit(key, value);
  }
}

function collectDescriptionLinks(
  description: string | null | undefined,
  into: MaterialLink[],
): void {
  if (!description) {
    return;
  }
  const matches = description.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const match of matches) {
    const url = publicHttpUrl(match);
    if (!url) {
      continue;
    }
    const index = description.indexOf(match);
    const windowText = description.slice(
      Math.max(0, index - 80),
      index + match.length + 80,
    );
    const kind = classifyMaterialText(windowText);
    if (!kind) {
      continue;
    }
    into.push({ kind, label: materialLabel(kind), url });
  }
}

function collectDocumentMaterials(documents: WelcomeDocument[] | undefined): {
  links: MaterialLink[];
  unlinkedFileNames: string[];
} {
  const links: MaterialLink[] = [];
  const unlinkedFileNames: string[] = [];
  for (const document of documents ?? []) {
    const fileName = document.fileName?.trim();
    if (!fileName) {
      continue;
    }
    const kind = classifyMaterialText(fileName);
    if (!kind) {
      continue;
    }
    const url = publicHttpUrl(document.url);
    if (url) {
      links.push({ kind, label: materialLabel(kind), url });
    } else {
      unlinkedFileNames.push(fileName);
    }
  }
  return { links, unlinkedFileNames };
}

function dedupeMaterials(links: MaterialLink[]): MaterialLink[] {
  const seen = new Set<string>();
  const result: MaterialLink[] = [];
  for (const link of links) {
    const key = `${link.kind}:${(link.url ?? link.label).toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(link);
  }
  return result;
}

function greetingName(input: LeadWhatsAppWelcomeInput): string {
  const first = input.firstName?.trim();
  if (first) {
    return first;
  }
  const token = input.fullName.trim().split(/\s+/)[0];
  return token || "there";
}

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (price == null || !Number.isFinite(price)) {
    return null;
  }
  const code = currency?.trim();
  if (code && /^[A-Z]{3}$/i.test(code)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code.toUpperCase(),
        maximumFractionDigits: 0,
      }).format(price);
    } catch {
      return `${price.toLocaleString()} ${code.toUpperCase()}`;
    }
  }
  return price.toLocaleString();
}

function propertyBlock(property: WelcomeProperty): string | null {
  const title = property.title?.trim();
  const reference = property.reference?.trim();
  const heading = title
    ? reference
      ? `${title} (${reference})`
      : title
    : reference || null;
  const facts = [
    property.bedrooms != null
      ? `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"}`
      : null,
    property.bathrooms != null
      ? `${property.bathrooms} bathroom${property.bathrooms === 1 ? "" : "s"}`
      : null,
    [property.address?.trim(), property.city?.trim(), property.country?.trim()]
      .filter(Boolean)
      .join(", ") || null,
  ].filter(Boolean);
  const price = formatPrice(property.price, property.currency);
  const lines = [
    heading ? `Property: ${heading}` : null,
    facts.length > 0 ? facts.join(" · ") : null,
    price ? `Price: ${price}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

export function buildLeadWhatsAppWelcome(
  input: LeadWhatsAppWelcomeInput,
): LeadWhatsAppDraft {
  const materials: MaterialLink[] = [];
  const unlinked = new Set<string>();

  for (const property of input.properties ?? []) {
    collectAttributeLinks(property.attributes, materials);
    collectDescriptionLinks(property.description, materials);
  }
  const fromDocuments = collectDocumentMaterials(input.documents);
  materials.push(...fromDocuments.links);
  for (const fileName of fromDocuments.unlinkedFileNames) {
    unlinked.add(fileName);
  }

  const website = publicHttpUrl(input.projectWebsite);
  const websiteKind = website ? classifyMaterialText(website) : null;
  if (website && websiteKind) {
    materials.push({
      kind: websiteKind,
      label: materialLabel(websiteKind),
      url: website,
    });
  }

  const uniqueMaterials = dedupeMaterials(materials);
  const lines: string[] = [`Hello ${greetingName(input)},`, ""];

  const projectName = input.projectName?.trim();
  lines.push(
    projectName
      ? `Thank you for your interest in ${projectName}.`
      : "Thank you for your interest.",
  );

  const location = [
    input.projectAddress?.trim(),
    input.projectCity?.trim(),
    input.projectCountry?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  if (
    location &&
    !(input.properties ?? []).some(
      (property) => property.address || property.city,
    )
  ) {
    lines.push(location);
  }

  const propertyLines = (input.properties ?? [])
    .slice(0, MAX_PROPERTIES)
    .map(propertyBlock)
    .filter((block): block is string => Boolean(block));
  if (propertyLines.length > 0) {
    lines.push("", propertyLines.join("\n\n"));
  }

  if (website && !websiteKind) {
    lines.push("", `Project site: ${website}`);
  }

  if (uniqueMaterials.length > 0 || unlinked.size > 0) {
    lines.push("");
    for (const material of uniqueMaterials) {
      if (material.url) {
        lines.push(`${material.label}: ${material.url}`);
      }
    }
    for (const fileName of unlinked) {
      const kind = classifyMaterialText(fileName);
      const label = kind ? materialLabel(kind) : "File";
      lines.push(`${label} on file: ${fileName}`);
    }
  }

  lines.push("", WHATSAPP_VIEWING_LINE);
  let message = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (message.length > MAX_MESSAGE_LENGTH) {
    const closing = `\n\n${WHATSAPP_VIEWING_LINE}`;
    message = `${message.slice(0, MAX_MESSAGE_LENGTH - closing.length).trimEnd()}${closing}`;
  }
  if (!message.endsWith(WHATSAPP_VIEWING_LINE)) {
    message = `${message}\n\n${WHATSAPP_VIEWING_LINE}`;
  }

  return {
    message,
    unlinkedFileNames: [...unlinked],
  };
}

export function leadWhatsAppHref(
  phone: string | null | undefined,
  message: string,
): string | null {
  if (!phone?.trim()) {
    return null;
  }
  return whatsappHref(phone, message);
}

type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord | null> {
  if (!response.ok) {
    return null;
  }
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function propertyFromRecord(record: JsonRecord): WelcomeProperty {
  const location = asRecord(record.location);
  return {
    id: asString(record.id) ?? undefined,
    title: asString(record.title),
    reference: asString(record.reference),
    price: asNumber(record.price),
    currency: asString(record.currency),
    bedrooms: asNumber(record.bedrooms),
    bathrooms: asNumber(record.bathrooms),
    city: asString(record.city) ?? asString(location?.municipality),
    address: asString(record.address) ?? asString(location?.normalizedAddress),
    country: asString(record.country) ?? asString(location?.countryName),
    description: asString(record.description),
    attributes: asRecord(record.attributes) ?? undefined,
  };
}

/**
 * Loads the lead's own project, linked properties, and their documents.
 * Missing permissions or empty records are skipped. No brochure URL is invented.
 */
export async function loadLeadWhatsAppDraft(input: {
  workspaceSlug: string;
  leadId: string;
  fullName: string;
  firstName?: string | null;
  projectId?: string | null;
  propertyReference?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<LeadWhatsAppDraft> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiBase = `/api/workspaces/${input.workspaceSlug}`;
  let projectName: string | null = null;
  let projectWebsite: string | null = null;
  let projectCity: string | null = null;
  let projectCountry: string | null = null;
  let projectAddress: string | null = null;

  if (input.projectId) {
    const projectPayload = await readJson(
      await fetchImpl(`${apiBase}/projects/${input.projectId}`),
    );
    const project =
      asRecord(projectPayload?.data) &&
      asRecord((projectPayload?.data as JsonRecord).project);
    if (project) {
      projectName = asString(project.name);
      projectWebsite = asString(project.website);
      projectCity = asString(project.city);
      projectCountry = asString(project.country);
      projectAddress = asString(project.address);
      const location = asRecord(project.location);
      projectCity = projectCity ?? asString(location?.municipality);
      projectCountry = projectCountry ?? asString(location?.countryName);
      projectAddress = projectAddress ?? asString(location?.normalizedAddress);
    }
  }

  const properties: WelcomeProperty[] = [];
  const opportunityPayload = await readJson(
    await fetchImpl(
      `${apiBase}/opportunities?leadId=${encodeURIComponent(input.leadId)}&pageSize=20`,
    ),
  );
  const opportunities = Array.isArray(opportunityPayload?.data)
    ? opportunityPayload.data
    : [];
  const propertyIds: string[] = [];
  for (const item of opportunities) {
    const record = asRecord(item);
    const property = record ? asRecord(record.property) : null;
    const id = property ? asString(property.id) : null;
    if (id && !propertyIds.includes(id)) {
      propertyIds.push(id);
    }
  }

  if (propertyIds.length === 0 && input.projectId) {
    const listPayload = await readJson(
      await fetchImpl(
        `${apiBase}/properties?projectId=${encodeURIComponent(input.projectId)}&pageSize=25`,
      ),
    );
    const listed = Array.isArray(listPayload?.data) ? listPayload.data : [];
    const records = listed
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => Boolean(item));
    const reference = input.propertyReference?.trim().toLowerCase();
    const matched = reference
      ? records.find(
          (record) =>
            asString(record.reference)?.trim().toLowerCase() === reference,
        )
      : null;
    if (matched) {
      properties.push(propertyFromRecord(matched));
    } else if (records.length === 1) {
      properties.push(propertyFromRecord(records[0]!));
    }
  }

  for (const propertyId of propertyIds.slice(0, MAX_PROPERTIES)) {
    const payload = await readJson(
      await fetchImpl(`${apiBase}/properties/${propertyId}`),
    );
    const property =
      asRecord(payload?.data) &&
      asRecord((payload?.data as JsonRecord).property);
    if (property) {
      properties.push(propertyFromRecord(property));
    }
  }

  const documents: WelcomeDocument[] = [];
  const documentTargets: Array<{ type: "property" | "lead"; id: string }> = [
    ...properties
      .map((property) => property.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ type: "property" as const, id })),
    { type: "lead", id: input.leadId },
  ];
  for (const target of documentTargets) {
    const payload = await readJson(
      await fetchImpl(
        `${apiBase}/documents?linkedEntityType=${target.type}&linkedEntityId=${encodeURIComponent(target.id)}&pageSize=100`,
      ),
    );
    const docs = Array.isArray(payload?.data) ? payload.data : [];
    for (const item of docs) {
      const record = asRecord(item);
      const fileName = record ? asString(record.fileName) : null;
      if (fileName) {
        documents.push({ fileName });
      }
    }
  }

  return buildLeadWhatsAppWelcome({
    fullName: input.fullName,
    firstName: input.firstName,
    projectName,
    projectWebsite,
    projectCity,
    projectCountry,
    projectAddress,
    properties,
    documents,
  });
}
