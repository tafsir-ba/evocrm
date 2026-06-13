# API Contracts — V1

Standards for all REST-style JSON APIs in the real estate CRM.

---

## Base URL Pattern

All workspace-scoped APIs:

```txt
/api/workspaces/[workspaceSlug]/...
```

Workspace slug is resolved server-side to `workspaceId`. Never accept `workspaceId` from the client body as the source of truth.

---

## Authentication

All workspace APIs require an authenticated session unless explicitly documented as public (e.g. unsubscribe webhook).

Unauthenticated requests return `401` with code `UNAUTHENTICATED`.

---

## Success Response Shape

### Single resource

```json
{
  "data": {}
}
```

### List with pagination

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

### Created resource

`201 Created` with `{ "data": {} }` body.

### Archive / soft-delete (V1 convention)

**`DELETE` on a resource means archive in V1.** It does not hard-delete user-facing records.

| Rule | Detail |
|------|--------|
| HTTP method | `DELETE /api/workspaces/[workspaceSlug]/…/[id]` |
| Behavior | Sets `archivedAt` (and `status` where applicable, e.g. Document) |
| Hard delete | Not used for V1 user-facing entities |
| Response | `200 OK` with `{ "data": … }` — do not use `204` |

```json
{
  "data": {
    "id": "…",
    "archivedAt": "2026-06-12T12:00:00.000Z"
  }
}
```

Do **not** use separate `POST …/archive` endpoints. All phase briefs and implementations must use `DELETE` for archive.

---

## Response Helpers (Phase 0)

Server route handlers should use typed helpers from `/server/api/responses.ts`:

```txt
successResponse(data)
paginatedResponse(data, pagination)
errorResponse(code, message, { details? })
```

Application errors: `/server/errors.ts` (`AppError`, `serializeUnknownError`).

---

## Error Response Shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `code` | Machine-readable error code |
| `message` | Human-readable summary |
| `details` | Optional field-level or context detail |

---

## Required Error Codes

| Code | HTTP Status | When |
|------|-------------|------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Resource does not exist in workspace |
| `VALIDATION_ERROR` | 400 | Request body/query failed Zod validation |
| `CONFLICT` | 409 | Duplicate, state conflict, or constraint violation |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `WORKSPACE_NOT_FOUND` | 404 | Slug does not resolve to a workspace |
| `MEMBERSHIP_REQUIRED` | 403 | User has no active membership in workspace |
| `PERMISSION_DENIED` | 403 | Membership exists but permission key missing |

Use `PERMISSION_DENIED` for authorization failures within a valid workspace context. Use `MEMBERSHIP_REQUIRED` when the user is not a member or membership is not `active`.

---

## Pagination

### Query parameters

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | number | `1` | — |
| `pageSize` | number | `25` | `100` |

### Response fields

```txt
page
pageSize
total
totalPages
```

`totalPages = Math.ceil(total / pageSize)`

---

## Filtering and Search

- All filters must be **backend-supported** and **workspace-scoped**.
- Search must not require the frontend to load all records.
- Filter query params should be documented per resource in later phases (e.g. `statusId`, `assignedTo`, `q` for text search).
- Archived records are excluded from active lists by default unless `includeArchived=true` is explicitly supported and permission-gated.

---

## Sorting

Document per resource. Recommended pattern:

```txt
sort=createdAt
order=desc
```

---

## Workspace API Endpoints (planned)

Endpoints below are the V1 contract. Implementation happens in later phases.

### Leads

**Phase 4 — implemented.** Workspace-scoped under `/api/workspaces/[workspaceSlug]/leads`.

```txt
GET    /api/workspaces/[workspaceSlug]/leads
POST   /api/workspaces/[workspaceSlug]/leads
GET    /api/workspaces/[workspaceSlug]/leads/[leadId]
PATCH  /api/workspaces/[workspaceSlug]/leads/[leadId]
DELETE /api/workspaces/[workspaceSlug]/leads/[leadId]          # archive (soft)
```

| Method | Permission |
|--------|------------|
| GET list/detail | `lead:read` |
| POST create | `lead:create` |
| PATCH update | `lead:update` |
| DELETE archive | `lead:archive` |

**GET list** returns paginated `{ data: LeadListItem[], pagination }` with filters: `page`, `pageSize`, `search`, `statusId`, `sourceId`, `assignedTo`, `ownerId`, `tagId`, `createdFrom`, `createdTo`, `includeArchived`.

