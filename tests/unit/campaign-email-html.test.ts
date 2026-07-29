import { describe, expect, it } from "vitest";

import { buildCampaignEmailHtml } from "@/server/email/resend";

describe("buildCampaignEmailHtml", () => {
  const url =
    "https://crm.evo-home.ch/unsubscribe?token=eyJhbGciOiJIUzI1NiJ9.super-long-token-value";

  it("strips a bare unsubscribe url and keeps a single Unsubscribe footer link", () => {
    const html = buildCampaignEmailHtml(
      `Thanks for your interest in Grosvenor Vistas.\nhttps://grosvenorvistas.com/\n${url}`,
      url,
    );

    expect(html).toContain('<a href="' + url + '">Unsubscribe</a> from future campaign emails.');
    expect(html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    expect(html).not.toContain(`${url}</div>`);
  });

  it("does not duplicate the footer when the body already has an unsubscribe anchor", () => {
    const html = buildCampaignEmailHtml("unused", url, {
      htmlBody: `<p>Hello</p><p><a href="${url}">Unsubscribe</a></p>`,
    });

    expect(html).toContain(`<a href="${url}">Unsubscribe</a>`);
    expect(html).not.toContain("from future campaign emails.");
    expect(html.match(/Unsubscribe/g)).toHaveLength(1);
  });

  it("appends the footer when the body has no unsubscribe link", () => {
    const html = buildCampaignEmailHtml("Hello there", url);

    expect(html).toContain("Hello there");
    expect(html).toContain('<a href="' + url + '">Unsubscribe</a> from future campaign emails.');
  });
});
