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

1. **Route:** top-level `/notes` (matches `crm.evo-home.ch/notes`). Workspace selector inside the page. No new primary nav item.
2. **No Need entity.** Lead remains primary; VisitSession is the only new domain model.
3. **Media:** Documents linked as `visit_session`. Photos = existing image MIME. Audio = `audio/webm|mp4|mpeg|wav|ogg` (transcribed). Video = `video/webm|mp4` (**attached-only**, not transcribed). Max **50 MB** for visit media; client guides ~15 min audio / ~3 min video.
4. **Lead.notes mirror:** optional dated append on publish only; Activity remains source of truth.
5. **Permissions:** `lead:read` (search/open), `activity:create|update|read` (session/publish), `document:create|read` (media). No parallel ACL.
6. **Retention:** soft-archive session (`archivedAt`); media follows Document archive. No hard delete in V1.
7. **Offline:** composer text in `localStorage`; upload queue with retry on reconnect.

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

Media upload continues to use existing `/documents/upload-url` + `/confirm` with `linkedEntityType=visit_session`.