**POST/PATCH** reject client-provided `workspaceId`, `createdBy`, `fullName`, `emailNormalized`, `phoneNormalized`, `archivedAt`. Duplicate active email returns `409 CONFLICT`. Duplicate phone returns `warnings: ["duplicate_phone"]` without blocking.

**DELETE** sets `archivedAt`; does not hard-delete.

UI routes: `/w/[workspaceSlug]/leads`, `/w/[workspaceSlug]/leads/[leadId]`. Status/source options from dictionary APIs; tags from tags API with `entityType=lead`.

### Properties

**Phase 5 — implemented.** Workspace-scoped under `/api/workspaces/[workspaceSlug]/properties`.

```txt
GET    /api/workspaces/[workspaceSlug]/properties
POST   /api/workspaces/[workspaceSlug]/properties
GET    /api/workspaces/[workspaceSlug]/properties/[propertyId]
PATCH  /api/workspaces/[workspaceSlug]/properties/[propertyId]
DELETE /api/workspaces/[workspaceSlug]/properties/[propertyId]  # archive (soft)
```

| Method | Permission |
|--------|------------|
| GET list/detail | `property:read` |
| POST create | `property:create` |
| PATCH update | `property:update` |
| DELETE archive | `property:archive` |

**GET list** returns paginated `{ data: PropertyListItem[], pagination }` with filters: `page`, `pageSize`, `search`, `statusId`, `typeId`, `projectId`, `assignedTo`, `ownerId`, `tagId`, `city`, `country`, `minPrice`, `maxPrice`, `createdFrom`, `createdTo`, `includeArchived`.

**POST/PATCH** reject client-provided `workspaceId`, `createdBy`, `archivedAt`. Duplicate `reference` per workspace returns `409 CONFLICT` (includes archived properties). `currency` defaults from `workspace.defaultCurrency` when omitted on create.

**DELETE** sets `archivedAt`; does not hard-delete.

UI routes: `/w/[workspaceSlug]/properties`, `/w/[workspaceSlug]/properties/[propertyId]`. Status/type options from dictionary APIs (`property_status`, `property_type`); tags from tags API with `entityType=property`; projects from projects API (active only). Media/Files/Opportunities/Activities/Notes tabs are placeholders only.

### Opportunities

```txt
GET    /api/workspaces/[workspaceSlug]/opportunities
POST   /api/workspaces/[workspaceSlug]/opportunities
GET    /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]
PATCH  /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]
DELETE /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]  # archive (soft)
PATCH  /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]/status
```

### Activities

```txt
GET    /api/workspaces/[workspaceSlug]/activities
POST   /api/workspaces/[workspaceSlug]/activities
GET    /api/workspaces/[workspaceSlug]/activities/[activityId]
PATCH  /api/workspaces/[workspaceSlug]/activities/[activityId]
DELETE /api/workspaces/[workspaceSlug]/activities/[activityId]  # archive (soft)
```

### Documents

```txt
GET    /api/workspaces/[workspaceSlug]/documents
POST   /api/workspaces/[workspaceSlug]/documents/upload-url
POST   /api/workspaces/[workspaceSlug]/documents/confirm
GET    /api/workspaces/[workspaceSlug]/documents/[documentId]
POST   /api/workspaces/[workspaceSlug]/documents/[documentId]/signed-url
DELETE /api/workspaces/[workspaceSlug]/documents/[documentId]  # archive (soft)
```

#### Canonical V1 upload flow (presigned direct-to-Spaces)

V1 uses **presigned direct upload**, not backend multipart proxy. Do not implement an alternative multipart-through-backend path unless explicitly approved in a future revision.

```txt
1. Client: POST /documents/upload-url
   Body: { linkedEntityType, linkedEntityId, fileName, mimeType, fileSize }
2. Server: authenticate, resolve workspace, check document:create,
           validate linked entity (same workspace), MIME allowlist, max size,
           sanitize fileName → return short-lived signed upload URL + storageKey + uploadId
3. Client: PUT file directly to Spaces using signed URL
4. Client: POST /documents/confirm
   Body: { uploadId, storageKey, … }
5. Server: verify object exists in bucket, create Document record with status active
6. Client: use POST /documents/[documentId]/signed-url for download (never permanent public URL)
```

Download flow: `POST /documents/[documentId]/signed-url` after `document:read` permission check.

### Campaigns (Dripping)

