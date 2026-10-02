/** Max addresses for a single newsletter test send. */
export const NEWSLETTER_TEST_EMAIL_MAX = 10;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedNewsletterTestEmails = {
  emails: string[];
  invalid: string[];
};

/**
 * Split a pasted list of addresses on commas, semicolons, or whitespace,
 * normalize, de-dupe (case-insensitive), and validate format.
 */
export function parseNewsletterTestEmails(raw: string): ParsedNewsletterTestEmails {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    if (EMAIL_PATTERN.test(normalized) && normalized.length <= 254) {
      emails.push(normalized);
    } else {
      invalid.push(token);
    }
  }

  return { emails, invalid };
}

export function formatNewsletterTestEmailErrors(
  parsed: ParsedNewsletterTestEmails,
  max = NEWSLETTER_TEST_EMAIL_MAX,
): string | null {
  if (parsed.invalid.length > 0) {
    const sample = parsed.invalid.slice(0, 5).join(", ");
    const more =
      parsed.invalid.length > 5 ? ` (+${parsed.invalid.length - 5} more)` : "";
    return `These addresses look invalid: ${sample}${more}. Fix or remove them, then try again.`;
  }

  if (parsed.emails.length === 0) {
    return "Enter at least one email address.";
  }

  if (parsed.emails.length > max) {
    return `You can send a test to at most ${max} addresses at a time.`;
  }

  return null;
}
