import { describe, expect, it } from "vitest";

import {
  buildLeadWhatsAppWelcome,
  WHATSAPP_VIEWING_LINE,
} from "@/lib/lead-whatsapp-welcome";

describe("lead WhatsApp welcome", () => {
  it("uses the lead's project and property data and does not invent a brochure url", () => {
    const draft = buildLeadWhatsAppWelcome({
      fullName: "Ada Lovelace",
      firstName: "Ada",
      projectName: "Harbour Point",
      projectWebsite: "https://harbour.example/welcome",
      properties: [
        {
          title: "Plot 12",
          reference: "HP-12",
          price: 450000,
          currency: "CHF",
          city: "Geneva",
          attributes: {
            brochureUrl: "https://files.example/harbour-brochure.pdf",
          },
        },
      ],
      documents: [
        { fileName: "Harbour floor plan.pdf" },
        {
          fileName: "notes.txt",
          url: "https://signed.example/notes.txt?X-Amz-Expires=600",
        },
      ],
    });

    expect(draft.message).toContain("Harbour Point");
    expect(draft.message).toContain("Plot 12");
    expect(draft.message).toContain(
      "https://files.example/harbour-brochure.pdf",
    );
    expect(draft.message).toContain("https://harbour.example/welcome");
    expect(draft.message).toContain(
      "Floor plan on file: Harbour floor plan.pdf",
    );
    expect(draft.message).not.toContain("grosvenorvistas.com");
    expect(draft.message).not.toContain("Grosvenor");
    expect(draft.message.endsWith(WHATSAPP_VIEWING_LINE)).toBe(true);
    expect(draft.message).not.toContain("X-Amz-Expires");
  });

  it("names a brochure file instead of pasting an expiring signed url", () => {
    const signed =
      "https://bucket.example.amazonaws.com/brochure.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=600&X-Amz-Signature=abc";
    const draft = buildLeadWhatsAppWelcome({
      fullName: "Ada Lovelace",
      projectName: "Harbour Point",
      projectWebsite: signed,
      properties: [
        {
          title: "Plot 12",
          attributes: { brochureUrl: signed },
          description: `Floor plan ${signed}`,
        },
      ],
      documents: [{ fileName: "Harbour brochure.pdf", url: signed }],
    });

    expect(draft.message).not.toContain("X-Amz-");
    expect(draft.message).not.toContain("amazonaws.com");
    expect(draft.message).toContain("Brochure on file: Harbour brochure.pdf");
    expect(draft.message.endsWith(WHATSAPP_VIEWING_LINE)).toBe(true);
  });

  it("still closes with the viewing line when materials are missing", () => {
    const draft = buildLeadWhatsAppWelcome({
      fullName: "Grace Hopper",
      projectName: "North Dock",
    });

    expect(draft.message).toContain("North Dock");
    expect(draft.message).not.toContain("http");
    expect(draft.message.endsWith(WHATSAPP_VIEWING_LINE)).toBe(true);
    expect(draft.unlinkedFileNames).toEqual([]);
  });
});
