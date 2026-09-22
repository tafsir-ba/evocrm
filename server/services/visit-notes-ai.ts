import "server-only";

import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { isOpenAiConfigured, enrichmentOpenAiModel } from "@/server/services/lead-enrichment-providers";
import type { VisitMessageRecord } from "@/server/repositories/visit-sessions";
import {
  buildVisitSummarySystemInstruction,
  buildVisitSummaryUserPrompt,
  type VisitSummaryPromptInput,
} from "@/lib/visit-notes-summary";

export { formatVisitDraftBody } from "@/lib/visit-notes";
export {
  buildVisitSummarySystemInstruction,
  buildVisitSummaryUserPrompt,
  VISIT_SUMMARY_GROUNDING_RULES,
  assertSummaryAbsentInventedFacts,
  formatVisitSummaryTranscript,
} from "@/lib/visit-notes-summary";

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
  const promptInput: VisitSummaryPromptInput = {
    messages: input.messages,
    language: input.language,
    crmLanguage: input.crmLanguage,
    leadName: input.leadName,
    projectName: input.projectName,
    propertyLabel: input.propertyLabel,
  };
  const { transcript, prompt, outputLanguage } = buildVisitSummaryUserPrompt(promptInput);

  if (!transcript.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add notes or media before summarizing this note.",
    );
  }

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
          content: buildVisitSummarySystemInstruction(),
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
