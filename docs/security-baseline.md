# Security Baseline — V1

Security is foundational. Every phase must uphold these requirements.

---

## Phase 2 Foundation (implemented)

Phase 2 implements real auth, workspace resolution, membership checks, and permission enforcement:

```txt
Auth.js v5 (next-auth@5) with Google provider
JWT session strategy (no OAuth tokens stored on User model)
Middleware protects /w/*, /workspaces/*, and workspace APIs
requireAuth() syncs User record on each authenticated request
resolveWorkspace(slug) — server-side slug lookup
requireMembership() — active membership only
requirePermission() — permission key allowlist enforcement
withWorkspaceScope() — server-resolved workspaceId in queries
```

`auth.config.ts` is Edge-safe (no Mongoose). Full auth callbacks with DB sync live in `/auth.ts` (Node runtime only). Production runtime **requires** `NEXTAUTH_SECRET` — missing secret throws at startup (`resolveAuthSecret()` in `auth.config.ts`). Build-only placeholder is used only during `next build` page collection.

---

## Phase 3 Dictionaries / Tags (implemented)

Dictionary and tag APIs enforce workspace isolation and permissions:

```txt
settings:read  — list dictionaries, dictionary items, tags
settings:update — create/update/inactivate dictionary items; create/update/archive tags
```

System dictionary items:

- Cannot be inactivated via DELETE or PATCH (`isActive: false`)
- Cannot have `behavior` or `defaultProbability` changed via PATCH
- Terminal opportunity behaviors are protected from corruption

Tags use `archivedAt` soft-archive (never hard-deleted in V1). Case-insensitive name uniqueness per workspace via `nameNormalized`.

Default dictionaries seed idempotently on workspace creation and workspace context load (`ensureDefaultDictionaries`).

Status business logic must use dictionary item `behavior`, never `label` text.

---

## Phase 3.5 Projects (implemented)

Project APIs enforce workspace isolation and Settings permissions:

```txt
settings:read  — list/view projects
settings:update — create/update/archive projects
```

Projects use `archivedAt` soft-archive (never hard-deleted in V1). Reference uniqueness is workspace-scoped across all projects including archived.

`workspaceId` and `createdBy` are server-controlled. All project lookups use `{ workspaceId, _id }` — never `findById` without workspace verification.

Projects appear only under Settings (`/w/[workspaceSlug]/settings/projects`). They must not appear in primary navigation.

No `project_status` dictionary type was added. Active/archived state is determined by `archivedAt` only.

Optional `ownerId` and `assignedTo` are validated against active workspace membership when provided.

---

## Phase 4 Leads (implemented)

Lead APIs enforce workspace isolation and lead permissions:

```txt
lead:read    — list/view leads
lead:create  — create leads
lead:update  — edit leads, status/source/tags/assignment/notes
lead:archive — archive leads (DELETE)
```

`workspaceId`, `createdBy`, `fullName`, `emailNormalized`, and `phoneNormalized` are server-controlled. Client body must not set them.

Duplicate active email per workspace returns `409 CONFLICT`. Duplicate phone returns non-blocking `warnings: ["duplicate_phone"]` on create/update.

`statusId` must reference same-workspace active `lead_status` dictionary item (existing inactive status preserved on update). `sourceId` must reference `lead_source`. Tags must belong to workspace and include `lead` in `entityTypes`.

Archive via `DELETE` sets `archivedAt`; never hard-deleted. Archived leads excluded from default list.

Leads appear in primary navigation (`/w/[workspaceSlug]/leads`). No separate Contacts module.

`GET /api/workspaces/[workspaceSlug]/members` (`settings:read`) lists active workspace members for lead assignment pickers in create/edit UI.

Opportunities section on lead detail is implemented in Phase 6. **Phase 7:** Activities tab loads real workspace-scoped activities. Timeline Notes and Files tabs remain placeholders.

---

## Phase 7 Activities / Timeline (implemented)

Activity APIs enforce workspace isolation and activity permissions:

```txt
activity:read    — list/view activities, entity detail timelines
activity:create  — create activities and timeline notes (type Note)
activity:update  — edit activities; complete/cancel/reschedule
activity:archive — archive activities (DELETE)
```

`workspaceId`, `createdBy`, `archivedAt`, `completedAt`, and `cancelledAt` are server-controlled. Client body must not set them.

At least one of `opportunityId`, `leadId`, or `propertyId` is required. When `opportunityId` is set, `leadId`/`propertyId` are derived from the opportunity. Linked entities must be same-workspace and non-archived.

`typeId` must reference same-workspace `activity_type`. `statusId` must reference same-workspace `activity_status`. Complete/cancel behavior uses `DictionaryItem.behavior` only — never label text.

