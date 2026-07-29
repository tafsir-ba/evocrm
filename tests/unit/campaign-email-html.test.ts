import { describe, expect, it } from "vitest";

import { buildCampaignEmailHtml } from "@/lib/campaign-email";

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

  it("preserves image src attributes that contain unsubscribe", () => {
    const html = buildCampaignEmailHtml("unused", url, {
      htmlBody: `<img src="https://cdn.example.com/unsubscribe-icon.png" alt="icon" /><p>Hello</p>`,
    });

    expect(html).toContain('src="https://cdn.example.com/unsubscribe-icon.png"');
    expect(html).toContain('<a href="' + url + '">Unsubscribe</a> from future campaign emails.');
  });
});
