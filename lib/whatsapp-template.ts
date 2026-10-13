import { isExpiringSignedUrl } from "@/lib/public-url";

export const WHATSAPP_TEMPLATE_MAX_LENGTH = 1500;
export const WHATSAPP_MESSAGE_MAX_LENGTH = 2000;

export const WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  {
    key: "firstName",
    description:
      "Lead first name. Falls back to the first word of the full name.",
  },
  { key: "lastName", description: "Lead last name." },
  { key: "fullName", description: "Lead full name." },
  { key: "projectName", description: "This project's name." },
] as const;

export type WhatsAppTemplatePlaceholder =
  (typeof WHATSAPP_TEMPLATE_PLACEHOLDERS)[number]["key"];

const KNOWN_PLACEHOLDERS = new Set<string>(
  WHATSAPP_TEMPLATE_PLACEHOLDERS.map((placeholder) => placeholder.key),
);

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

export type WhatsAppTemplateVariables = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  projectName?: string | null;
};

/** Empty or whitespace-only text clears the template so the generated welcome is used. */
export function normalizeWhatsAppTemplate(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized ? normalized : null;
}

export function validateWhatsAppTemplate(
  value: string | null | undefined,
): string[] {
  const template = normalizeWhatsAppTemplate(value);
  if (!template) {
    return [];
  }
  const errors: string[] = [];
  if (template.length > WHATSAPP_TEMPLATE_MAX_LENGTH) {
    errors.push(
      `Keep the WhatsApp text under ${WHATSAPP_TEMPLATE_MAX_LENGTH} characters (currently ${template.length}).`,
    );
  }
  const unknown = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1] ?? "";
    if (!KNOWN_PLACEHOLDERS.has(key)) {
      unknown.add(match[0]);
    }
  }
  if (unknown.size > 0) {
    errors.push(
      `Unknown placeholder${unknown.size === 1 ? "" : "s"}: ${[...unknown].join(", ")}. Use ${[
        ...KNOWN_PLACEHOLDERS,
      ]
        .map((key) => `{{${key}}}`)
        .join(", ")}.`,
    );
  }
  const withoutPlaceholders = template.replace(PLACEHOLDER_PATTERN, "");
  if (
    withoutPlaceholders.includes("{{") ||
    withoutPlaceholders.includes("}}")
  ) {
    errors.push(
      "A placeholder is not closed. Write placeholders as {{firstName}}.",
    );
  }
  for (const match of template.match(URL_PATTERN) ?? []) {
    try {
      if (isExpiringSignedUrl(new URL(match.replace(/[),.;]+$/g, "")))) {
        errors.push(
          "A link is a signed, expiring file URL. Paste a stable public brochure or floor-plan link instead.",
        );
        break;
      }
    } catch {
      // Not a parseable URL; it is sent as plain text.
    }
  }
  return errors;
}

function placeholderValue(
  key: string,
  variables: WhatsAppTemplateVariables,
): string | null {
  const fullName = variables.fullName?.trim() || null;
  switch (key) {
    case "firstName":
      return variables.firstName?.trim() || fullName?.split(/\s+/)[0] || null;
    case "lastName":
      return variables.lastName?.trim() || null;
    case "fullName":
      return fullName;
    case "projectName":
      return variables.projectName?.trim() || null;
    default:
      return null;
  }
}

export type WhatsAppTemplateRender =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

/** Substitutes only documented placeholders. All other wording and line breaks are kept exactly. */
export function renderWhatsAppTemplate(
  template: string,
  variables: WhatsAppTemplateVariables,
): WhatsAppTemplateRender {
  const normalized = normalizeWhatsAppTemplate(template);
  if (!normalized) {
    return { ok: false, errors: ["The WhatsApp text is empty."] };
  }
  const errors = validateWhatsAppTemplate(normalized);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const missing = new Set<string>();
  const message = normalized.replace(
    PLACEHOLDER_PATTERN,
    (_match, key: string) => {
      const value = placeholderValue(key, variables);
      if (value == null) {
        missing.add(`{{${key}}}`);
        return "";
      }
      return value;
    },
  );
  if (missing.size > 0) {
    return {
      ok: false,
      errors: [
        `This lead has no value for ${[...missing].join(", ")}. Add it to the lead or remove the placeholder from the project text.`,
      ],
    };
  }
  if (message.length > WHATSAPP_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        `The final draft is longer than ${WHATSAPP_MESSAGE_MAX_LENGTH} characters.`,
      ],
    };
  }
  return { ok: true, message };
}