Overdue/upcoming views exclude completed, cancelled, and archived activities. Activities without `dueDate` are excluded from overdue/upcoming views.

Archive via `DELETE` sets `archivedAt`; never hard-deleted. Archived activities excluded from default list.

Activities appear in primary navigation (`/w/[workspaceSlug]/activities`). Tasks are an activity type — not a separate nav module. Calendar is not primary nav.

Entity detail Activities tabs on Lead, Property, and Opportunity load filtered activity lists and support create. Global `/activities` lists/edits/archives but does not expose a create CTA in V1 — helper copy directs users to entity detail pages.

Activity due/next-action datetimes are displayed and edited in `Workspace.timezone` (UTC stored server-side).

---

## Phase 6 Opportunities / Pipeline (implemented)

Opportunity APIs enforce workspace isolation and opportunity permissions:

```txt
opportunity:read    — list/view opportunities, pipeline, entity detail sections
opportunity:create  — create opportunities
opportunity:update  — edit opportunities, stage moves (PATCH …/stage)
opportunity:archive — archive opportunities (DELETE)
```

`workspaceId`, `createdBy`, `archivedAt`, `closedAt`, `wonAt`, and `lostAt` are server-controlled. Client body must not set them.

`leadId` and `propertyId` must reference same-workspace non-archived Lead/Property. `statusId` must reference same-workspace `opportunity_status`. Won/lost behavior uses `DictionaryItem.behavior` only — never label text. `terminal_lost` requires `lostReasonId` (same-workspace `lost_reason`). Moving to `open` clears terminal fields.

`probability` defaults from status `defaultProbability` on create and stage change. `currency` defaults: request → property.currency → workspace.defaultCurrency.

Tags must belong to workspace and include `opportunity` in `entityTypes`.

Archive via `DELETE` sets `archivedAt`; never hard-deleted. Archived opportunities excluded from default list and pipeline.

Pipeline is primary nav (`/w/[workspaceSlug]/pipeline`). Opportunity detail at `/w/[workspaceSlug]/opportunities/[opportunityId]`. **Opportunities is not primary nav.**

`GET /pipeline` returns backend-driven columns from active `opportunity_status` dictionary items. Active pipeline value (`totals.activeValue`) includes only `open` behavior opportunities.

Activities, Files, Documents, and timeline Notes tabs on opportunity detail: **Phase 7** Activities tab is implemented; Files/Documents/Notes remain placeholders.

---

## Phase 5 Properties (implemented)

Property APIs enforce workspace isolation and property permissions:

```txt
property:read    — list/view properties
property:create  — create properties
property:update  — edit properties, status/type/project/tags/assignment
property:archive — archive properties (DELETE)
```

`workspaceId`, `createdBy`, and `archivedAt` are server-controlled. Client body must not set them.

Duplicate `reference` per workspace returns `409 CONFLICT` (includes archived properties).

`statusId` must reference same-workspace active `property_status` dictionary item (existing inactive status preserved on update). `typeId` must reference `property_type`. `projectId` must reference same-workspace non-archived Project. Tags must belong to workspace and include `property` in `entityTypes`.

`currency` defaults from `workspace.defaultCurrency` when omitted on create. `price` stored as number.

Archive via `DELETE` sets `archivedAt`; never hard-deleted. Archived properties excluded from default list.

Properties appear in primary navigation (`/w/[workspaceSlug]/properties`). Projects remain Settings-managed only — not primary nav.

Media/gallery on property detail is placeholder only — no file upload or image URL storage in Phase 5.

Opportunities section on property detail is implemented in Phase 6. **Phase 7:** Activities tab implemented. Files and Notes tabs remain placeholders.

---

## Authentication

- Use **Auth.js / NextAuth v5** with **Google provider** for V1.
- **Phase 2A:** Credentials provider for email/password (QA/staging). Passwords hashed with **bcryptjs** (12 rounds). `passwordHash` never exposed via API/repositories. Login errors do not reveal whether email exists.
- Session must be validated on every protected API route.
- Unauthenticated requests return `401` / `UNAUTHENTICATED`.
- No anonymous access to workspace data.

### Session contents

Session should expose enough for UI permission rendering but not secrets:

```txt
userId
email
name
image
current workspace context (resolved per request from slug)
```

---

## Authorization

- **Server-side permission checks are mandatory** on every mutation and sensitive read.
- Frontend permission UI is not security.
- Membership must be `active` to access workspace APIs.
- Return `PERMISSION_DENIED` or `MEMBERSHIP_REQUIRED` — never silent empty data as authorization.

---

## Workspace Isolation

- Resolve `workspaceSlug → workspaceId` on the server.
- **Never trust `workspaceId` from client body.**
- Every query and mutation includes server-resolved `workspaceId`.
- Cross-workspace ID enumeration must return `404` or `FORBIDDEN`, not data from another tenant.

