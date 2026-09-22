"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IconCamera,
  IconMic,
  IconNote,
  IconPaperclip,
  IconSearch,
  IconSend,
  IconSparkles,
  IconVideo,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from "@/lib/visit-notes-offline";
import {
  fetchDocumentSignedUrl,
  uploadVisitMedia,
} from "@/lib/visit-notes-upload";

type WorkspaceOption = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

type LeadHit = {
  id: string;
  fullName: string;
  email: string | null;
  projectId: string | null;
};

type VisitMessage = {
  id: string;
  kind: string;
  text: string | null;
  documentId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
};

type VisitSession = {
  id: string;
  leadId: string;
  projectId: string;
  activityId: string | null;
  status: string;
  language: string | null;
  messages: VisitMessage[];
  draftBody: string | null;
  aiDraft: { version: number } | null;
  createdAt: string;
  updatedAt: string;
  lead: { id: string; fullName: string; email: string | null } | null;
  project: { id: string; name: string } | null;
};

type Props = {
  initialWorkspaces: WorkspaceOption[];
  initialWorkspaceSlug: string | null;
};

function apiErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof (body.error as { message: unknown }).message === "string"
  ) {
    return (body.error as { message: string }).message;
  }
  return fallback;
}

export function VisitNotesApp({ initialWorkspaces, initialWorkspaceSlug }: Props) {
  const [workspaces] = useState(initialWorkspaces);
  const [workspaceSlug, setWorkspaceSlug] = useState(
    initialWorkspaceSlug ?? initialWorkspaces[0]?.slug ?? "",
  );
  const [leadQuery, setLeadQuery] = useState("");
  const [leadHits, setLeadHits] = useState<LeadHit[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadHit | null>(null);
  const [sessions, setSessions] = useState<VisitSession[]>([]);
  const [session, setSession] = useState<VisitSession | null>(null);
  const [composer, setComposer] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [language, setLanguage] = useState("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const draftKey = selectedLead?.id ?? "new";

  useEffect(() => {
    const offline = loadOfflineDraft(workspaceSlug, draftKey);
    if (offline?.text) {
      setComposer(offline.text);
    }
  }, [workspaceSlug, draftKey]);

  useEffect(() => {
    saveOfflineDraft(workspaceSlug, draftKey, {
      sessionId: session?.id ?? null,
      leadId: selectedLead?.id ?? null,
      text: composer,
      updatedAt: new Date().toISOString(),
    });
  }, [composer, draftKey, selectedLead?.id, session?.id, workspaceSlug]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [session?.messages.length, session?.draftBody]);

  const searchLeads = useCallback(
    async (query: string) => {
      if (!workspaceSlug || query.trim().length < 2) {
        setLeadHits([]);
        return;
      }
      const params = new URLSearchParams({
        search: query.trim(),
        pageSize: "8",
      });
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/leads?${params.toString()}`,
      );
      if (!response.ok) {
        setLeadHits([]);
        return;
      }
      const body = (await response.json()) as { data: LeadHit[] };
      setLeadHits(body.data);
    },
    [workspaceSlug],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void searchLeads(leadQuery);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [leadQuery, searchLeads]);

  const loadSessionsForLead = useCallback(
    async (leadId: string) => {
      const params = new URLSearchParams({ leadId, pageSize: "20" });
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions?${params.toString()}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as { data: VisitSession[] };
      setSessions(body.data);
    },
    [workspaceSlug],
  );

  async function selectLead(lead: LeadHit) {
    setSelectedLead(lead);
    setLeadQuery(lead.fullName);
    setLeadHits([]);
    setSession(null);
    setDraftBody("");
    await loadSessionsForLead(lead.id);
  }

  async function startSession() {
    if (!selectedLead) return;
    setBusy("create");
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/visit-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: selectedLead.id,
          language: language === "auto" ? null : language,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not start visit session."));
      }
      const created = body.data.session as VisitSession;
      setSession(created);
      setDraftBody(created.draftBody ?? "");
      await loadSessionsForLead(selectedLead.id);
      setStatusBanner("New visit session started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setBusy(null);
    }
  }

  async function openSession(sessionId: string) {
    setBusy("open");
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${sessionId}`,
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not open session."));
      }
      const opened = body.data.session as VisitSession;
      setSession(opened);
      setDraftBody(opened.draftBody ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open session.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshSession(sessionId: string) {
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/visit-sessions/${sessionId}`,
    );
    if (!response.ok) return;
    const body = await response.json();
    const refreshed = body.data.session as VisitSession;
    setSession(refreshed);
    setDraftBody(refreshed.draftBody ?? "");
  }

  async function sendText(event?: FormEvent) {
    event?.preventDefault();
    if (!session || !composer.trim()) return;
    setBusy("send");
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "text", text: composer.trim() }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not send note."));
      }
      setSession(body.data.session as VisitSession);
      setComposer("");
      clearOfflineDraft(workspaceSlug, draftKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send note.");
    } finally {
      setBusy(null);
    }
  }

  async function attachMedia(file: File) {
    if (!session) return;
    setBusy("upload");
    setError(null);
    setStatusBanner(`Uploading ${file.name}…`);
    try {
      const uploaded = await uploadVisitMedia({
        workspaceSlug,
        sessionId: session.id,
        file,
      });
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: uploaded.kind,
            documentId: uploaded.documentId,
            text: uploaded.fileName,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not attach media."));
      }
      let next = body.data.session as VisitSession;
      setSession(next);

      if (uploaded.kind === "audio") {
        setStatusBanner("Transcribing audio…");
        const audioMessage = [...next.messages]
          .reverse()
          .find((message) => message.documentId === uploaded.documentId);
        if (audioMessage) {
          const transcribeResponse = await fetch(
            `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/transcribe`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId: audioMessage.id,
                language: language === "auto" ? null : language,
              }),
            },
          );
          const transcribeBody = await transcribeResponse.json();
          if (!transcribeResponse.ok) {
            throw new Error(
              apiErrorMessage(
                transcribeBody,
                "Transcription failed. Audio is saved — retry from the message.",
              ),
            );
          }
          next = transcribeBody.data.session as VisitSession;
          setSession(next);
        }
      } else if (uploaded.kind === "video") {
        setStatusBanner("Video attached (preview only — not transcribed).");
      } else {
        setStatusBanner("Photo attached.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void attachMedia(file);
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!session) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const extension = mimeType.includes("webm") ? "webm" : "m4a";
        const file = new File([blob], `visit-audio-${Date.now()}.${extension}`, {
          type: mimeType,
        });
        void attachMedia(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatusBanner("Recording… tap mic again to stop.");
    } catch {
      setError("Microphone access was denied or is unavailable.");
    }
  }

  async function summarize() {
    if (!session) return;
    setBusy("summarize");
    setError(null);
    setStatusBanner("Summarizing visit…");
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/summarize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: language === "auto" ? null : language,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Summarize failed. Session is unchanged."));
      }
      const next = body.data.session as VisitSession;
      setSession(next);
      setDraftBody(next.draftBody ?? "");
      setStatusBanner(`Draft v${next.aiDraft?.version ?? "?"} ready — review before publish.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!session) return;
    setBusy("publish");
    setError(null);
    try {
      if (draftBody && draftBody !== (session.draftBody ?? "")) {
        await fetch(`/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedDraftBody: draftBody }),
        });
      }
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editedDraftBody: draftBody || null,
            createTasksFromNextSteps: true,
            mirrorToLeadNotes: false,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Publish failed."));
      }
      const next = body.data.session as VisitSession;
      setSession(next);
      setDraftBody(next.draftBody ?? "");
      if (selectedLead) await loadSessionsForLead(selectedLead.id);
      setStatusBanner("Published to CRM Visit Activity.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openMedia(documentId: string) {
    try {
      const url = await fetchDocumentSignedUrl(workspaceSlug, documentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open media.");
    }
  }

  async function retryTranscribe(messageId: string) {
    if (!session) return;
    setBusy("transcribe");
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            language: language === "auto" ? null : language,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Retry transcription failed."));
      }
      setSession(body.data.session as VisitSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusy(null);
    }
  }

  const currentWorkspace = workspaces.find((item) => item.slug === workspaceSlug);

  if (workspaces.length === 0) {
    return (
      <div className="min-h-dvh bg-[var(--color-canvas)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">Visit Notes</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Join or create a workspace before capturing visits.
          </p>
          <Link href="/workspaces" className="inline-block mt-4">
            <Button>Open workspaces</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_40%,#f8fafc_100%)] text-[var(--color-ink)] flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            <IconNote className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold leading-tight">Visit Notes</h1>
            <p className="text-[12px] text-[var(--color-ink-muted)] truncate">
              {currentWorkspace?.name ?? "Select workspace"}
            </p>
          </div>
          <select
            className="h-9 max-w-[42%] rounded-md border border-[var(--color-line)] bg-white px-2 text-[12.5px]"
            value={workspaceSlug}
            onChange={(event) => {
              setWorkspaceSlug(event.target.value);
              setSelectedLead(null);
              setSession(null);
              setSessions([]);
              setLeadQuery("");
            }}
            aria-label="Workspace"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.slug}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mx-auto max-w-3xl px-4 pb-3 space-y-2">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
            <Input
              className="pl-9"
              placeholder="Search lead by name, email, phone…"
              value={leadQuery}
              onChange={(event) => setLeadQuery(event.target.value)}
            />
            {leadHits.length > 0 && (
              <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-[var(--color-line)] bg-white shadow-[var(--shadow-md)]">
                {leadHits.map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-[var(--color-muted)]"
                      onClick={() => void selectLead(lead)}
                    >
                      <span className="text-[13.5px] font-medium">{lead.fullName}</span>
                      <span className="text-[12px] text-[var(--color-ink-muted)]">
                        {lead.email ?? "No email"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedLead && (
            <div className="flex items-center gap-2 overflow-x-auto">
              <Button
                size="sm"
                onClick={() => void startSession()}
                loading={busy === "create"}
                disabled={Boolean(busy)}
              >
                New visit
              </Button>
              <select
                className="h-8 rounded-md border border-[var(--color-line)] bg-white px-2 text-[12px]"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                aria-label="Language"
              >
                <option value="auto">Language: auto</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
              </select>
              {sessions.length > 0 && (
                <div className="flex gap-1.5">
                  {sessions.slice(0, 5).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openSession(item.id)}
                      className={cn(
                        "shrink-0 rounded-md border px-2.5 py-1.5 text-[11.5px]",
                        session?.id === item.id
                          ? "border-[var(--color-brand-300)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
                          : "border-[var(--color-line)] bg-white text-[var(--color-ink-soft)]",
                      )}
                    >
                      {new Date(item.createdAt).toLocaleDateString()} · {item.status}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-4">
        {(error || statusBanner) && (
          <div className="mb-3 space-y-2">
            {error && (
              <div className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[13px] text-[var(--color-danger-fg)]">
                {error}
              </div>
            )}
            {statusBanner && (
              <div className="rounded-lg border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3 py-2 text-[13px] text-[var(--color-info-fg)]">
                {statusBanner}
              </div>
            )}
          </div>
        )}

        {!selectedLead && (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-sm)] border border-[var(--color-line)]">
              <IconSearch className="h-6 w-6 text-[var(--color-brand-600)]" />
            </div>
            <h2 className="text-[17px] font-semibold">Find a lead to begin</h2>
            <p className="mt-1.5 max-w-sm text-[13.5px] text-[var(--color-ink-muted)]">
              Search only leads you can access, open a visit session, then capture notes,
              voice, photos, and video.
            </p>
          </div>
        )}

        {selectedLead && !session && (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
            <h2 className="text-[17px] font-semibold">{selectedLead.fullName}</h2>
            <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-muted)]">
              Start a new visit or continue a prior session above.
            </p>
          </div>
        )}

        {session && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold">
                  {session.lead?.fullName ?? selectedLead?.fullName}
                </p>
                <p className="text-[12px] text-[var(--color-ink-muted)]">
                  {session.project?.name ?? "Project"} · {session.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void refreshSession(session.id)}
                disabled={Boolean(busy)}
              >
                Refresh
              </Button>
            </div>

            <div className="space-y-2.5">
              {session.messages.map((message) => (
                <article
                  key={message.id}
                  className="rounded-xl border border-[var(--color-line)] bg-white px-3.5 py-3 shadow-[var(--shadow-xs)] motion-safe:animate-[visitNoteIn_0.25s_ease]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
                      {message.kind}
                      {message.status !== "ready" ? ` · ${message.status}` : ""}
                    </span>
                    <span className="text-[11px] text-[var(--color-ink-faint)]">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {message.text && (
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
                      {message.text}
                    </p>
                  )}
                  {message.documentId && (
                    <button
                      type="button"
                      className="mt-2 text-[12.5px] font-medium text-[var(--color-brand-700)]"
                      onClick={() => void openMedia(message.documentId!)}
                    >
                      Open media securely
                    </button>
                  )}
                  {message.status === "failed" && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-[12px] text-[var(--color-danger-fg)]">
                        {message.error ?? "Failed"}
                      </p>
                      {message.kind === "audio" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void retryTranscribe(message.id)}
                        >
                          Retry transcription
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              ))}
              <div ref={streamEndRef} />
            </div>

            {(session.aiDraft || draftBody) && (
              <section className="rounded-xl border border-[var(--color-brand-200)] bg-[var(--color-brand-50)]/40 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-[var(--color-brand-800)]">
                    AI draft{session.aiDraft ? ` v${session.aiDraft.version}` : ""}
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => void publish()}
                    loading={busy === "publish"}
                    disabled={Boolean(busy) || !draftBody.trim()}
                  >
                    Publish to CRM
                  </Button>
                </div>
                <Textarea
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  className="min-h-[180px] bg-white"
                  placeholder="Summarize this visit to generate a draft…"
                />
              </section>
            )}
          </div>
        )}
      </main>

      {session && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <form
            onSubmit={(event) => void sendText(event)}
            className="mx-auto flex max-w-3xl items-end gap-2 px-3 py-2.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,audio/*,video/webm,video/mp4"
              className="hidden"
              onChange={onFilePicked}
            />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach media"
              disabled={Boolean(busy)}
            >
              <IconPaperclip className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              onClick={() => {
                const input = fileInputRef.current;
                if (!input) return;
                input.accept = "image/*";
                input.click();
                input.accept =
                  "image/jpeg,image/png,image/webp,audio/*,video/webm,video/mp4";
              }}
              aria-label="Add photo"
              disabled={Boolean(busy)}
            >
              <IconCamera className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              onClick={() => {
                const input = fileInputRef.current;
                if (!input) return;
                input.accept = "video/webm,video/mp4";
                input.click();
                input.accept =
                  "image/jpeg,image/png,image/webp,audio/*,video/webm,video/mp4";
              }}
              aria-label="Add video"
              disabled={Boolean(busy)}
            >
              <IconVideo className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                recording
                  ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
              )}
              onClick={() => void toggleRecording()}
              aria-label={recording ? "Stop recording" : "Record audio"}
              disabled={Boolean(busy) && !recording}
            >
              <IconMic className="h-5 w-5" />
            </button>
            <Textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder="Type a visit note…"
              className="min-h-[40px] max-h-28 flex-1 resize-none py-2"
              rows={1}
            />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-700)] hover:bg-[var(--color-brand-50)]"
              onClick={() => void summarize()}
              aria-label="Summarize this visit"
              disabled={Boolean(busy)}
              title="Summarize this visit"
            >
              <IconSparkles className="h-5 w-5" />
            </button>
            <button
              type="submit"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] disabled:opacity-50"
              aria-label="Send note"
              disabled={Boolean(busy) || !composer.trim()}
            >
              <IconSend className="h-4 w-4" />
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}
