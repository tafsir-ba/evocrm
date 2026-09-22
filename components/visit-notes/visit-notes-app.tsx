"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  VisitHistoryDrawer,
  type VisitHistoryItem,
} from "@/components/visit-notes/visit-history-drawer";
import { LiveMicWaveform } from "@/components/visit-notes/live-mic-waveform";
import { VisitMediaMessage } from "@/components/visit-notes/visit-media-message";
import {
  IconArrowLeft,
  IconBuilding,
  IconCamera,
  IconClose,
  IconDashboard,
  IconFile,
  IconLogout,
  IconMic,
  IconMenu,
  IconMore,
  IconNote,
  IconPlus,
  IconSearch,
  IconSend,
  IconShare,
  IconSparkles,
  IconUser,
  IconVideo,
} from "@/lib/icons";
import {
  buildConversationExport,
  downloadNotesExport,
  shareNotesText,
} from "@/lib/notes-share";
import { cn } from "@/lib/utils";
import { navHrefForSegment } from "@/lib/v1-navigation";
import { workspacePath } from "@/lib/workspace-paths";
import {
  clearOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from "@/lib/visit-notes-offline";
import {
  deriveVisitSessionTitle,
  formatVisitMediaFileSize,
  formatVisitSessionFallbackTitle,
  pickSupportedAudioRecorderMimeType,
  resolveVisitMediaMimeType,
  VISIT_AUDIO_MAX_DURATION_SECONDS,
  VISIT_VIDEO_MAX_DURATION_SECONDS,
  visitMediaKindFromMime,
} from "@/lib/visit-notes";
import {
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
  project?: { id: string; name: string; reference: string | null } | null;
};

function leadProjectLabel(lead: LeadHit): string | null {
  if (lead.project?.name?.trim()) {
    return lead.project.reference
      ? `${lead.project.name} (${lead.project.reference})`
      : lead.project.name;
  }
  return null;
}

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
  title: string | null;
  propertyId: string | null;
  messages: VisitMessage[];
  draftBody: string | null;
  aiDraft: { version: number } | null;
  createdAt: string;
  updatedAt: string;
  lead: { id: string; fullName: string; email: string | null } | null;
  project: { id: string; name: string } | null;
  property: {
    id: string;
    title: string;
    reference: string | null;
  } | null;
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

type PropertyHit = {
  id: string;
  title: string;
  reference: string | null;
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

function normalizeSession(raw: VisitSession): VisitSession {
  return {
    ...raw,
    title: raw.title ?? null,
    propertyId: raw.propertyId ?? null,
    property: raw.property ?? null,
    updatedAt: raw.updatedAt ?? raw.createdAt,
  };
}

function propertyLabel(
  property: { title: string; reference: string | null } | null | undefined,
): string | null {
  if (!property) return null;
  return [property.reference, property.title].filter(Boolean).join(" · ") || property.title;
}

function formatRecordingTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sessionDisplayTitle(session: VisitSession): string {
  const trimmed = session.title?.trim();
  if (trimmed) return trimmed;
  return formatVisitSessionFallbackTitle(session.createdAt);
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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [audioRecorderSupported, setAudioRecorderSupported] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitQuery, setUnitQuery] = useState("");
  const [unitHits, setUnitHits] = useState<PropertyHit[]>([]);
  const [unitSearching, setUnitSearching] = useState(false);
  const [showJumpLatest, setShowJumpLatest] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecordingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const photoCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const photoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const sessionsRef = useRef<VisitSession[]>([]);
  const attachMenuId = useId();
  const draftKey = selectedLead?.id ?? "new";
  const hasComposerText = composer.trim().length > 0;

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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
    if (!attachMenuOpen && !headerMenuOpen) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (attachMenuRef.current && target && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
      if (headerMenuRef.current && target && !headerMenuRef.current.contains(target)) {
        setHeaderMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAttachMenuOpen(false);
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [attachMenuOpen, headerMenuOpen]);

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
      cleanupRecordingResources();
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

  const searchUnits = useCallback(
    async (query: string, projectId: string) => {
      if (!workspaceSlug || !projectId) {
        setUnitHits([]);
        return;
      }
      setUnitSearching(true);
      try {
        const params = new URLSearchParams({
          projectId,
          pageSize: "12",
        });
        if (query.trim()) params.set("search", query.trim());
        const response = await fetch(
          `/api/workspaces/${workspaceSlug}/properties?${params.toString()}`,
        );
        if (!response.ok) {
          setUnitHits([]);
          return;
        }
        const body = (await response.json()) as { data: PropertyHit[] };
        setUnitHits(
          body.data.map((item) => ({
            id: item.id,
            title: item.title,
            reference: item.reference ?? null,
          })),
        );
      } finally {
        setUnitSearching(false);
      }
    },
    [workspaceSlug],
  );

  useEffect(() => {
    if (!unitModalOpen || !session?.projectId) return;
    const handle = window.setTimeout(() => {
      void searchUnits(unitQuery, session.projectId);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [unitModalOpen, unitQuery, session?.projectId, searchUnits]);

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
      const next = body.data.map(normalizeSession);
      setSessions(next);
      return next;
    },
    [workspaceSlug],
  );

  function failBanner(message: string) {
    setStatusBanner(null);
    setError(message);
  }

  function upsertSessionInList(next: VisitSession) {
    setSessions((prev) => {
      const index = prev.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...prev];
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
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
    return normalizeSession(body.data.session as VisitSession);
  }

  async function fetchSession(sessionId: string): Promise<VisitSession> {
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/visit-sessions/${sessionId}`,
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(body, "Could not open the conversation."));
    }
    return normalizeSession(body.data.session as VisitSession);
  }

  function enterSession(next: VisitSession) {
    const normalized = normalizeSession(next);
    setSession(normalized);
    setDraftBody(normalized.draftBody ?? "");
    setPendingUploads([]);
    setAttachMenuOpen(false);
    setHeaderMenuOpen(false);
    setEditingTitle(false);
    setTitleDraft(sessionDisplayTitle(normalized));
    setError(null);
    setStatusBanner(null);
    upsertSessionInList(normalized);
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
        // Instant enter from list payload — no blank “Opening conversation…” when known.
        enterSession(resumable);
        setBusy(null);
        setSessionRefreshing(true);
        try {
          enterSession(await fetchSession(resumable.id));
        } catch {
          // Keep the list snapshot; soft-refresh failure is non-fatal.
        } finally {
          setSessionRefreshing(false);
        }
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
      setHistoryOpen(false);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not start conversation.");
    } finally {
      setBusy(null);
    }
  }

  async function openSessionFromDrawer(sessionId: string) {
    if (session?.id === sessionId) {
      setHistoryOpen(false);
      return;
    }

    const cached = sessionsRef.current.find((item) => item.id === sessionId);
    setHistoryOpen(false);
    setError(null);

    if (cached) {
      // Keep chat UI visible — never blank full-page "Opening conversation…"
      enterSession(cached);
      setSessionRefreshing(true);
      try {
        const fresh = await fetchSession(sessionId);
        enterSession(fresh);
      } catch (err) {
        failBanner(err instanceof Error ? err.message : "Could not open conversation.");
      } finally {
        setSessionRefreshing(false);
      }
      return;
    }

    setSessionRefreshing(true);
    try {
      enterSession(await fetchSession(sessionId));
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not open conversation.");
    } finally {
      setSessionRefreshing(false);
    }
  }

  async function patchSession(patch: {
    title?: string | null;
    propertyId?: string | null;
    editedDraftBody?: string | null;
  }): Promise<VisitSession> {
    if (!session) throw new Error("No session.");
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const body = await response.json();
    if (!response.ok) {
      throw new Error(apiErrorMessage(body, "Could not update conversation."));
    }
    return normalizeSession(body.data.session as VisitSession);
  }

  async function saveTitle(nextTitle: string) {
    if (!session) return;
    const trimmed = nextTitle.trim();
    const current = session.title?.trim() || "";
    setEditingTitle(false);
    if (!trimmed || trimmed === current) {
      setTitleDraft(sessionDisplayTitle(session));
      return;
    }
    setBusy("title");
    setError(null);
    try {
      const next = await patchSession({ title: trimmed });
      setSession(next);
      setTitleDraft(sessionDisplayTitle(next));
      upsertSessionInList(next);
    } catch (err) {
      setTitleDraft(sessionDisplayTitle(session));
      failBanner(err instanceof Error ? err.message : "Could not rename.");
    } finally {
      setBusy(null);
    }
  }

  async function linkUnit(propertyId: string | null) {
    if (!session) return;
    setBusy("unit");
    setError(null);
    try {
      const next = await patchSession({ propertyId });
      setSession(next);
      upsertSessionInList(next);
      setUnitModalOpen(false);
      setUnitQuery("");
      setHeaderMenuOpen(false);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not link unit.");
    } finally {
      setBusy(null);
    }
  }

  async function sendText(event?: FormEvent) {
    event?.preventDefault();
    if (!session || !composer.trim()) return;
    setBusy("send");
    setError(null);
    const text = composer.trim();
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "text", text }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not send note."));
      }
      let next = normalizeSession(body.data.session as VisitSession);
      if (!next.title?.trim()) {
        const derived = deriveVisitSessionTitle(text);
        if (derived) {
          next = { ...next, title: derived };
          setTitleDraft(derived);
        }
      } else {
        setTitleDraft(sessionDisplayTitle(next));
      }
      setSession(next);
      upsertSessionInList(next);
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
            apiErrorMessage(body, "Could not attach media to this note."),
            {
              stage: "attach",
              status: response.status,
              retryable: response.status >= 500 || response.status === 429,
            },
          );
        }

        next = normalizeSession(body.data.session as VisitSession);
        setSession(next);
        upsertSessionInList(next);
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
        next = normalizeSession(transcribeBody.data.session as VisitSession);
        setSession(next);
        upsertSessionInList(next);
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

  function stopRecordingTimer() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingStartedAtRef.current = null;
  }

  function cleanupRecordingResources() {
    stopRecordingTimer();
    setRecordingStream(null);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }

  function startRecordingClock() {
    recordingStartedAtRef.current = Date.now();
    setRecordingSeconds(0);
    recordingTimerRef.current = window.setInterval(() => {
      if (!recordingStartedAtRef.current) return;
      setRecordingSeconds(
        Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
      );
    }, 250);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;
      // Show recording chrome + waveform immediately (before MediaRecorder settles).
      setRecordingStream(stream);
      setRecording(true);
      startRecordingClock();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cleanupRecordingResources();
        mediaRecorderRef.current = null;
        setRecording(false);
        setRecordingSeconds(0);
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
        const file = new File([blob], `note-audio-${Date.now()}.${extension}`, {
          type: mimeType,
        });
        enqueueMedia(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setError(null);
      setStatusBanner(
        `Recording… tap Stop when finished (guide ≤ ${Math.round(VISIT_AUDIO_MAX_DURATION_SECONDS / 60)} min).`,
      );
    } catch {
      cleanupRecordingResources();
      setRecording(false);
      setRecordingSeconds(0);
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
    setStatusBanner("Summarizing conversation…");
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
      const next = normalizeSession(body.data.session as VisitSession);
      setSession(next);
      setDraftBody(next.draftBody ?? "");
      upsertSessionInList(next);
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
        await patchSession({ editedDraftBody: draftBody });
      }
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/visit-sessions/${session.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editedDraftBody: draftBody || null,
            createTasksFromNextSteps: true,
            mirrorToLeadNotes: true,
            registerLeadNoteActivity: true,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Could not save to lead notes."));
      }
      const next = normalizeSession(body.data.session as VisitSession);
      setSession(next);
      setDraftBody(next.draftBody ?? "");
      upsertSessionInList(next);
      if (selectedLead) await loadSessionsForLead(selectedLead.id);
      setStatusBanner("Saved to lead notes. Media is on the lead Files tab.");
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Could not save to lead notes.");
    } finally {
      setBusy(null);
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
      const next = normalizeSession(body.data.session as VisitSession);
      setSession(next);
      upsertSessionInList(next);
      setStatusBanner(null);
    } catch (err) {
      failBanner(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusy(null);
    }
  }

  function leaveSession() {
    setSession(null);
    setPendingUploads([]);
    setAttachMenuOpen(false);
    setHeaderMenuOpen(false);
    setHistoryOpen(false);
    setEditingTitle(false);
    setStatusBanner(null);
    setError(null);
    setLightboxUrl(null);
  }

  const currentWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const mediaBusy = pendingUploads.some(
    (item) => item.status === "uploading" || item.status === "transcribing",
  );
  const visibleMessages = useMemo(
    () => (session?.messages ?? []).filter((message) => message.kind !== "transcript"),
    [session?.messages],
  );
  const historyItems: VisitHistoryItem[] = useMemo(
    () =>
      sessions.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        updatedAt: item.updatedAt,
        createdAt: item.createdAt,
        leadName:
          item.lead?.fullName ??
          (item.leadId === selectedLead?.id ? selectedLead.fullName : null),
        propertyLabel: propertyLabel(item.property),
      })),
    [sessions, selectedLead],
  );
  const linkedUnitLabel = propertyLabel(session?.property ?? null);
  const hasSummary = Boolean(draftBody.trim() || session?.draftBody?.trim());
  const canShare =
    Boolean(session) && (hasSummary || visibleMessages.length > 0);

  async function shareConversation() {
    if (!session || !canShare) return;

    const summary = draftBody.trim() || session.draftBody?.trim() || "";
    const title = sessionDisplayTitle(session);
    const text = summary
      ? summary
      : buildConversationExport({
          title,
          leadName: session.lead?.fullName ?? selectedLead?.fullName ?? null,
          unitLabel: linkedUnitLabel,
          messages: visibleMessages.map((message) => ({
            kind: message.kind,
            text: message.text,
            createdAt: message.createdAt,
          })),
          summary: null,
        });

    setBusy("share");
    try {
      const result = await shareNotesText({ title, text });
      if (result === "shared") {
        setStatusBanner("Shared.");
      } else if (result === "copied") {
        setStatusBanner("Copied to clipboard.");
      } else if (result === "cancelled") {
        setStatusBanner(null);
      } else {
        downloadNotesExport({
          fileName: `${title.replace(/[^\w.-]+/g, "_") || "note"}.txt`,
          text,
        });
        setStatusBanner("Download started (sharing unavailable here).");
      }
    } finally {
      setBusy(null);
      setAttachMenuOpen(false);
    }
  }

  function downloadConversationExport() {
    if (!session) return;
    const title = sessionDisplayTitle(session);
    const text = buildConversationExport({
      title,
      leadName: session.lead?.fullName ?? selectedLead?.fullName ?? null,
      unitLabel: linkedUnitLabel,
      messages: visibleMessages.map((message) => ({
        kind: message.kind,
        text: message.text,
        createdAt: message.createdAt,
      })),
      summary: draftBody.trim() || session.draftBody || null,
    });
    downloadNotesExport({
      fileName: `${title.replace(/[^\w.-]+/g, "_") || "note"}.txt`,
      text,
    });
    setAttachMenuOpen(false);
    setStatusBanner("Export downloaded.");
  }

  function jumpToLatest() {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowJumpLatest(false);
  }

  function onThreadScroll() {
    const el = threadScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpLatest(distanceFromBottom > 120);
  }

  if (workspaces.length === 0) {
    return (
      <div className="min-h-dvh bg-[var(--color-canvas)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-[var(--color-ink)]">Notes</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Join or create a workspace before capturing notes for a lead.
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
      <header
        className={cn(
          "z-30 border-b border-[var(--color-line)] bg-white/95 backdrop-blur-md pt-[env(safe-area-inset-top)]",
          session
            ? "fixed inset-x-0 top-0"
            : "sticky top-0",
        )}
        data-testid="notes-sticky-header"
      >
        {session ? (
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              aria-label="Conversation history"
              onClick={() => setHistoryOpen(true)}
            >
              <IconMenu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void saveTitle(titleDraft)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveTitle(titleDraft);
                    }
                    if (event.key === "Escape") {
                      setEditingTitle(false);
                      setTitleDraft(sessionDisplayTitle(session));
                    }
                  }}
                  className="h-8 w-full rounded-md border border-[var(--color-line)] bg-white px-2 text-[15px] font-semibold focus:border-[var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-100)]"
                  aria-label="Conversation title"
                  maxLength={120}
                />
              ) : (
                <button
                  type="button"
                  className="block w-full truncate text-left text-[15px] font-semibold leading-tight hover:text-[var(--color-brand-700)]"
                  onClick={() => {
                    setTitleDraft(sessionDisplayTitle(session));
                    setEditingTitle(true);
                  }}
                  title="Rename conversation"
                >
                  {sessionDisplayTitle(session)}
                </button>
              )}
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <p className="truncate text-[12px] text-[var(--color-ink-muted)]">
                  {session.lead?.fullName ?? selectedLead?.fullName ?? "Lead"}
                </p>
                {sessionRefreshing && (
                  <span className="shrink-0 text-[11px] text-[var(--color-ink-faint)]">
                    Updating…
                  </span>
                )}
              </div>
            </div>

            {linkedUnitLabel ? (
              <button
                type="button"
                className="inline-flex max-w-[40%] items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-muted)] px-2 py-1 text-[11.5px] text-[var(--color-ink-soft)]"
                onClick={() => {
                  setUnitQuery("");
                  setUnitModalOpen(true);
                }}
                title={linkedUnitLabel}
              >
                <IconBuilding className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{linkedUnitLabel}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear linked unit"
                  className="ml-0.5 inline-flex rounded-full p-0.5 hover:bg-white"
                  onClick={(event) => {
                    event.stopPropagation();
                    void linkUnit(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      void linkUnit(null);
                    }
                  }}
                >
                  <IconClose className="h-3 w-3" />
                </span>
              </button>
            ) : null}

            <div className="relative shrink-0" ref={headerMenuRef}>
              <button
                type="button"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
                  headerMenuOpen && "bg-[var(--color-muted)]",
                )}
                aria-label="Conversation actions"
                aria-expanded={headerMenuOpen}
                onClick={() => setHeaderMenuOpen((open) => !open)}
              >
                <IconMore className="h-5 w-5" />
              </button>
              {headerMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-md)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      setUnitQuery("");
                      setUnitModalOpen(true);
                    }}
                  >
                    <IconBuilding className="h-4 w-4 text-[var(--color-ink-soft)]" />
                    {linkedUnitLabel ? "Change unit" : "Link unit"}
                  </button>
                  {(session?.leadId || selectedLead?.id) && (
                    <Link
                      href={workspacePath(
                        workspaceSlug,
                        "leads",
                        session?.leadId ?? selectedLead!.id,
                      )}
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                      onClick={() => setHeaderMenuOpen(false)}
                      data-testid="notes-open-lead"
                    >
                      <IconUser className="h-4 w-4 text-[var(--color-ink-soft)]" />
                      Open Lead
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      leaveSession();
                    }}
                  >
                    <IconArrowLeft className="h-4 w-4 text-[var(--color-ink-soft)]" />
                    Find another lead
                  </button>
                  <div className="my-1 border-t border-[var(--color-line)]" />
                  <Link
                    href={navHrefForSegment(workspaceSlug, "dashboard")}
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                    onClick={() => setHeaderMenuOpen(false)}
                  >
                    <IconDashboard className="h-4 w-4 text-[var(--color-ink-soft)]" />
                    Dashboard
                  </Link>
                  <Link
                    href={navHrefForSegment(workspaceSlug, "dashboard")}
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                    onClick={() => setHeaderMenuOpen(false)}
                  >
                    <IconLogout className="h-4 w-4 text-[var(--color-ink-soft)]" />
                    Exit Notes
                  </Link>
                </div>
              )}
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
                className="h-9 max-w-[38%] rounded-md border border-[var(--color-line)] bg-white px-2 text-[12.5px]"
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
              <div className="relative shrink-0" ref={headerMenuRef}>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]",
                    headerMenuOpen && "bg-[var(--color-muted)]",
                  )}
                  aria-label="Notes navigation"
                  aria-expanded={headerMenuOpen}
                  onClick={() => setHeaderMenuOpen((open) => !open)}
                >
                  <IconMore className="h-5 w-5" />
                </button>
                {headerMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-[var(--shadow-md)]"
                  >
                    <Link
                      href={navHrefForSegment(workspaceSlug, "dashboard")}
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                      onClick={() => setHeaderMenuOpen(false)}
                    >
                      <IconDashboard className="h-4 w-4 text-[var(--color-ink-soft)]" />
                      Dashboard
                    </Link>
                    <Link
                      href={navHrefForSegment(workspaceSlug, "dashboard")}
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--color-muted)]"
                      onClick={() => setHeaderMenuOpen(false)}
                    >
                      <IconLogout className="h-4 w-4 text-[var(--color-ink-soft)]" />
                      Exit Notes
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="mx-auto max-w-3xl px-4 pb-3 space-y-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <Input
                  className="pl-9"
                  placeholder="Who is this note about?"
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
                          data-testid="notes-lead-hit"
                        >
                          <span className="text-[13.5px] font-medium">{lead.fullName}</span>
                          <span className="text-[12px] text-[var(--color-ink-muted)]">
                            {[lead.email || "No email", leadProjectLabel(lead)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </header>

      <main
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))]",
          session ? "pt-[calc(4.75rem+env(safe-area-inset-top))]" : "pt-4",
        )}
      >
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
            <h2 className="text-[17px] font-semibold">Who is this note about?</h2>
            <p className="mt-1.5 max-w-sm text-[13.5px] text-[var(--color-ink-muted)]">
              Pick someone once, then type, talk, or attach.
            </p>
          </div>
        )}

        {selectedLead && !session && (
          <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
            <h2 className="text-[17px] font-semibold">{selectedLead.fullName}</h2>
            <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-muted)]">
              Opening conversation…
            </p>
          </div>
        )}

        {session && (
          <div className="relative flex flex-1 flex-col gap-3">
            <div
              ref={threadScrollRef}
              onScroll={onThreadScroll}
              className="flex-1 space-y-2.5 overflow-y-auto"
              data-testid="notes-thread"
            >
              {visibleMessages.length === 0 && pendingUploads.length === 0 && (
                <p className="px-1 py-8 text-center text-[13.5px] text-[var(--color-ink-muted)]">
                  Type a note, tap the mic, or attach a photo.
                </p>
              )}

              {visibleMessages.map((message) => {
                const isText = message.kind === "text";
                const isMedia =
                  message.kind === "photo" ||
                  message.kind === "video" ||
                  message.kind === "audio";

                if (isMedia) {
                  const localPreview =
                    pendingUploads.find(
                      (item) => item.documentId === message.documentId,
                    )?.previewUrl ?? null;
                  return (
                    <article
                      key={message.id}
                      className="rounded-2xl motion-safe:animate-[visitNoteIn_0.25s_ease]"
                    >
                      {message.status === "transcribing" && (
                        <p className="mb-1 px-1 text-[12px] text-[var(--color-ink-muted)]">
                          Transcribing…
                        </p>
                      )}
                      <VisitMediaMessage
                        workspaceSlug={workspaceSlug}
                        kind={message.kind as "photo" | "video" | "audio"}
                        documentId={message.documentId}
                        transcript={
                          message.kind === "audio" ? message.text : null
                        }
                        localPreviewUrl={localPreview}
                        onOpenLightbox={(url) => setLightboxUrl(url)}
                      />
                      {message.status === "failed" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
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
                }

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
                    {message.text && (
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                        {message.text}
                      </p>
                    )}
                    {message.status === "failed" && (
                      <p className="mt-2 text-[12px] text-[var(--color-danger-fg)]">
                        {message.error ?? "Something went wrong."}
                      </p>
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
                      <p className="text-[13.5px] font-medium">
                        {item.kind === "photo"
                          ? "Photo"
                          : item.kind === "video"
                            ? "Video"
                            : "Audio"}
                      </p>
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

            {visibleMessages.length > 0 && (
              <section
                className="mt-2 space-y-3 border-t border-[var(--color-line)] pt-4"
                data-testid="after-capture-actions"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void summarize()}
                    disabled={Boolean(busy) || visibleMessages.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-50"
                  >
                    <IconSparkles className="h-3.5 w-3.5" />
                    {busy === "summarize" ? "Summarizing…" : "Summarize conversation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareConversation()}
                    disabled={Boolean(busy) || !canShare}
                    title={
                      canShare
                        ? "Share via the system share sheet (or copy)"
                        : "Add a message or summarize first"
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] disabled:opacity-50"
                    data-testid="notes-share-chip"
                  >
                    <IconShare className="h-3.5 w-3.5" />
                    Share
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
                          Saves the summary and media to this lead’s CRM notes profile
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void publish()}
                        loading={busy === "publish"}
                        disabled={Boolean(busy) || !draftBody.trim()}
                      >
                        Save to lead notes
                      </Button>
                    </div>
                    <Textarea
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      className="min-h-[160px] bg-white"
                      placeholder="Edit the summary before saving to the lead…"
                    />
                  </div>
                )}
              </section>
            )}

            {showJumpLatest && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] shadow-[var(--shadow-sm)]"
                data-testid="jump-to-latest"
              >
                Jump to latest
              </button>
            )}
          </div>
        )}
      </main>

      {session && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-white/95 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {recording && (
            <div
              className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3"
              data-testid="notes-recording-bar"
            >
              <p className="w-12 shrink-0 tabular-nums text-[13px] font-semibold text-[var(--color-danger-fg)]">
                {formatRecordingTimer(recordingSeconds)}
              </p>
              <LiveMicWaveform stream={recordingStream} active={recording} />
              <div className="flex shrink-0 gap-2">
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
                disabled={mediaBusy && !recording}
                data-testid="notes-attach-button"
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
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14px] hover:bg-[var(--color-muted)] disabled:opacity-50"
                    disabled={Boolean(busy) || !canShare}
                    data-testid="notes-share-menu-item"
                    onClick={() => void shareConversation()}
                  >
                    <IconShare className="h-5 w-5 text-[var(--color-ink-soft)]" />
                    Share
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[14px] hover:bg-[var(--color-muted)] disabled:opacity-50"
                    disabled={Boolean(busy) || !session}
                    data-testid="notes-download-export-menu-item"
                    onClick={() => downloadConversationExport()}
                  >
                    <IconFile className="h-5 w-5 text-[var(--color-ink-soft)]" />
                    Download export
                  </button>
                  <p className="border-t border-[var(--color-line)] px-3.5 py-2 text-[11.5px] text-[var(--color-ink-faint)]">
                    Share uses the device share sheet when available (copy/download otherwise). Exports are text only — never private media links.
                  </p>
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
              aria-label="Note message"
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

      <VisitHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={historyItems}
        currentSessionId={session?.id ?? null}
        onSelect={(sessionId) => void openSessionFromDrawer(sessionId)}
        onNew={() => void startSession()}
        creating={busy === "create"}
      />

      <Modal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        title="Link unit"
      >
        <div className="space-y-3">
          <Input
            placeholder="Search units…"
            value={unitQuery}
            onChange={(event) => setUnitQuery(event.target.value)}
            autoFocus
          />
          {unitSearching && (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">Searching…</p>
          )}
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {unitHits.length === 0 && !unitSearching && (
              <li className="py-6 text-center text-[13px] text-[var(--color-ink-muted)]">
                No units found.
              </li>
            )}
            {unitHits.map((property) => {
              const label =
                [property.reference, property.title].filter(Boolean).join(" · ") ||
                property.title;
              const active = session?.propertyId === property.id;
              return (
                <li key={property.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--color-muted)]",
                      active && "bg-[var(--color-brand-50)]",
                    )}
                    onClick={() => void linkUnit(property.id)}
                    disabled={busy === "unit"}
                  >
                    <IconBuilding className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-soft)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium">
                        {label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {session?.propertyId && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void linkUnit(null)}
              disabled={busy === "unit"}
            >
              Clear linked unit
            </Button>
          )}
        </div>
      </Modal>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="Close photo"
            onClick={() => setLightboxUrl(null)}
          />
          <button
            type="button"
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            aria-label="Close"
            onClick={() => setLightboxUrl(null)}
          >
            <IconClose className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="relative z-[1] max-h-[min(90dvh,900px)] max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