See `/docs/data-access-patterns.md`.

---

## Input Validation

- **Zod** for all API request validation on the server.
- Frontend validation is UX only — not security.
- Reject unknown fields on strict schemas where appropriate.
- Sanitize and validate file metadata on upload.

---

## Secrets Management

- **No secrets in the repository.**
- Use environment variables (see `/docs/env.example.md`).
- `.env` files gitignored.
- Rotate `NEXTAUTH_SECRET`, `CRON_SECRET`, and API keys on compromise.

---

## File Security

Documents must **not** use permanent public URLs as canonical access.

### Store only

```txt
bucket
storageKey
mimeType
fileSize
fileName
```

### Signed URL generation

On demand, after:

```txt
auth check
workspace check
permission check (document:read)
linked entity check
```

### Upload validation

| Check | Rule |
|-------|------|
| MIME type | Allowlist per use case (pdf, images, common office) |
| File size | Max size enforced server-side (e.g. 25MB) |
| Filename | Sanitize; strip path traversal |
| Linked entity | Must exist in same workspace |
| Permission | `document:create` before upload URL issued |

### Prohibited

- Raw storage credentials in client
- Public-read bucket policy for CRM documents
- Permanent unauthenticated download links

---

## Campaign Compliance

Campaign emails must support:

| Requirement | Detail |
|-------------|--------|
| Unsubscribe link | Tokenized public endpoint |
| Sender identity | `EMAIL_FROM` with workspace-appropriate name |
| Reply-to | `EMAIL_REPLY_TO` |
| Skip if no email | Do not send; log as `skipped` |
| Skip if unsubscribed | Check `emailUnsubscribedAt` / consent |
| Send log | `CampaignSend` with `sent` status |
| Failure log | `CampaignSend` with `failed` + error |

### Sending rules

- Send only through protected backend cron: `POST /api/cron/campaigns/send-due`
- Protected by `CRON_SECRET`
- Never send from frontend or page views

---

## Cron Security

```txt
POST /api/cron/campaigns/send-due
Authorization: Bearer <CRON_SECRET>
```

- Reject requests without valid secret
- Do not expose cron endpoints in client bundles
- Rate-limit at infrastructure level if exposed publicly

---

## Integration Security (Phase 12+)

- Do not store raw credentials in plaintext.
- Use `credentialsEncrypted` (encrypted at rest) and `apiKeyHash` (for webhook validation).
- Do not log full sensitive payloads — use `payloadSummary` in `IntegrationLog`.
- Validate webhooks via signature or API key.
- Use idempotency keys for imports to prevent duplicate processing.

---

## HTTP Security Headers (Phase 0+)

Configure in Next.js:

```txt
Content-Security-Policy (reasonable default)
X-Frame-Options / frame-ancestors
X-Content-Type-Options: nosniff
Referrer-Policy
```

Exact CSP tuned when third-party scripts are known.

---

## Rate Limiting

Apply rate limiting to:

- Auth endpoints
- Public unsubscribe endpoint
- Cron endpoint (infrastructure + secret)
- File upload URL generation

Implementation detail for Phase 0/2.

---

## Audit Logging

Write `AuditLog` for sensitive actions:

```txt
member.invited
member.removed
member.role_changed
ownership.transferred
role.permissions_updated
integration.credentials_updated
document.downloaded (optional, if compliance requires)
```

Audit logs are workspace-scoped and append-only.

---

## Destructive Actions

V1 default is **archive**, not hard delete. **`DELETE` on a resource means archive** — sets `archivedAt` (and `status` where applicable). See `/docs/api-contracts.md`.

| Action | Safeguard |
|--------|-----------|
| Archive record (`DELETE`) | Requires `*:archive` permission; returns `200` + `{ data }`, never `204` |
| Remove member | Cannot remove last owner; requires `users:manage` |
| Owner transfer | Explicit action only |
| Campaign pause | Stops future sends |

Hard delete, if ever added, requires explicit approval and audit.

---

## Error Handling

- Do not leak stack traces to clients in production.
- `INTERNAL_ERROR` returns generic message; log details server-side.
- `404` for cross-workspace ID access — do not confirm existence in other workspaces.

---

## Dependency Security

- Keep dependencies updated
- Run `npm audit` in CI
- No known critical vulnerabilities at beta release (Phase 13)

---

## Security Review Checklist (per phase)

```txt
[ ] All routes authenticate
[ ] All workspace routes resolve slug server-side
[ ] All mutations check permissions
[ ] All queries include workspaceId
[ ] Zod validates all inputs
[ ] No secrets in code
[ ] Documents use signed URLs
[ ] Campaign cron protected
[ ] Unsubscribe path exists (when campaigns implemented)
```
