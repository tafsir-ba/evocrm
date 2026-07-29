import { describe, expect, it } from "vitest";

import {
  getCampaignStepLaunchIssues,
  isCampaignStepLaunchReady,
} from "@/lib/campaign-step-readiness";

const baseStep = {
  status: "ready",
  subject: "Hello",
  contentMode: "plain_text",
  body: "Thanks for joining.\n{unsubscribe_url}",
  bodyHtml: null,
  bodyText: "Thanks for joining.\n{unsubscribe_url}",
};

describe("campaign step launch readiness", () => {
  it("accepts a complete ready step", () => {
    expect(getCampaignStepLaunchIssues(baseStep)).toEqual([]);
    expect(isCampaignStepLaunchReady(baseStep)).toBe(true);
  });

  it("rejects ready steps missing unsubscribe support", () => {
    const step = {
      ...baseStep,
      body: "Thanks for joining.",
      bodyText: "Thanks for joining.",
    };

    expect(getCampaignStepLaunchIssues(step)).toEqual([
      "Include {unsubscribe_url} or an unsubscribe link before marking this email as ready.",
    ]);
    expect(isCampaignStepLaunchReady(step)).toBe(false);
  });

  it("treats draft steps as not launch-ready", () => {
    expect(isCampaignStepLaunchReady({ ...baseStep, status: "draft" })).toBe(false);
  });

  it("does not block launch for typical email HTML with meta/content attributes", () => {
    const bodyHtml = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://example.com/email.css" />
</head>
<body>
  <img src="https://example.com/hero.jpg" alt="Hero" />
  <p>Hello</p>
  <br />
  <a href="{unsubscribe_url}">Unsubscribe</a>
</body>
</html>`;

    const step = {
      status: "ready",
      subject: "Thank you",
      contentMode: "html",
      body: "",
      bodyHtml,
      bodyText: null,
    };

    expect(getCampaignStepLaunchIssues(step)).toEqual([]);
    expect(isCampaignStepLaunchReady(step)).toBe(true);
  });

  it("still blocks launch when HTML contains script tags", () => {
    const step = {
      status: "ready",
      subject: "Thank you",
      contentMode: "html",
      body: "",
      bodyHtml: '<script>alert(1)</script><a href="{unsubscribe_url}">Unsubscribe</a>',
      bodyText: null,
    };

    expect(getCampaignStepLaunchIssues(step)).toContain(
      "Resolve unsafe HTML warnings before marking this email as ready.",
    );
  });
});
