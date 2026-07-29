import { describe, expect, it } from "vitest";

import {
  addMinutesToCampaignSendTime,
  applyCampaignVariables,
  emailBodyHasUnsubscribe,
  getZeroDelaySendTimePredecessorIssue,
  getZeroDelaySendTimeSequenceIssue,
  isValidCampaignSendTime,
  normalizeCampaignSendTime,
  normalizeCampaignVariableTokens,
  validateCampaignHtml,
} from "@/lib/campaign-email";

describe("campaign email helpers", () => {
  it("normalizes send time to HH:mm", () => {
    expect(normalizeCampaignSendTime("15:59:00")).toBe("15:59");
    expect(normalizeCampaignSendTime(" 09:00 ")).toBe("09:00");
  });

  it("validates normalized send time", () => {
    expect(isValidCampaignSendTime("15:59:00")).toBe(true);
    expect(isValidCampaignSendTime("25:00")).toBe(false);
  });

  it("merges unsubscribe_url in both token formats", () => {
    const context = { unsubscribeUrl: "https://example.com/unsub" };

    expect(applyCampaignVariables("Link: {unsubscribe_url}", context)).toBe(
      "Link: https://example.com/unsub",
    );
    expect(applyCampaignVariables("Link: {{unsubscribe_url}}", context)).toBe(
      "Link: https://example.com/unsub",
    );
  });

  it("merges double-brace name variables", () => {
    expect(
      applyCampaignVariables("Hi {{first_name}}", {
        firstName: "Alex",
      }),
    ).toBe("Hi Alex");
  });

  it("normalizes double-brace tokens to canonical single-brace form", () => {
    expect(normalizeCampaignVariableTokens("Hi {{first_name}}")).toBe("Hi {first_name}");
  });

  it("detects unsubscribe content", () => {
    expect(emailBodyHasUnsubscribe("Thanks\n{unsubscribe_url}")).toBe(true);
    expect(emailBodyHasUnsubscribe("Thanks\n{{unsubscribe_url}}")).toBe(true);
    expect(emailBodyHasUnsubscribe('<a href="https://example.com/unsubscribe">Unsubscribe</a>')).toBe(
      true,
    );
    expect(emailBodyHasUnsubscribe("test{{first_name}}")).toBe(false);
    expect(emailBodyHasUnsubscribe("No unsubscribe here")).toBe(false);
  });

  it("detects out-of-order zero-delay send times", () => {
    expect(
      getZeroDelaySendTimeSequenceIssue([
        { order: 1, delayDays: 0, sendTime: "20:15" },
        { order: 2, delayDays: 0, sendTime: "20:13" },
      ]),
    ).toContain("Step 2");
  });

  it("allows saving a later step when an earlier pair is out of order", () => {
    const steps = [
      { order: 1, delayDays: 0, sendTime: "20:11" },
      { order: 2, delayDays: 0, sendTime: "20:15" },
      { order: 3, delayDays: 0, sendTime: "20:13" },
      { order: 4, delayDays: 0, sendTime: "20:15" },
    ];

    expect(getZeroDelaySendTimeSequenceIssue(steps)).toContain("Step 3");
    expect(
      getZeroDelaySendTimePredecessorIssue(
        { order: 5, delayDays: 0, sendTime: "20:30" },
        [...steps, { order: 5, delayDays: 0, sendTime: "20:30" }],
      ),
    ).toBeNull();
  });

  it("blocks saving a step that violates its predecessor", () => {
    expect(
      getZeroDelaySendTimePredecessorIssue(
        { order: 3, delayDays: 0, sendTime: "20:13" },
        [
          { order: 1, delayDays: 0, sendTime: "20:11" },
          { order: 2, delayDays: 0, sendTime: "20:15" },
          { order: 3, delayDays: 0, sendTime: "20:13" },
        ],
      ),
    ).toContain("Step 3");
  });

  it("adds minutes to campaign send time", () => {
    expect(addMinutesToCampaignSendTime("20:15", 1)).toBe("20:16");
    expect(addMinutesToCampaignSendTime("23:59", 1)).toBe("00:00");
  });

  describe("validateCampaignHtml", () => {
    const typicalEmailHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" type="text/css" href="https://example.com/email.css" />
  <title>Thank You</title>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td>
        <img src="https://example.com/hero.jpg" alt="Grosvenor Vistas" width="600" height="300" />
        <p>Hello {first_name},</p>
        <p>Elevate Your View at Grosvenor Vistas</p>
        <br />
        <hr />
        <p><a href="{unsubscribe_url}">Unsubscribe</a></p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    it("accepts a typical full email document with meta, link, and void tags", () => {
      const warnings = validateCampaignHtml(typicalEmailHtml);
      const codes = warnings.map((warning) => warning.code);

      expect(codes).not.toContain("unsafe_tags");
      expect(codes).not.toContain("unsafe_javascript");
      expect(codes).not.toContain("broken_tags");
      expect(codes).not.toContain("missing_unsubscribe");
    });

    it("does not treat meta content= as inline JavaScript", () => {
      const warnings = validateCampaignHtml(
        '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><p><a href="{unsubscribe_url}">Unsubscribe</a></p>',
      );

      expect(warnings.map((warning) => warning.code)).not.toContain("unsafe_javascript");
    });

    it("flags real inline event handlers and javascript: URLs", () => {
      expect(
        validateCampaignHtml(
          '<p onclick="alert(1)"><a href="{unsubscribe_url}">Unsubscribe</a></p>',
        ).map((warning) => warning.code),
      ).toContain("unsafe_javascript");

      expect(
        validateCampaignHtml(
          '<a href="javascript:void(0)">Go</a><a href="{unsubscribe_url}">Unsubscribe</a>',
        ).map((warning) => warning.code),
      ).toContain("unsafe_javascript");
    });

    it("flags truly unsupported tags such as script and iframe", () => {
      const warnings = validateCampaignHtml(
        '<script>alert(1)</script><iframe src="https://evil.example"></iframe><p><a href="{unsubscribe_url}">Unsubscribe</a></p>',
      );
      const unsafe = warnings.find((warning) => warning.code === "unsafe_tags");

      expect(unsafe?.message).toContain("<script>");
      expect(unsafe?.message).toContain("<iframe>");
    });

    it("does not flag meta or link as unsupported tags", () => {
      const warnings = validateCampaignHtml(
        '<meta charset="utf-8"><link rel="stylesheet" href="x.css"><p><a href="{unsubscribe_url}">Unsubscribe</a></p>',
      );

      expect(warnings.map((warning) => warning.code)).not.toContain("unsafe_tags");
    });
  });
});
