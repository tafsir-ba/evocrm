import { describe, expect, it } from "vitest";

import {
  normalizeWhatsAppTemplate,
  renderWhatsAppTemplate,
  validateWhatsAppTemplate,
  WHATSAPP_TEMPLATE_MAX_LENGTH,
} from "@/lib/whatsapp-template";

describe("WhatsApp project template", () => {
  it("keeps exact wording and line breaks, replacing only documented placeholders", () => {
    const template =
      "Hi {{firstName}}!\n\nThanks for asking about {{ projectName }}.\nBrochure: https://example.com/gv-brochure.pdf\n\n— Team";
    expect(
      renderWhatsAppTemplate(template, {
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        projectName: "Grosvenor Vistas",
      }),
    ).toEqual({
      ok: true,
      message:
        "Hi Ada!\n\nThanks for asking about Grosvenor Vistas.\nBrochure: https://example.com/gv-brochure.pdf\n\n— Team",
    });
  });

  it("derives firstName from the full name and fills fullName and lastName", () => {
    expect(
      renderWhatsAppTemplate("{{firstName}} / {{fullName}} / {{lastName}}", {
        fullName: "Grace Hopper",
        lastName: "Hopper",
      }),
    ).toEqual({ ok: true, message: "Grace / Grace Hopper / Hopper" });
  });

  it("rejects unknown placeholders, unclosed braces and signed links", () => {
    expect(validateWhatsAppTemplate("Hello {{name}}")[0]).toContain(
      "Unknown placeholder",
    );
    expect(validateWhatsAppTemplate("Hello {{firstName")[0]).toContain(
      "not closed",
    );
    expect(
      validateWhatsAppTemplate(
        "Plan: https://bucket.s3.amazonaws.com/plan.pdf?X-Amz-Signature=abc&X-Amz-Expires=600",
      )[0],
    ).toContain("signed");
    expect(
      validateWhatsAppTemplate("Plan: https://example.com/plan.pdf"),
    ).toEqual([]);
  });

  it("reports unresolved lead values instead of leaving gaps", () => {
    const result = renderWhatsAppTemplate("Dear {{lastName}}", {
      fullName: "Ada",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.errors[0]).toContain("{{lastName}}");
  });

  it("enforces length and treats empty text as cleared", () => {
    expect(
      validateWhatsAppTemplate("a".repeat(WHATSAPP_TEMPLATE_MAX_LENGTH + 1))[0],
    ).toContain("under");
    expect(normalizeWhatsAppTemplate("   \n ")).toBeNull();
    expect(normalizeWhatsAppTemplate(" Hi\r\nthere ")).toBe("Hi\nthere");
    expect(validateWhatsAppTemplate("")).toEqual([]);
  });
});
