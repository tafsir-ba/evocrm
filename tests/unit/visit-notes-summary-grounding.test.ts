import { describe, expect, it } from "vitest";

import { formatVisitDraftBody } from "@/lib/visit-notes";
import {
  assertSummaryAbsentInventedFacts,
  buildVisitSummarySystemInstruction,
  buildVisitSummaryUserPrompt,
  VISIT_SUMMARY_GROUNDING_RULES,
} from "@/lib/visit-notes-summary";

const CRM = {
  leadName: "Tafsir Ba",
  projectName: "CMP",
};

function expectGroundedPrompt(prompt: string, transcriptNeedle: string) {
  expect(prompt).toContain("CRM context (labels only");
  expect(prompt).toContain(`Lead: ${CRM.leadName}`);
  expect(prompt).toContain(`Project: ${CRM.projectName}`);
  expect(prompt).toContain(transcriptNeedle);
  expect(prompt).toContain(VISIT_SUMMARY_GROUNDING_RULES);
  expect(prompt.toLowerCase()).not.toContain("you are an assistant for a real-estate crm visit note");
  expect(buildVisitSummarySystemInstruction()).toMatch(/never invent/i);
}

describe("notes summary grounding", () => {
  it("media-only note: prompt treats lead/project as labels and forbids invented visit", () => {
    const messages = [
      {
        id: "m1",
        kind: "text",
        status: "ready",
        text: "QA ONLY — Synthetic photo and video upload check. These files contain no customer information. No follow-up is required.",
      },
      { id: "m2", kind: "photo", status: "ready", text: null },
      { id: "m3", kind: "video", status: "ready", text: null },
    ];
    const { prompt, transcript } = buildVisitSummaryUserPrompt({
      ...CRM,
      messages,
    });
    expectGroundedPrompt(prompt, "QA ONLY");
    expect(transcript).toContain("[photo attached]");
    expect(transcript).toContain("[video attached]");

    const invented = assertSummaryAbsentInventedFacts({
      ...CRM,
      messages,
      summaryText: "Visit with Tafsir Ba regarding the CMP project.",
    });
    expect(invented).toEqual(
      expect.arrayContaining(["invented visit", "invented project discussion"]),
    );

    const grounded = assertSummaryAbsentInventedFacts({
      ...CRM,
      messages,
      summaryText:
        "QA only synthetic photo and video upload check. No customer information. No follow-up is required.",
    });
    expect(grounded).toEqual([]);
  });

  it("generic call/meeting: does not assume a visit from CRM metadata", () => {
    const messages = [
      {
        id: "m1",
        kind: "text",
        status: "ready",
        text: "Quick call with the lead about pricing. No site visit.",
      },
    ];
    const { prompt } = buildVisitSummaryUserPrompt({ ...CRM, messages });
    expectGroundedPrompt(prompt, "Quick call");
    expect(prompt).toMatch(/not inherently a visit/i);

    expect(
      assertSummaryAbsentInventedFacts({
        ...CRM,
        messages,
        summaryText: "Visit with Tafsir Ba at the CMP showroom.",
      }),
    ).toContain("invented visit");

    // Negation in source must not unlock visit invention.
    expect(
      assertSummaryAbsentInventedFacts({
        ...CRM,
        messages,
        summaryText: "Site visit completed regarding CMP.",
      }),
    ).toContain("invented visit");

    expect(
      assertSummaryAbsentInventedFacts({
        ...CRM,
        messages,
        summaryText: "Quick call about pricing. No site visit.",
      }),
    ).toEqual([]);
  });

  it("actual visit: allows visit language only when messages state it", () => {
    const messages = [
      {
        id: "m1",
        kind: "text",
        status: "ready",
        text: "Site visit today at unit A12. Customer liked the terrace.",
      },
    ];
    const { prompt } = buildVisitSummaryUserPrompt({
      ...CRM,
      propertyLabel: "A12 · Terrace unit",
      messages,
    });
    expect(prompt).toContain("Linked unit (explicit CRM link only");
    expect(prompt).toContain("A12 · Terrace unit");
    expect(
      assertSummaryAbsentInventedFacts({
        ...CRM,
        messages,
        summaryText: "Site visit at unit A12. Customer liked the terrace.",
      }),
    ).toEqual([]);
  });

  it("multi-message correction: later correction wins in grounding rules", () => {
    const messages = [
      {
        id: "m1",
        kind: "text",
        status: "ready",
        text: "They want a 4-bedroom.",
      },
      {
        id: "m2",
        kind: "text",
        status: "ready",
        text: "Correction: 3-bedroom only, not 4.",
      },
    ];
    const { prompt } = buildVisitSummaryUserPrompt({ ...CRM, messages });
    expect(prompt).toMatch(/correction wins/i);
    expect(prompt).toContain("Correction: 3-bedroom only");
  });

  it("explicit no follow-up: inventing next steps is flagged; empty sections omitted from draft body", () => {
    const messages = [
      {
        id: "m1",
        kind: "text",
        status: "ready",
        text: "QA only. No customer follow-up is required.",
      },
    ];
    const { prompt } = buildVisitSummaryUserPrompt({ ...CRM, messages });
    expect(prompt).toMatch(/empty nextSteps array when no follow-up/i);
    expect(
      assertSummaryAbsentInventedFacts({
        ...CRM,
        messages,
        summaryText: "Next steps: call the customer next week about CMP.",
      }),
    ).toContain("invented follow-up despite explicit negation");

    const body = formatVisitDraftBody({
      summary: "QA only media check. No follow-up is required.",
      customerRequirements: "",
      propertyDiscussed: "",
      questionsObjections: "",
      actions: "",
      nextSteps: [],
      needsConfirmation: [],
    });
    expect(body).toContain("QA only");
    expect(body).not.toContain("Customer requirements");
    expect(body).not.toContain("Next steps");
    expect(body).not.toContain("—");
  });
});