```txt
GET    /api/workspaces/[workspaceSlug]/campaigns
POST   /api/workspaces/[workspaceSlug]/campaigns
GET    /api/workspaces/[workspaceSlug]/campaigns/[campaignId]
PATCH  /api/workspaces/[workspaceSlug]/campaigns/[campaignId]
DELETE /api/workspaces/[workspaceSlug]/campaigns/[campaignId]  # archive (soft)
GET    /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps
POST   /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps
PATCH  /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps/[stepId]
POST   /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/enroll
```

### Dashboard

```txt
GET    /api/workspaces/[workspaceSlug]/dashboard/summary
```

### Dictionaries / Tags (Phase 3 — implemented)

```txt
GET    /api/workspaces/[workspaceSlug]/dictionaries
GET    /api/workspaces/[workspaceSlug]/dictionaries/[dictionaryId]
PATCH  /api/workspaces/[workspaceSlug]/dictionaries/[dictionaryId]

GET    /api/workspaces/[workspaceSlug]/dictionary-items
POST   /api/workspaces/[workspaceSlug]/dictionary-items
PATCH  /api/workspaces/[workspaceSlug]/dictionary-items/[itemId]
DELETE /api/workspaces/[workspaceSlug]/dictionary-items/[itemId]  # inactivate (soft)

GET    /api/workspaces/[workspaceSlug]/tags
POST   /api/workspaces/[workspaceSlug]/tags
PATCH  /api/workspaces/[workspaceSlug]/tags/[tagId]
DELETE /api/workspaces/[workspaceSlug]/tags/[tagId]  # archive (soft)
```

**Permissions:** `settings:read` for GET; `settings:update` for mutations.

**Dictionary item list defaults:** active items only, ordered by `order` ascending. Pass `includeInactive=true` to include inactive items.

**Dictionary item uniqueness:** `key` is unique per workspace/type. Active `label` is also unique per workspace/type (case-insensitive).

**Dictionary types (allowlist):** `lead_status`, `property_status`, `opportunity_status`, `activity_status`, `activity_type`, `lead_source`, `property_type`, `lost_reason`.

**Tag entity types (allowlist):** `lead`, `property`, `opportunity`.

**Default seeding:** `ensureDefaultDictionaries(workspaceId)` runs on workspace creation and when loading workspace context (idempotent backfill for existing workspaces).

### Settings / Workspace / Users

```txt
GET    /api/workspaces/[workspaceSlug]/settings
PATCH  /api/workspaces/[workspaceSlug]/settings

GET    /api/workspaces/[workspaceSlug]/members
POST   /api/workspaces/[workspaceSlug]/members/invite
PATCH  /api/workspaces/[workspaceSlug]/members/[membershipId]
POST   /api/workspaces/[workspaceSlug]/members/[membershipId]/remove
```

**Phase 4 — `GET /members` implemented** for lead assignment pickers. Returns active workspace members `{ userId, name, email }`. Requires `settings:read`. Invite/remove/management routes remain future phase.

```txt
GET    /api/workspaces/[workspaceSlug]/roles
PATCH  /api/workspaces/[workspaceSlug]/roles/[roleId]

GET    /api/workspaces/[workspaceSlug]/projects
POST   /api/workspaces/[workspaceSlug]/projects
GET    /api/workspaces/[workspaceSlug]/projects/[projectId]
PATCH  /api/workspaces/[workspaceSlug]/projects/[projectId]
DELETE /api/workspaces/[workspaceSlug]/projects/[projectId]  # archive (soft)
```

**Permissions:** `settings:read` for GET; `settings:update` for POST/PATCH/DELETE.

**Project list defaults:** active projects only (`archivedAt: null`). Pass `includeArchived=true` to include archived projects in Settings management UI.

**Project search:** optional `search` query matches name, reference, or city (case-insensitive).

**Project reference uniqueness:** `reference` is unique per workspace across all projects (including archived). Partial unique index applies only when `reference` is set.

**Project status:** `statusId` exists on the model but is unused in V1 UI. Active/archived is determined by `archivedAt` only — no `project_status` dictionary type was added.

**Project archive:** `DELETE` sets `archivedAt`; projects are never hard-deleted. Archived projects are excluded from default lists and future property selectors.

**Server-controlled fields:** `workspaceId`, `createdBy`, `createdAt`, `updatedAt`, `archivedAt` are never accepted from client input.

**Member validation:** optional `ownerId` and `assignedTo` must refer to active workspace members when provided.

**Future property forms:** Property create/edit forms read active projects via `GET /projects` (`settings:read`). Settings management uses `settings:read` / `settings:update`.

