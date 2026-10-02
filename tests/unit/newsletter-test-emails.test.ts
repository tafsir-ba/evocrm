import { describe, expect, it } from "vitest";

import {
  NEWSLETTER_TEST_EMAIL_MAX,
  formatNewsletterTestEmailErrors,
  parseNewsletterTestEmails,
} from "@/lib/newsletter-test-emails";

describe("parseNewsletterTestEmails", () => {
  it("parses comma, newline, and space separated addresses", () => {
    const parsed = parseNewsletterTestEmails(
      "Ada@Example.com, bob@example.com\ncara@example.com  dan@example.com; eve@example.com",
    );

    expect(parsed.invalid).toEqual([]);
    expect(parsed.emails).toEqual([
      "ada@example.com",
      "bob@example.com",
      "cara@example.com",
      "dan@example.com",
      "eve@example.com",
    ]);
  });

  it("de-dupes case-insensitively and reports invalid tokens", () => {
    const parsed = parseNewsletterTestEmails(
      "Ada@Example.com ADA@example.com not-an-email @bad.com ok@ok.com",
    );

    expect(parsed.emails).toEqual(["ada@example.com", "ok@ok.com"]);
    expect(parsed.invalid).toEqual(["not-an-email", "@bad.com"]);
  });

  it("formats clear validation errors", () => {
    expect(
      formatNewsletterTestEmailErrors(parseNewsletterTestEmails("")),
    ).toMatch(/at least one/i);

    expect(
      formatNewsletterTestEmailErrors(
        parseNewsletterTestEmails("good@example.com, bad-address"),
      ),
    ).toMatch(/invalid/i);

    const many = Array.from(
      { length: NEWSLETTER_TEST_EMAIL_MAX + 1 },
      (_, index) => `user${index}@example.com`,
    ).join(",");
    expect(formatNewsletterTestEmailErrors(parseNewsletterTestEmails(many))).toMatch(
      /at most/i,
    );

    expect(
      formatNewsletterTestEmailErrors(
        parseNewsletterTestEmails("a@example.com, b@example.com"),
      ),
    ).toBeNull();
  });
});
