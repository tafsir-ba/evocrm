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

### Archive / soft-delete

`200 OK` with the updated resource (or minimal archive confirmation):

```json
{
  "data": {
    "id": "…",
    "archivedAt": "2026-06-12T12:00:00.000Z"
  }
}
```

Use this shape for all `POST …/archive` endpoints. Do not use `204` for archives — keep responses consistent with the `{ "data": … }` contract.

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

```txt
GET    /api/workspaces/[workspaceSlug]/leads
POST   /api/workspaces/[workspaceSlug]/leads
GET    /api/workspaces/[workspaceSlug]/leads/[leadId]
PATCH  /api/workspaces/[workspaceSlug]/leads/[leadId]
POST   /api/workspaces/[workspaceSlug]/leads/[leadId]/archive
```

### Properties

```txt
GET    /api/workspaces/[workspaceSlug]/properties
POST   /api/workspaces/[workspaceSlug]/properties
GET    /api/workspaces/[workspaceSlug]/properties/[propertyId]
PATCH  /api/workspaces/[workspaceSlug]/properties/[propertyId]
POST   /api/workspaces/[workspaceSlug]/properties/[propertyId]/archive
```

### Opportunities

```txt
GET    /api/workspaces/[workspaceSlug]/opportunities
POST   /api/workspaces/[workspaceSlug]/opportunities
GET    /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]
PATCH  /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]
POST   /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]/archive
PATCH  /api/workspaces/[workspaceSlug]/opportunities/[opportunityId]/status
```

### Activities

```txt
GET    /api/workspaces/[workspaceSlug]/activities
POST   /api/workspaces/[workspaceSlug]/activities
GET    /api/workspaces/[workspaceSlug]/activities/[activityId]
PATCH  /api/workspaces/[workspaceSlug]/activities/[activityId]
POST   /api/workspaces/[workspaceSlug]/activities/[activityId]/archive
```

### Documents

```txt
GET    /api/workspaces/[workspaceSlug]/documents
POST   /api/workspaces/[workspaceSlug]/documents/upload-url
POST   /api/workspaces/[workspaceSlug]/documents
GET    /api/workspaces/[workspaceSlug]/documents/[documentId]
POST   /api/workspaces/[workspaceSlug]/documents/[documentId]/signed-url
POST   /api/workspaces/[workspaceSlug]/documents/[documentId]/archive
```

Upload flow: request presigned upload URL → client uploads to Spaces → confirm/create Document record.

Download flow: request signed download URL after permission check.

### Campaigns (Dripping)

```txt
GET    /api/workspaces/[workspaceSlug]/campaigns
POST   /api/workspaces/[workspaceSlug]/campaigns
GET    /api/workspaces/[workspaceSlug]/campaigns/[campaignId]
PATCH  /api/workspaces/[workspaceSlug]/campaigns/[campaignId]
POST   /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/archive
GET    /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps
POST   /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps
PATCH  /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/steps/[stepId]
POST   /api/workspaces/[workspaceSlug]/campaigns/[campaignId]/enroll
```

### Dashboard

```txt
GET    /api/workspaces/[workspaceSlug]/dashboard/summary
```

### Dictionaries / Tags

```txt
GET    /api/workspaces/[workspaceSlug]/dictionaries
GET    /api/workspaces/[workspaceSlug]/dictionaries/[type]/items
PATCH  /api/workspaces/[workspaceSlug]/dictionaries/[type]/items/[itemId]

GET    /api/workspaces/[workspaceSlug]/tags
POST   /api/workspaces/[workspaceSlug]/tags
PATCH  /api/workspaces/[workspaceSlug]/tags/[tagId]
```

### Settings / Workspace / Users

```txt
GET    /api/workspaces/[workspaceSlug]/settings
PATCH  /api/workspaces/[workspaceSlug]/settings

GET    /api/workspaces/[workspaceSlug]/members
POST   /api/workspaces/[workspaceSlug]/members/invite
PATCH  /api/workspaces/[workspaceSlug]/members/[membershipId]
POST   /api/workspaces/[workspaceSlug]/members/[membershipId]/remove

GET    /api/workspaces/[workspaceSlug]/roles
PATCH  /api/workspaces/[workspaceSlug]/roles/[roleId]

GET    /api/workspaces/[workspaceSlug]/projects
POST   /api/workspaces/[workspaceSlug]/projects
PATCH  /api/workspaces/[workspaceSlug]/projects/[projectId]
POST   /api/workspaces/[workspaceSlug]/projects/[projectId]/archive
```

### Workspace bootstrap (non-slug or pre-slug)

```txt
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/by-slug/[workspaceSlug]
```

Exact bootstrap routes finalized in Phase 2.

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
