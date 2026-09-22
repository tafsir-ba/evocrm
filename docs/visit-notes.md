# AI Visit Notes — Implementation Plan

Authenticated mobile-first app at `/notes`. Working session record is `VisitSession`; published CRM truth remains Activity `type=visit` on the Lead/project timeline.

## Existing components mapped to changes

| Concern | Reuse | Change |
|---------|-------|--------|
| Auth / protected route | `middleware.ts`, `protected-app-paths.ts` | Add `/notes` + `/api/workspaces/.../visit-sessions` |
| Workspace + grants | `requireWorkspaceApiAccess`, `applyUserProjectScope`, `requireProjectAccess` | Every session/search/media call |
| Lead search | `listLeadsForWorkspace` | Notes UI search only |
| Activity publish | `createActivityForWorkspace` / `updateActivityForWorkspace` + dictionary `visit` / `task` | Publish & optional next-step task |
| Documents / Spaces | signed upload → confirm → signed download | Add `visit_session` linked type; audio/video MIME; 50 MB visit for visit media |
| OpenAI | `OPENAI_API_KEY`, chat completions pattern | Whisper transcription + structured summary |
| Soft archive | `archivedAt` | Same on VisitSession + Document |
| UI language | light canvas, Button/Input/Textarea | Dedicated `/notes` shell (not primary nav) |

## Product choices (locked for V1 slice)

1. **Route:** top-level `/notes` (matches `crm.evo-home.ch/notes`). Workspace selector inside the page. Linked from primary CRM nav (Dashboard homepage CTA + sidebar **Notes**).
2. **No Need entity.** Lead remains primary; VisitSession is the only new domain model.
3. **Media:** Documents linked as `visit_session`. Photos include JPEG/PNG/WebP/**HEIC/HEIF**. Audio/video (`audio/webm|mp4|mpeg|wav|ogg|aac`, `video/webm|mp4|quicktime`) are **visit_session-only**. Max **50 MB**; client guides ~15 min audio / ~3 min video. Audio may be transcribed; video is attached-only. Uploads go through same-origin `/documents/direct` (not browser PUT to Spaces).
4. **Lead notes on publish:** Publishing creates a completed `note` Activity on the lead (Internal notes / Notes tab), appends a dated mirror onto `Lead.notes` by default, and **re-links session media documents to the lead** so they appear under lead Files. VisitSession remains the working conversation history; unpublished sessions stay drafts in Notes.
5. **Permissions:** `lead:read` (search/open), `activity:create|update|read` (session/publish), `document:create|read` (media). No parallel ACL.
6. **Retention:** soft-archive session (`archivedAt`); media follows Document archive. No hard delete in V1.
7. **Offline:** composer text in `localStorage`. Media requires connectivity; failed in-session uploads keep Retry/Remove and automatically retry on `online` while the tab remains open (files are not persisted to disk/localStorage).

## Blockers / env

- Live upload/transcription needs Spaces + `OPENAI_API_KEY`. Without them, typed notes + draft edit/publish still work; AI/media endpoints return clear recoverable errors.
- No schema migration scripts required beyond Mongoose model registration (indexes created on use).

## API surface (workspace-scoped)

```
GET/POST   /api/workspaces/:slug/visit-sessions
GET/PATCH  /api/workspaces/:slug/visit-sessions/:id
POST       /api/workspaces/:slug/visit-sessions/:id/messages
POST       /api/workspaces/:slug/visit-sessions/:id/summarize
POST       /api/workspaces/:slug/visit-sessions/:id/publish
POST       /api/workspaces/:slug/visit-sessions/:id/archive
POST       /api/workspaces/:slug/visit-sessions/:id/transcribe
```

Visit media uses same-origin `POST /documents/direct` (multipart → server `uploadObject` → Document) with `linkedEntityType=visit_session`. This avoids browser → Spaces CORS failures that iPhone Safari surfaces as “Load failed”. Presigned `/upload-url` + `/confirm` remains for other document UIs.

## Capture UX (ChatGPT-first)

1. **History drawer:** Conversation list (title, updated time, lead, optional unit) via collapsible side panel / mobile slide-over. No blank “Opening conversation…” when the session payload is already known. New conversation from the drawer.
2. **Session title:** Persisted on `VisitSession.title`. Default from first substantive user text (or AI when available); rename via PATCH. Rename must not mutate CRM Activities.
3. **Optional unit:** One optional primary `VisitSession.propertyId` (canonical Property). Explicit link/unlink only — never inferred from the lead’s primary project. Included in publish/summarize context only when set. Compact chip after link.
4. **Audio:** One chat event (`kind=audio`) with player + transcript text on the same message. Legacy `kind=transcript` rows are hidden in the thread (data retained). Live recording shows timer, stop/cancel, and Web Audio analyser mic level (Safari-safe stream release).
5. **Media:** Inline image thumbnails (in-app lightbox); video poster + in-app player. Signed private URLs; local object-URL preview until ready. Download/open is secondary overflow. Retry/Remove on failure.
6. **Summary:** After the thread; sees media metadata + transcripts; includes linked unit label only when `propertyId` is set.
