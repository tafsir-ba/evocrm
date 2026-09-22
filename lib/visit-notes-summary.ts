/** Pure summary prompt builders for Notes (any note / meeting / call / visit). */

export type VisitSummaryMessageLike = {
  id: string;
  kind: string;
  text?: string | null;
  status: string;
};

export type VisitSummaryPromptInput = {
  messages: VisitSummaryMessageLike[];
  language?: string | null;
  crmLanguage?: string | null;
  leadName?: string | null;
  projectName?: string | null;
  /** Explicitly linked unit only — never infer from the lead. */
  propertyLabel?: string | null;
};

/** Grounding rules shared by system + user prompts (regression-tested). */
export const VISIT_SUMMARY_GROUNDING_RULES = [
  "Notes may be any lead-related note, meeting, call, or visit — never assume a site visit occurred.",
  "Lead name, project name, and linked unit are CRM context labels only — never treat them as evidence that a visit, meeting, or project discussion happened.",
  "Do not invent a visit, unit tour, project discussion, customer requirements, actions, next steps, or follow-up.",
  "Preserve explicit negatives and corrections from the messages (e.g. QA only, no customer information, no follow-up).",
  "If a later message corrects an earlier one, the correction wins.",
  "Only use facts present in the session messages (and an explicitly linked unit line, when present).",
  "If an owner or due date is not explicitly stated, leave those fields null / omit them.",
  "Leave string fields empty when unknown; do not fill with placeholders or guesses.",
  "Only mention a specific unit in propertyDiscussed when it appears in messages or the linked unit line.",
].join(" ");

export function formatVisitSummaryTranscript(
  messages: VisitSummaryMessageLike[],
): string {
  return messages
    .filter((message) => message.status === "ready")
    // Skip legacy duplicate transcript rows; audio messages already carry text.
    .filter((message) => message.kind !== "transcript")
    .map((message) => {
      const label = message.kind.toUpperCase();
      const body =
        message.text?.trim() ||
        (message.kind === "photo"
          ? "[photo attached]"
          : message.kind === "video"
            ? "[video attached]"
            : message.kind === "audio"
              ? "[audio attached]"
              : `[${message.kind}]`);
      return `[${message.id}] (${label}) ${body}`;
    })
    .join("\n");
}

export function buildVisitSummarySystemInstruction(): string {
  return `Produce structured real-estate CRM note summaries for agents. ${VISIT_SUMMARY_GROUNDING_RULES} Never invent owners, dates, visits, project discussions, requirements, actions, or follow-up.`;
}

export function buildVisitSummaryUserPrompt(input: VisitSummaryPromptInput): {
  transcript: string;
  prompt: string;
  outputLanguage: string;
} {
  const outputLanguage = input.language ?? input.crmLanguage ?? "en";
  const transcript = formatVisitSummaryTranscript(input.messages);

  const unitLine = input.propertyLabel?.trim()
    ? `Linked unit (explicit CRM link only — not proof of a visit): ${input.propertyLabel.trim()}`
    : "Linked unit: none (do not invent a unit)";

  const prompt = `You are an assistant for a real-estate CRM lead note (any note, meeting, call, or visit — not inherently a visit).
CRM context (labels only — not evidence of events):
- Lead: ${input.leadName ?? "Unknown"}
- Project: ${input.projectName ?? "Unknown"}
- ${unitLine}

${VISIT_SUMMARY_GROUNDING_RULES}

Write the structured summary in language: ${outputLanguage}.
Mark uncertain items in needsConfirmation.
Use empty strings for unknown sections. Use an empty nextSteps array when no follow-up was stated (including explicit "no follow-up").

Session messages (preserve message ids for traceability):
${transcript}

Return JSON:
{
  "summary": "factual note summary grounded only in the messages",
  "customerRequirements": "only if stated; else empty string",
  "propertyDiscussed": "only if a property/unit/project was discussed in messages or linked unit; else empty string",
  "questionsObjections": "only if stated; else empty string",
  "actions": "only if stated; else empty string",
  "nextSteps": [{"text":"string","ownerName":null,"dueDate":null,"needsConfirmation":false}],
  "needsConfirmation": ["string"],
  "language": "${outputLanguage}"
}`;

  return { transcript, prompt, outputLanguage };
}

/**
 * Lightweight regression guard: assert a candidate summary does not invent
 * visit/project/follow-up language that the source messages never supported.
 */
export function assertSummaryAbsentInventedFacts(input: {
  messages: VisitSummaryMessageLike[];
  leadName?: string | null;
  projectName?: string | null;
  summaryText: string;
}): string[] {
  const violations: string[] = [];
  const corpus = input.messages
    .map((message) => `${message.kind} ${message.text ?? ""}`)
    .join("\n")
    .toLowerCase();
  const summary = input.summaryText.toLowerCase();

  const deniesVisit =
    /\bno site visit\b/.test(corpus) ||
    /\bnot a (site )?visit\b/.test(corpus) ||
    /\bnever (a )?visit\b/.test(corpus);
  const mentionsVisit =
    !deniesVisit &&
    (/\b(site visit|visited|visiting)\b/.test(corpus) ||
      (/\bvisit\b/.test(corpus) && !/\bno visit\b/.test(corpus)));
  const summaryDeniesVisit =
    /\bno (site )?visit\b/.test(summary) || /\bnot a (site )?visit\b/.test(summary);
  const summaryClaimsVisit =
    !summaryDeniesVisit &&
    (/\b(site visit|visited|visiting)\b/.test(summary) ||
      /\bvisit with\b/.test(summary) ||
      /\bvisit\b/.test(summary));
  if (!mentionsVisit && summaryClaimsVisit) {
    violations.push("invented visit");
  }

  const projectName = input.projectName?.trim().toLowerCase();
  if (projectName && projectName.length >= 3) {
    const projectDiscussedInMessages = corpus.includes(projectName);
    if (
      !projectDiscussedInMessages &&
      summary.includes(projectName) &&
      /\b(regarding|about|discussed|discussion|for the)\b/.test(summary)
    ) {
      violations.push("invented project discussion");
    }
  }

  const explicitNoFollowUp =
    /no follow[- ]?up/.test(corpus) ||
    /no (customer )?follow[- ]?up is required/.test(corpus);
  if (
    explicitNoFollowUp &&
    (/\bnext steps?\b/.test(summary) ||
      /\bfollow[- ]?up\b/.test(summary) ||
      /\bcall (them|back|the customer)\b/.test(summary))
  ) {
    // Allow quoting the negation itself.
    if (!/no follow[- ]?up/.test(summary) && !/no customer follow/.test(summary)) {
      violations.push("invented follow-up despite explicit negation");
    }
  }

  const qaOnly = /\bqa only\b/.test(corpus);
  if (qaOnly && !/\bqa only\b/.test(summary) && /\bcustomer (wants|requirements)\b/.test(summary)) {
    violations.push("dropped QA-only framing");
  }

  return violations;
}