**Project selector foundation:** `/components/domain/project-selector.tsx` receives projects via props for property forms — does not fetch data directly.

### Workspace bootstrap (Phase 2 — implemented)

```txt
GET    /api/me
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/[workspaceSlug]/context
```

#### `GET /api/me`

Returns authenticated user context. Unauthenticated → `401` / `UNAUTHENTICATED`.

```json
{
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "name": "User Name",
      "image": "..."
    }
  }
}
```

#### `GET /api/workspaces`

Returns workspaces where the authenticated user has `membership.status = active`.

```json
{
  "data": {
    "workspaces": [
      {
        "id": "...",
        "name": "EvoHome CRM",
        "slug": "evohome-crm",
        "type": "agency",
        "timezone": "UTC",
        "defaultCurrency": "USD"
      }
    ]
  }
}
```

#### `POST /api/workspaces`

Creates a workspace for the authenticated user. Server generates slug, seeds default roles, and creates an active Owner membership for the creator. Does not accept `createdBy`, `workspaceId`, or role assignments from the client.

Request body (Zod-validated):

```json
{
  "name": "EvoHome CRM",
  "type": "agency",
  "timezone": "UTC",
  "defaultCurrency": "USD"
}
```

#### `POST /api/auth/signup` (Phase 2A)

Creates a credentials-based user account. Does not create a workspace.

Request body (Zod-validated):

```json
{
  "name": "QA User",
  "email": "qa@example.com",
  "password": "long-secure-password",
  "confirmPassword": "long-secure-password"
}
```

Success `201`:

```json
{
  "data": {
    "user": {
      "id": "...",
      "email": "qa@example.com",
      "name": "QA User"
    }
  }
}
```

Errors: `VALIDATION_ERROR`, `CONFLICT` (duplicate email or existing Google account), `INTERNAL_ERROR`. Response never includes `passwordHash`.

#### `GET /api/workspaces/[workspaceSlug]/context`

Returns workspace shell context: workspace, membership role + permissions, and permission-filtered V1 navigation.

```json
{
  "data": {
    "workspace": { "id": "...", "name": "...", "slug": "...", "timezone": "UTC", "defaultCurrency": "USD" },
    "membership": {
      "status": "active",
      "role": { "name": "Owner", "key": "owner", "permissions": ["dashboard:read"] }
    },
    "navigation": [
      { "label": "Dashboard", "href": "/w/evohome-crm/dashboard", "permission": "dashboard:read", "segment": "dashboard" }
    ]
  }
}
```

---

## Cron API Pattern

### Campaign scheduler

```txt
POST /api/cron/campaigns/send-due
```

**Protection:** `Authorization: Bearer <CRON_SECRET>` or equivalent header check.

**Behavior:**

- Find enrollments with `nextSendAt <= now` and `status = active`
- Skip if lead has no email
- Skip if lead is unsubscribed
- Send via Resend with unsubscribe link, sender identity, reply-to
- Log `CampaignSend` with `sent`, `failed`, or `skipped`
- Advance enrollment step or mark complete/failed

Must not be callable from the browser without the secret.

---

## Signed Document URL Pattern

Documents never expose raw permanent public URLs.

```txt
POST /api/workspaces/[workspaceSlug]/documents/[documentId]/signed-url
```

**Request:** optional `{ "disposition": "inline" | "attachment" }`

**Response:**

```json
{
  "data": {
    "url": "https://...",
    "expiresAt": "2026-01-01T00:00:00.000Z"
  }
}
```

Signed URL TTL should be short (e.g. 5–15 minutes). Regenerate on demand.

---

## Public Unsubscribe Endpoint

```txt
GET  /api/public/unsubscribe/[token]
POST /api/public/unsubscribe/[token]
```

Token-based; no session required. Updates lead `emailUnsubscribedAt` and relevant campaign enrollments. Exact token format defined in Phase 10.

---

## Request Validation

- All mutation bodies validated with Zod on the server.
- Reject unknown fields if using strict schemas.
- Return `VALIDATION_ERROR` with `details` keyed by field path.

---

## Idempotency (integrations, later)

Inbound webhooks and imports should support idempotency keys. Documented for Phase 12; pattern:

```txt
Idempotency-Key: <uuid>
```

---

## Versioning

V1 has no URL version prefix. Breaking changes require doc updates and coordinated migration. If external API consumers are added later, introduce `/api/v1/...`.
