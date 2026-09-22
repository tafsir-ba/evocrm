/** Client helpers for deliberately sharing a Notes summary (never auto-share). */

export function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareNotesText(input: {
  title: string;
  text: string;
}): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const payload = input.text.trim();
  if (!payload) return "failed";

  if (canUseWebShare()) {
    try {
      await navigator.share({
        title: input.title,
        text: payload,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Fall through to clipboard.
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return "copied";
    }
  } catch {
    // ignore
  }
  return "failed";
}

export function downloadNotesExport(input: {
  fileName: string;
  text: string;
}): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([input.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = input.fileName.endsWith(".txt")
    ? input.fileName
    : `${input.fileName}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildConversationExport(input: {
  title: string;
  leadName: string | null;
  unitLabel: string | null;
  messages: Array<{ kind: string; text: string | null; createdAt: string }>;
  summary: string | null;
}): string {
  const lines: string[] = [
    input.title,
    [input.leadName, input.unitLabel].filter(Boolean).join(" · "),
    "",
  ];
  for (const message of input.messages) {
    if (message.kind === "transcript") continue;
    const stamp = new Date(message.createdAt).toLocaleString();
    if (message.kind === "text" && message.text?.trim()) {
      lines.push(`[${stamp}] ${message.text.trim()}`, "");
    } else if (message.kind === "audio" && message.text?.trim()) {
      lines.push(`[${stamp}] Audio transcript: ${message.text.trim()}`, "");
    } else if (message.kind === "photo") {
      lines.push(`[${stamp}] Photo attached`, "");
    } else if (message.kind === "video") {
      lines.push(`[${stamp}] Video attached`, "");
    } else if (message.kind === "audio") {
      lines.push(`[${stamp}] Audio attached`, "");
    }
  }
  if (input.summary?.trim()) {
    lines.push("---", "Summary", input.summary.trim());
  }
  return lines.filter((line, index, arr) => !(line === "" && arr[index - 1] === "")).join("\n");
}
