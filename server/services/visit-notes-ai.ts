import "server-only";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { isOpenAiConfigured, enrichmentOpenAiModel } from "@/server/services/lead-enrichment-providers";
import type { VisitMessageRecord } from "@/server/repositories/visit-sessions";

export { formatVisitDraftBody } from "@/lib/visit-notes";

export type VisitSummaryPayload = {
  summary: string;
  customerRequirements: string;
  propertyDiscussed: string;
  questionsObjections: string;
  actions: string;
  nextSteps: Array<{
    text: string;
    ownerName: string | null;
    dueDate: string | null;
    needsConfirmation: boolean;
  }>;
  needsConfirmation: string[];
  language: string;
};

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const block = trimmed.match(/\{[\s\S]*\}/);
  const raw = block ? block[0]! : trimmed;
  return JSON.parse(raw) as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((s) => s.trim()).filter(Boolean);
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

export async function transcribeAudioWithOpenAi(input: {
  body: Buffer;
  mimeType: string;
  fileName?: string;
  language?: string | null;
}): Promise<{ text: string; language: string | null }> {
  if (!isOpenAiConfigured()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Transcription is unavailable until OPENAI_API_KEY is configured.",
      { expose: true },
    );
  }

  const key = getEnv().OPENAI_API_KEY!;
  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.body)], { type: input.mimeType });
  const name =
    input.fileName ??
    `recording.${extensionForMime(input.mimeType)}`;
  form.append("file", blob, name);
  form.append("model", "whisper-1");
  form.append("response_format", "json");
  if (input.language) {
    form.append("language", input.language.split("-")[0] ?? input.language);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "Audio transcription failed.", {
      details: { status: response.status },
      expose: true,
    });
  }

  const payload = (await response.json()) as { text?: string };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) {
    throw new AppError("INTERNAL_ERROR", "Transcription returned empty text.", {
      expose: true,
    });
  }

  return { text, language: input.language ?? null };
}

export async function summarizeVisitSessionWithOpenAi(input: {
  messages: VisitMessageRecord[];
  language?: string | null;
  crmLanguage?: string | null;
  leadName?: string | null;
  projectName?: string | null;
  /** Explicitly linked unit only — never infer from the lead. */
  propertyLabel?: string | null;
}): Promise<VisitSummaryPayload> {
  if (!isOpenAiConfigured()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Summarization is unavailable until OPENAI_API_KEY is configured.",
      { expose: true },
    );
  }

  const key = getEnv().OPENAI_API_KEY!;
  const model = enrichmentOpenAiModel();
  const outputLanguage = input.language ?? input.crmLanguage ?? "en";

  const transcript = input.messages
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

  if (!transcript.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add notes or media before summarizing this visit.",
    );
  }

  const unitLine = input.propertyLabel?.trim()
    ? `Linked unit (explicit): ${input.propertyLabel.trim()}`
    : "Linked unit: none (do not invent a unit)";

  const prompt = `You are an assistant for a real-estate CRM visit note.
Lead: ${input.leadName ?? "Unknown"}
Project: ${input.projectName ?? "Unknown"}
${unitLine}
Write the structured summary in language: ${outputLanguage}.
Only use facts present in the session messages. Do not invent owners, due dates, or property units.
If an owner or due date is not explicitly stated, leave those fields null / omit them.
Only mention a specific unit in propertyDiscussed when it appears in messages or the linked unit line above.
Mark uncertain items in needsConfirmation.

Session messages (preserve message ids for traceability):
${transcript}

Return JSON:
{
  "summary": "visit summary",
  "customerRequirements": "what the customer wants",
  "propertyDiscussed": "property or project discussed",
  "questionsObjections": "questions and objections",
  "actions": "actions already taken or agreed",
  "nextSteps": [{"text":"string","ownerName":null,"dueDate":null,"needsConfirmation":false}],
  "needsConfirmation": ["string"],
  "language": "${outputLanguage}"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Produce structured real-estate visit summaries for CRM agents. Never invent owners, dates, or facts.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new AppError("INTERNAL_ERROR", "Visit summarization failed.", {
      details: { status: response.status },
      expose: true,
    });
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError("INTERNAL_ERROR", "Visit summarization returned empty content.", {
      expose: true,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(content);
  } catch {
    throw new AppError("INTERNAL_ERROR", "Visit summarization returned invalid JSON.", {
      expose: true,
    });
  }

  const nextStepsRaw = Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [];
  const nextSteps = nextStepsRaw
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const row = step as Record<string, unknown>;
      const text = asString(row.text);
      if (!text) return null;
      return {
        text,
        ownerName: asString(row.ownerName) || null,
        dueDate: asString(row.dueDate) || null,
        needsConfirmation: Boolean(row.needsConfirmation),
      };
    })
    .filter((step): step is NonNullable<typeof step> => Boolean(step));

  return {
    summary: asString(parsed.summary),
    customerRequirements: asString(parsed.customerRequirements),
    propertyDiscussed: asString(parsed.propertyDiscussed),
    questionsObjections: asString(parsed.questionsObjections),
    actions: asString(parsed.actions),
    nextSteps,
    needsConfirmation: asStringArray(parsed.needsConfirmation),
    language: asString(parsed.language) || outputLanguage,
  };
}
