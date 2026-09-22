"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  IconArrowLeft,
  IconCamera,
  IconClose,
  IconFile,
  IconMic,
  IconNote,
  IconPlus,
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
  formatVisitMediaFileSize,
  pickSupportedAudioRecorderMimeType,
  resolveVisitMediaMimeType,
  VISIT_AUDIO_MAX_DURATION_SECONDS,
  VISIT_VIDEO_MAX_DURATION_SECONDS,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";
import {
  fetchDocumentSignedUrl,
  uploadVisitMedia,
  VisitMediaUploadError,
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

type PendingUploadStatus = "uploading" | "transcribing" | "failed";

type PendingUpload = {
  id: string;
  file: File;
  kind: "photo" | "audio" | "video";
  previewUrl: string | null;
  progress: number;
  status: PendingUploadStatus;
  error: string | null;
  retryable: boolean;
  /** Set after Spaces/document create succeeds — Retry must not re-upload. */
  documentId: string | null;
  /** Set after message attach succeeds — Retry may only need transcription. */
  messageId: string | null;
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

function createPendingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPreviewUrl(file: File, kind: "photo" | "audio" | "video"): string | null {
  if (kind !== "photo" && kind !== "video") return null;
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return null;
  }
  return URL.createObjectURL(file);
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
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [audioRecorderSupported, setAudioRecorderSupported] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const photoCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const photoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const attachMenuId = useId();
  const draftKey = selectedLead?.id ?? "new";
  const hasComposerText = composer.trim().length > 0;

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    setAudioRecorderSupported(pickSupportedAudioRecorderMimeType() !== null);
  }, []);

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
  }, [session?.messages.length, session?.draftBody, pendingUploads.length]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 44), 160);
    el.style.height = `${next}px`;
  }, [composer]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (attachMenuRef.current && target && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAttachMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [attachMenuOpen]);

  useEffect(() => {
    return () => {
      pendingUploads.forEach((item) => {
        if (
          item.previewUrl &&
          typeof URL !== "undefined" &&
          typeof URL.revokeObjectURL === "function"
        ) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
    // Only revoke on unmount for current refs; individual removes revoke themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    async (leadId: string): Promise<VisitSession[]> => {
      const params = new URLSearchParams({ leadId, pageSize: "20" });
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions?${params.toString()}`,
      );
      if (!response.ok) {
        setSessions([]);
        return [];
      }
      const body = (await response.json()) as { data: VisitSession[] };
      setSessions(body.data);
      return body.data;
    },
    [workspaceSlug],
  );

  function failBanner(message: string) {
    setStatusBanner(null);
    setError(message);
  }

  async function createSessionForLead(lead: LeadHit): Promise<VisitSession> {
    const response = await fetch(`/api/workspaces/${workspaceSlug}/visit-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        language: language === "auto" ? null : language,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(body, "Could not start the conversation."));
    }
    return body.data.session as VisitSession;
  }

  async function fetchSession(sessionId: string): Promise<VisitSession> {
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/visit-sessions/${sessionId}`,
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(body, "Could not open the conversation."));
    }
    return body.data.session as VisitSession;
  }

  function enterSession(next: VisitSession) {
    setSession(next);
    setDraftBody(next.draftBody ?? "");
    setPendingUploads([]);
    setAttachMenuOpen(false);
    setError(null);
    setStatusBanner(null);
  }

  /** Select lead once → resume open conversation or start a fresh one. */
  async function selectLead(lead: LeadHit) {
    setSelectedLead(lead);
    setLeadQuery(lead.fullName);
    setLeadHits([]);
    setDraftBody("");
    setPendingUploads([]);
    setAttachMenuOpen(false);
    setBusy("open");
    setError(null);
    setStatusBanner(null);
    try {
      const list = await loadSessionsForLead(lead.id);
      const resumable = list.find(
        (item) => item.status === "open" || item.status === "draft",
      );
      if (resumable) {
        enterSession(await fetchSession(resumable.id));
        return;
      }
      const created = await createSessionForLead(lead);
      enterSession(created);
      await loadSessionsForLead(lead.id);
    } catch (err) {
      setSession(null);
      failBanner(err instanceof Error ? err.message : "Could not open conversation.");
    } finally {
      setBusy(null);
    }
  }

  async function startSession() {
    if (!selectedLead) return;
    setBusy("create");
    setError(null);
    try {
      const created = await createSessionForLead(selectedLead);
      enterSession(created);
      await loadSessionsForLead(selectedLead.id);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not start conversation.");
    } finally {
      setBusy(null);
    }
  }

  async function openSession(sessionId: string) {
    setBusy("open");
    setError(null);
    try {
      enterSession(await fetchSession(sessionId));
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not open conversation.");
    } finally {
      setBusy(null);
    }
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
      failBanner(err instanceof Error ? err.message : "Could not send note.");
    } finally {
      setBusy(null);
    }
  }

  function updatePending(
    id: string,
    patch: Partial<PendingUpload> | ((current: PendingUpload) => Partial<PendingUpload>),
  ) {
    setPendingUploads((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = typeof patch === "function" ? patch(item) : patch;
        return { ...item, ...next };
      }),
    );
  }

  function removePending(id: string) {
    setPendingUploads((prev) => {
      const target = prev.find((item) => item.id === id);
      if (
        target?.previewUrl &&
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  async function processPendingUpload(pendingId: string, file: File) {
    if (!session) return;

    const existing = pendingUploadsRef.current.find((item) => item.id === pendingId);
    let documentId = existing?.documentId ?? null;
    let messageId = existing?.messageId ?? null;
    let kind = existing?.kind ?? visitMediaKindFromMime(resolveVisitMediaMimeType(file));
    if (!kind) {
      failBanner("Unsupported media type.");
      return;
    }

    updatePending(pendingId, {
      status: documentId && messageId && kind === "audio" ? "transcribing" : "uploading",
      progress: documentId ? 100 : 0,
      error: null,
      retryable: true,
    });

    try {
      if (!documentId) {
        const uploaded = await uploadVisitMedia({
          workspaceSlug,
          sessionId: session.id,
          file,
          onProgress: (percent) => updatePending(pendingId, { progress: percent }),
        });
        documentId = uploaded.documentId;
        kind = uploaded.kind;
        updatePending(pendingId, {
          documentId,
          kind,
          progress: 100,
        });
      }

      let next = session;

      if (!messageId) {
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              documentId,
              text: file.name,
            }),
          },
        );
        const body = await response.json();
        if (!response.ok) {
          throw new VisitMediaUploadError(
            apiErrorMessage(body, "Could not attach media to this visit."),
            {
              stage: "attach",
              status: response.status,
              retryable: response.status >= 500 || response.status === 429,
            },
          );
        }

        next = body.data.session as VisitSession;
        setSession(next);
        const attached = [...next.messages]
          .reverse()
          .find((message) => message.documentId === documentId);
        messageId = attached?.id ?? null;
        updatePending(pendingId, { messageId });
        if (!messageId) {
          throw new VisitMediaUploadError(
            "Media uploaded but message id missing. Retry to attach again.",
            { stage: "attach", retryable: true },
          );
        }
      }

      if (kind === "audio" && messageId) {
        updatePending(pendingId, { status: "transcribing", progress: 100 });
        const transcribeResponse = await fetch(
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
        const transcribeBody = await transcribeResponse.json();
        if (!transcribeResponse.ok) {
          throw new VisitMediaUploadError(
            apiErrorMessage(
              transcribeBody,
              "Transcription failed. Audio is saved — Retry to transcribe again.",
            ),
            {
              stage: "transcribe",
              status: transcribeResponse.status,
              retryable: true,
            },
          );
        }
        next = transcribeBody.data.session as VisitSession;
        setSession(next);
      }

      removePending(pendingId);
      setError(null);
      setStatusBanner(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Retry or Remove.";
      const retryable =
        err instanceof VisitMediaUploadError ? err.retryable : true;
      updatePending(pendingId, {
        status: "failed",
        error: message,
        retryable,
        progress: documentId ? 100 : 0,
        documentId,
        messageId,
      });
      failBanner(message);
    }
  }

  useEffect(() => {
    function onOnline() {
      const failed = pendingUploadsRef.current.filter(
        (item) => item.status === "failed" && item.retryable,
      );
      for (const item of failed) {
        void processPendingUpload(item.id, item.file);
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // processPendingUpload closes over session/language; reconnect only while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, workspaceSlug, language]);

  function enqueueMedia(file: File) {
    if (!session) return;
    const coercedType = resolveVisitMediaMimeType(file);
    const kind = visitMediaKindFromMime(coercedType);
    if (!kind) {
      failBanner(
        `Unsupported media type (${coercedType || "unknown"}). Use JPEG/PNG/WebP/HEIC photo, MP4/MOV video, or WebM/MP4/M4A audio.`,
      );
      return;
    }

    const id = createPendingId();
    const pending: PendingUpload = {
      id,
      file,
      kind,
      previewUrl: buildPreviewUrl(file, kind),
      progress: 0,
      status: "uploading",
      error: null,
      retryable: true,
      documentId: null,
      messageId: null,
    };
    setPendingUploads((prev) => [...prev, pending]);
    setError(null);
    setStatusBanner(null);
    void processPendingUpload(id, file);
  }

  function onFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAttachMenuOpen(false);
    if (file) enqueueMedia(file);
  }

  async function startRecording() {
    if (!session || recording) return;
    const mimeType = pickSupportedAudioRecorderMimeType();
    if (!mimeType) {
      failBanner(
        "This browser cannot record audio (no MediaRecorder MIME). Use Chrome/Safari current, or attach an audio file instead.",
      );
      setAudioRecorderSupported(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setRecording(false);
        if (cancelRecordingRef.current) {
          chunksRef.current = [];
          setStatusBanner(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (blob.size <= 0) {
          failBanner("Recording was empty. Try again or check the microphone.");
          return;
        }
        const extension = mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("mp4") || mimeType.includes("aac")
            ? "m4a"
            : "audio";
        const file = new File([blob], `visit-audio-${Date.now()}.${extension}`, {
          type: mimeType,
        });
        enqueueMedia(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError(null);
      setStatusBanner(
        `Recording… tap Stop when finished (guide ≤ ${Math.round(VISIT_AUDIO_MAX_DURATION_SECONDS / 60)} min).`,
      );
    } catch {
      failBanner(
        "Microphone access was denied or is unavailable. Enable mic permission, then Retry.",
      );
    }
  }

  function stopRecording() {
    if (!recording) return;
    cancelRecordingRef.current = false;
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    if (!recording) return;
    cancelRecordingRef.current = true;
    mediaRecorderRef.current?.stop();
    setStatusBanner("Recording cancelled.");
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
      setStatusBanner(null);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Summarize failed.");
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
      setStatusBanner(null);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openMedia(documentId: string) {
    try {
      const url = await fetchDocumentSignedUrl(workspaceSlug, documentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not open media.");
    }
  }

  async function retryTranscribe(messageId: string) {
    if (!session) return;
    setBusy("transcribe");
    setError(null);
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
      setStatusBanner(null);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusy(null);
    }
  }

  const currentWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const composerBusy = Boolean(busy) || pendingUploads.some((item) => item.status !== "failed");

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
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        {session ? (
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              aria-label="Back to lead search"
              onClick={() => {
                setSession(null);
                setPendingUploads([]);
                setAttachMenuOpen(false);
                setStatusBanner(null);
                setError(null);
              }}
            >
              <IconArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">
                {session.lead?.fullName ?? selectedLead?.fullName ?? "Visit"}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
                <IconNote className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] font-semibold leading-tight">Notes</h1>
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
                  setPendingUploads([]);
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
                  placeholder="Who is this visit with?"
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

              {selectedLead && !session && (
                <div className="flex items-center gap-2 overflow-x-auto">
                  <Button
                    size="sm"
                    onClick={() => void startSession()}
                    loading={busy === "create" || busy === "open"}
                    disabled={Boolean(busy)}
                  >
                    New conversation
                  </Button>
                  {sessions.length > 0 && (
                    <div className="flex gap-1.5">
                      {sessions.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void openSession(item.id)}
                          className="shrink-0 rounded-full border border-[var(--color-line)] bg-white px-2.5 py-1.5 text-[11.5px] text-[var(--color-ink-soft)]"
                        >
                          {item.status === "open" || item.status === "draft"
                            ? "Continue"
                            : "Earlier"}{" "}
                          · {new Date(item.createdAt).toLocaleDateString()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-4">
        {(error || statusBanner) && (
          <div className="mb-3 space-y-2">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-[13px] text-[var(--color-danger-fg)]"
              >
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
            <h2 className="text-[17px] font-semibold">Who are you visiting?</h2>
            <p className="mt-1.5 max-w-sm text-[13.5px] text-[var(--color-ink-muted)]">
              Pick someone once, then type, talk, or attach.
            </p>
          </div>
        )}

        {selectedLead && !session && (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
            <h2 className="text-[17px] font-semibold">{selectedLead.fullName}</h2>
            <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-muted)]">
              {busy === "open" || busy === "create"
                ? "Opening conversation…"
                : "Opening conversation…"}
            </p>
          </div>
        )}

        {session && (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex-1 space-y-2.5">
              {session.messages.length === 0 && pendingUploads.length === 0 && (
                <p className="px-1 py-8 text-center text-[13.5px] text-[var(--color-ink-muted)]">
                  Type a note, tap the mic, or attach a photo.
                </p>
              )}

              {session.messages.map((message) => {
                const isText = message.kind === "text";
                const mediaLabel =
                  message.kind === "photo"
                    ? "Photo"
                    : message.kind === "video"
                      ? "Video"
                      : message.kind === "audio"
                        ? "Audio"
                        : "Attachment";
                return (
                  <article
                    key={message.id}
                    className={cn(
                      "px-3.5 py-2.5 motion-safe:animate-[visitNoteIn_0.25s_ease]",
                      isText
                        ? "ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-white shadow-[var(--shadow-xs)]"
                        : "rounded-2xl border border-[var(--color-line)] bg-white",
                    )}
                  >
                    {!isText && (
                      <p className="mb-1 text-[12px] font-medium text-[var(--color-ink-muted)]">
                        {mediaLabel}
                        {message.status === "transcribing" ? " · Transcribing…" : ""}
                      </p>
                    )}
                    {message.text && (
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {message.text}
                      </p>
                    )}
                    {message.documentId && (
                      <button
                        type="button"
                        className="mt-1.5 text-[12.5px] font-medium text-[var(--color-brand-700)]"
                        onClick={() => void openMedia(message.documentId!)}
                      >
                        Open {mediaLabel.toLowerCase()}
                      </button>
                    )}
                    {message.status === "failed" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-[12px] text-[var(--color-danger-fg)]">
                          {message.error ?? "Something went wrong."}
                        </p>
                        {message.kind === "audio" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void retryTranscribe(message.id)}
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {pendingUploads.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[var(--color-line)] bg-white px-3.5 py-3"
                  data-testid="pending-upload"
                >
                  <div className="flex gap-3">
                    {item.previewUrl && item.kind === "photo" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[var(--color-muted)] text-[var(--color-ink-soft)]">
                        {item.kind === "video" ? (
                          <IconVideo className="h-5 w-5" />
                        ) : item.kind === "audio" ? (
                          <IconMic className="h-5 w-5" />
                        ) : (
                          <IconFile className="h-5 w-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{item.file.name}</p>
                      <p className="text-[12px] text-[var(--color-ink-muted)]">
                        {formatVisitMediaFileSize(item.file.size)}
                        {item.status === "uploading"
                          ? ` · Uploading ${item.progress}%`
                          : item.status === "transcribing"
                            ? " · Transcribing…"
                            : null}
                      </p>
                      {item.status !== "failed" && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-brand-600)] transition-[width] duration-200"
                            style={{
                              width: `${item.status === "transcribing" ? 100 : item.progress}%`,
                            }}
                          />
                        </div>
                      )}
                      {item.status === "failed" && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[12.5px] text-[var(--color-danger-fg)]">
                            {item.error ?? "Upload failed."}
                          </p>
                          <div className="flex gap-2">
                            {item.retryable && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void processPendingUpload(item.id, item.file)}
                              >
                                Retry
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removePending(item.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              <div ref={streamEndRef} />
            </div>

            {/* After capture — CRM / structure actions stay out of the composer */}
            {(session.messages.length > 0 || session.aiDraft || Boolean(draftBody.trim())) && (
            <section
              className="mt-2 space-y-3 border-t border-[var(--color-line)] pt-4"
              data-testid="after-capture-actions"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void summarize()}
                  disabled={Boolean(busy) || session.messages.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-50"
                >
                  <IconSparkles className="h-3.5 w-3.5" />
                  {busy === "summarize" ? "Summarizing…" : "Summarize this visit"}
                </button>
                <select
                  className="h-8 rounded-full border-0 bg-transparent px-2 text-[12px] text-[var(--color-ink-muted)]"
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
              </div>

              {(session.aiDraft || draftBody) && (
                <div className="rounded-2xl border border-[var(--color-brand-200)] bg-[var(--color-brand-50)]/40 p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[13px] font-semibold text-[var(--color-brand-800)]">
                        Draft{session.aiDraft ? ` v${session.aiDraft.version}` : ""}
                      </h3>
                      <p className="text-[11.5px] text-[var(--color-ink-muted)]">
                        {session.project?.name ?? "Project"} · publish when ready
                      </p>
                    </div>
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
                    className="min-h-[160px] bg-white"
                    placeholder="Edit the visit summary before publishing…"
                  />
                </div>
              )}
            </section>
            )}
          </div>
        )}
      </main>

      {session && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-white/95 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {recording && (
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 pt-2.5">
              <p className="text-[12.5px] font-medium text-[var(--color-danger-fg)]">
                Recording…
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" type="button" onClick={cancelRecording}>
                  Cancel
                </Button>
                <Button size="sm" type="button" onClick={stopRecording}>
                  Stop
                </Button>
              </div>
            </div>
          )}

          <form
            onSubmit={(event) => void sendText(event)}
            className="mx-auto flex max-w-3xl items-end gap-2 px-3 py-2.5"
          >
            <input
              ref={photoCaptureInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
              capture="environment"
              className="hidden"
              onChange={onFilePicked}
            />
            <input
              ref={photoLibraryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
              className="hidden"
              onChange={onFilePicked}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              className="hidden"
              onChange={onFilePicked}
            />

            <div className="relative shrink-0" ref={attachMenuRef}>
              <button
                type="button"
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
                  attachMenuOpen && "bg-[var(--color-muted)] text-[var(--color-ink)]",
                )}
                onClick={() => setAttachMenuOpen((open) => !open)}
                aria-label="Add attachment"
                aria-expanded={attachMenuOpen}
                aria-controls={attachMenuId}
                disabled={composerBusy && !recording}
              >
                {attachMenuOpen ? (
                  <IconClose className="h-5 w-5" />
                ) : (
                  <IconPlus className="h-5 w-5" />
                )}
              </button>
              {attachMenuOpen && (
                <div
                  id={attachMenuId}
                  role="menu"
                  className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(16.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-md)] motion-safe:animate-[visitNoteIn_0.18s_ease]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14px] hover:bg-[var(--color-muted)]"
                    onClick={() => photoCaptureInputRef.current?.click()}
                  >
                    <IconCamera className="h-5 w-5 text-[var(--color-ink-soft)]" />
                    Take photo
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14px] hover:bg-[var(--color-muted)]"
                    onClick={() => photoLibraryInputRef.current?.click()}
                  >
                    <IconFile className="h-5 w-5 text-[var(--color-ink-soft)]" />
                    Choose photo / file
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14px] hover:bg-[var(--color-muted)]"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <IconVideo className="h-5 w-5 text-[var(--color-ink-soft)]" />
                    Choose video
                    <span className="ml-auto text-[11px] text-[var(--color-ink-faint)]">
                      ≤{Math.round(VISIT_VIDEO_MAX_DURATION_SECONDS / 60)} min
                    </span>
                  </button>
                </div>
              )}
            </div>

            <Textarea
              ref={composerRef}
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder="Message"
              rows={1}
              className="min-h-[44px] max-h-40 flex-1 resize-none rounded-2xl border-[var(--color-line)] px-3.5 py-2.5 text-[16px] leading-snug focus:ring-2"
              disabled={recording}
              aria-label="Visit note"
            />

            {hasComposerText ? (
              <button
                type="submit"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] disabled:opacity-50"
                aria-label="Send note"
                disabled={Boolean(busy) || recording}
              >
                <IconSend className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                  recording
                    ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
                  !audioRecorderSupported && "opacity-40",
                )}
                onClick={() => {
                  if (recording) stopRecording();
                  else void startRecording();
                }}
                aria-label={recording ? "Stop recording" : "Record audio"}
                disabled={!audioRecorderSupported || (Boolean(busy) && !recording)}
                title={
                  audioRecorderSupported
                    ? recording
                      ? "Stop recording"
                      : "Record audio"
                    : "Audio recording is not supported in this browser"
                }
              >
                <IconMic className="h-5 w-5" />
              </button>
            )}
          </form>
        </footer>
      )}
    </div>
  );
}
