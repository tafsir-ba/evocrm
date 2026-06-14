# Domain Model — V1

This document defines the allowed V1 entities, ownership rules, relationships, and status behavior contracts.

---

## Company / Project Decision

```txt
Workspace = the company/account/client environment
Project = optional real estate development/grouping
Company = not a separate V1 model
```

Approved structure:

```txt
Workspace
  ├─ Projects
  └─ Properties
```

A property may optionally belong to a project.

Do **not** use:

```txt
Workspace → Company → Project → Properties
```

---

## Allowed V1 Entities

```txt
User
Workspace
Membership
Role
Dictionary
DictionaryItem
Tag
Project
Lead
Property
Opportunity
Activity
Document
Campaign
CampaignStep
CampaignEnrollment
CampaignSend
AuditLog
Integration
IntegrationLog
```

### Optional / Delayed Entities

```txt
Subscription
BillingPlan
Company
Contact
Report
ClientPortal
Commission
Contract
```

Do not create delayed entities unless explicitly approved in a future phase.

---

## Universal Ownership Fields

Every workspace-owned entity should include:

```txt
workspaceId
createdBy
ownerId?          // business owner / accountable record owner
assignedTo?       // operational assignee; can change
createdAt
updatedAt
archivedAt?       // V1 user-facing removal mechanism
```

### Rules

| Field | Rule |
|-------|------|
| `workspaceId` | Always server-controlled; never trusted from client body |
| `createdBy` | Immutable after creation |
| `uploadedBy` | Immutable on Document (same rule as createdBy) |
| `assignedTo` | Can change over time |
| `ownerId` | Business owner / accountable record owner |
| `archivedAt` | V1 soft-delete; hard delete is not default V1 behavior |

Archived records should not appear in active lists by default. Active records use `archivedAt: null` (not a missing field).

---

## Entity Summaries

### User

Global identity. Not workspace-owned.

**Phase 2:** Mongoose model at `/models/user.ts`. Email normalized (lowercase, unique). OAuth secrets are not stored on the User model.

**Phase 2A:** `authProvider` supports `google` | `credentials`. Credentials users store `passwordHash` (bcrypt, `select: false` — never returned from repositories/API). Optional `emailVerifiedAt`. Duplicate email across providers returns `CONFLICT` (no silent merge).

| Field | Description |
|-------|-------------|
| `email` | Primary login identifier |
| `name` | Display name |
| `image` | Avatar URL |
| `authProvider` | e.g. `google` |
| `createdAt` | |
| `updatedAt` | |

---

### Workspace

Top-level tenant boundary.

**Phase 2:** Mongoose model at `/models/workspace.ts`. `slug` unique and URL-safe; `createdBy` immutable.

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `slug` | URL-safe unique identifier |
| `type` | Workspace classification |
| `timezone` | Default timezone for dates |
| `defaultCurrency` | Default currency code |
| `createdBy` | User who created the workspace |
| `createdAt` | |
| `updatedAt` | |

---

### Membership

Links a User to a Workspace with a Role.

**Phase 2:** Mongoose model at `/models/membership.ts`. Unique index on `userId + workspaceId`.

| Field | Description |
|-------|-------------|
| `userId` | Reference to User |
| `workspaceId` | Reference to Workspace |
| `roleId` | Reference to Role |
| `status` | `active`, `invited`, `suspended`, `removed` |
| `invitedBy` | Optional; who sent the invite |
| `joinedAt` | When membership became active |
| `createdAt` | |
| `updatedAt` | |

**Rule:** `invited`, `suspended`, and `removed` memberships cannot access workspace data.

---

### Role

Workspace-scoped role with permission keys.

**Phase 2:** Mongoose model at `/models/role.ts`. Unique index on `workspaceId + key`. System roles (`isSystem: true`) cannot be deleted.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `name` | Display name (e.g. Owner, Admin) |
| `key` | Stable machine key |
| `permissions[]` | Permission key strings |
| `isSystem` | System roles cannot be deleted |
| `createdAt` | |
| `updatedAt` | |

Default roles: Owner, Admin, Agent, Viewer. See `/docs/roles-permissions.md`.

---

### Dictionary

Workspace-scoped dictionary container (e.g. lead statuses, opportunity stages).

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `type` | Dictionary type key |
| `name` | Display name |
| `isSystem` | System dictionaries seeded on workspace creation |
| `createdAt` | |
| `updatedAt` | |

---

### DictionaryItem

Individual option within a dictionary.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `dictionaryId` | Parent dictionary |
| `type` | Item type (mirrors dictionary type) |
| `label` | User-facing label (display only) |
| `key` | Stable machine key |
| `color` | UI color token |
| `order` | Sort order |
| `isDefault` | Default selection for new records |
| `isActive` | Visible in pickers |
| `isSystem` | System items protected from deletion |
| `behavior` | Machine behavior — see Status Behavior Contract |
| `defaultProbability` | Optional; for opportunity stages |
| `createdAt` | |
| `updatedAt` | |

**Critical:** Business logic must use `behavior` and `key`, never `label`.

**Uniqueness (Phase 3):**

- `key` is unique per workspace + dictionary type (stable machine identifier).
- Active `label` is also unique per workspace + dictionary type (case-insensitive). Duplicate active labels are rejected with `CONFLICT`.
- Inactive items may retain historical labels; reactivation must not collide with another active label.

---

### Tag

Workspace-scoped labels attachable to entities.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `name` | Tag label |
| `color` | UI color |
| `entityTypes[]` | `lead`, `property`, `opportunity` |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | V1 soft-archive; same convention as other workspace entities |

**Archive behavior:**

- Archived tags are excluded from selectors and tag-management lists by default (`archivedAt: null`).
- Records that already reference an archived tag may continue to render that tag label on read — historical references are preserved.
- Tags are never hard-deleted in V1.

---

### Project

Optional real estate development or property grouping.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `name` | |
| `reference` | Optional external reference |
| `statusId` | Optional dictionary item |
| `address` | |
| `city` | |
| `country` | |
| `description` | |
| `createdBy` | |
| `ownerId` | |
| `assignedTo` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

Managed primarily through Settings in V1. **Not** a primary navigation module.

**Phase 3.5:** Mongoose model at `/models/project.ts`.

| Rule | Detail |
|------|--------|
| Navigation | Settings → Projects only; never primary nav |
| Status | Active when `archivedAt` is null; archived when set. `statusId` optional and unused in V1 UI (no `project_status` dictionary) |
| Archive | `DELETE` sets `archivedAt`; never hard-deleted |
| Reference | Unique per workspace when provided (includes archived projects) |
| `createdBy` | Set server-side from authenticated user; immutable |
| `ownerId` / `assignedTo` | Optional; must be active workspace members when provided |

---

### Lead

Demand-side record (buyer/inquirer).

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `statusId` | Dictionary item |
| `sourceId` | Optional lead source dictionary item |
| `ownerId` | |
| `assignedTo` | |
| `firstName` | |
| `lastName` | |
| `fullName` | Denormalized for search/display |
| `email` | |
| `emailNormalized` | Lowercased/trimmed for dedup/search |
| `phone` | |
| `phoneNormalized` | Normalized for search |
| `language` | |
| `preferredContactMethod` | |
| `budgetMin` | |
| `budgetMax` | |
| `preferredAreas[]` | |
| `notes` | |
| `tags[]` | Tag IDs |
| `attributes` | Flexible key-value bag |
| `emailConsentStatus` | Campaign compliance |
| `emailUnsubscribedAt` | |
| `emailUnsubscribeReason` | |
| `lastContactedAt` | |
| `createdBy` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

**V1 note:** Contacts are represented as Leads. There is no separate Contact entity.

**Phase 4:** Mongoose model at `/models/lead.ts`. `fullName` derived server-side from `firstName` + `lastName`. `emailNormalized` unique per workspace for non-archived leads with email (partial unique index + service check). `phoneNormalized` stored for search; duplicate phone warns but does not block. `statusId` validated as same-workspace `lead_status` dictionary item; `sourceId` as `lead_source`. `tags[]` validated as same-workspace tags with `entityTypes` including `lead`. Archive via `DELETE` sets `archivedAt`. `Lead.notes` is a static internal field — not the future Activity type Note timeline. Assignment UI uses `GET /api/workspaces/[workspaceSlug]/members` (`settings:read`) for active member picker; create/edit send `assignedTo` validated server-side.

---

### Property

Supply-side record (listing/unit).

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `projectId` | Optional; must be same workspace |
| `statusId` | Dictionary item |
| `typeId` | Optional property type dictionary item |
| `ownerId` | |
| `assignedTo` | |
| `title` | |
| `reference` | Optional external reference |
| `price` | |
| `currency` | |
| `address` | |
| `city` | |
| `country` | |
| `rooms` | |
| `bedrooms` | |
| `bathrooms` | |
| `surface` | |
| `floor` | |
| `description` | |
| `features[]` | |
| `tags[]` | |
| `attributes` | Flexible key-value bag |
| `createdBy` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

**Phase 5:** Mongoose model at `/models/property.ts`. `reference` unique per workspace when set (partial unique index includes archived properties). `statusId` validated as same-workspace `property_status` dictionary item; `typeId` as `property_type`. `projectId` validated as same-workspace non-archived Project. `tags[]` validated as same-workspace tags with `entityTypes` including `property`. `currency` defaults from `workspace.defaultCurrency` when omitted on create. `price` stored as number; formatted for display only in UI. `floor` is `number` in V1. Archive via `DELETE` sets `archivedAt`. Media/gallery is placeholder only — no image URLs stored. Opportunities/Activities/Files/Notes tabs on property detail are placeholders only in Phase 5.

---

### Opportunity

Connects a Lead to a Property through the sales pipeline.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `leadId` | Must be same workspace |
| `propertyId` | Must be same workspace |
| `statusId` | Pipeline stage dictionary item |
| `ownerId` | |
| `assignedTo` | |
| `value` | Deal value |
| `currency` | |
| `probability` | Override or derived from stage |
| `expectedCloseDate` | |
| `lostReasonId` | Dictionary item when lost |
| `lostReasonText` | Free text supplement |
| `closedAt` | |
| `wonAt` | Set when status behavior is `terminal_won` |
| `lostAt` | Set when status behavior is `terminal_lost` |
| `notes` | |
| `tags[]` | |
| `createdBy` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

Shown in Pipeline nav and entity detail pages. No separate Opportunities primary nav in V1.

**Phase 6:** Mongoose model at `/models/opportunity.ts`. `leadId` and `propertyId` validated as same-workspace non-archived Lead/Property. `statusId` validated as same-workspace `opportunity_status`; won/lost behavior uses `DictionaryItem.behavior` (`open`, `terminal_won`, `terminal_lost`), never label text. `terminal_won` sets `wonAt`/`closedAt`, clears lost fields, sets `probability` to status default (100). `terminal_lost` requires `lostReasonId` (same-workspace `lost_reason`), sets `lostAt`/`closedAt`, clears won fields, sets `probability` to 0. Moving back to `open` clears terminal fields. `probability` defaults from status `defaultProbability` on create and stage change. `currency` defaults: request → property.currency → workspace.defaultCurrency. `tags[]` validated as same-workspace tags with `entityTypes` including `opportunity`. Archive via `DELETE` sets `archivedAt`. Pipeline columns and totals are backend-calculated (`GET /pipeline`); active pipeline value includes only `open` behavior opportunities.

---

### Activity

Follow-up action (call, visit, task, email, etc.).

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `opportunityId` | Optional link |
| `leadId` | Optional link |
| `propertyId` | Optional link |
| `typeId` | Activity type dictionary item |
| `statusId` | Activity status dictionary item |
| `ownerId` | |
| `assignedTo` | |
| `title` | |
| `description` | |
| `dueDate` | |
| `completedAt` | Set when status behavior is `completed` |
| `cancelledAt` | Set when status behavior is `cancelled` |
| `outcome` | |
| `nextActionDate` | |
| `createdBy` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

At least one of `opportunityId`, `leadId`, or `propertyId` should be set. All links must be workspace-consistent.

**Phase 7:** Mongoose model at `/models/activity.ts`. When `opportunityId` is provided, `leadId` and `propertyId` are derived from the opportunity. `typeId`/`statusId` validated against same-workspace dictionary items. Status behavior drives `completedAt`/`cancelledAt`. Archive via `DELETE` sets `archivedAt`. `assignedTo` defaults to current user on create when omitted. Activity UI formats and interprets due/next-action datetime inputs using `Workspace.timezone` (display via `Intl.DateTimeFormat` with `timeZone`; form inputs round-trip in workspace timezone before saving UTC ISO). Overdue/upcoming list filters use server UTC instants against pending statuses. Activity type `Note` is the timeline note mechanism — no separate Notes module.

---

### Document

File attached to a workspace entity.

**Phase 8:** Mongoose model at `/models/document.ts`. Presigned direct-to-Spaces upload (not backend multipart proxy). `uploadedBy` is server-controlled and immutable. `bucket` and `storageKey` are server-controlled — no permanent public URLs stored. Access via short-lived signed URLs (10-minute TTL) after auth + `document:read` + linked-entity read permission.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `linkedEntityType` | `lead`, `property`, `opportunity`, `campaign` |
| `linkedEntityId` | |
| `ownerId` | Optional accountable owner |
| `uploadedBy` | Immutable |
| `fileName` | Sanitized on upload |
| `mimeType` | Allowlist enforced |
| `fileSize` | Max 25 MB |
| `bucket` | Storage bucket |
| `storageKey` | Object key — no permanent public URL |
| `visibility` | `private`, `workspace` — both require authenticated workspace access in V1 |
| `status` | `active`, `archived`, `failed` |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

**Linked entities (Phase 8–10):** `lead`, `property`, `opportunity`, and `campaign` fully supported for document upload when entity exists in workspace and is not archived.

**Storage key pattern:** `workspaces/{workspaceId}/{linkedEntityType}/{linkedEntityId}/{uuid}/{sanitizedFileName}`

**Archive:** `DELETE` sets `status=archived` and `archivedAt`; DB record retained; storage object not deleted in V1.

Documents are embedded under Lead/Property/Opportunity detail Files tabs — **not** primary navigation.

---

## Dashboard Metrics (Phase 9)

Dashboard is read-only aggregation over existing entities — no new persisted model. Metrics are computed server-side per request (with MongoDB `countDocuments` / `aggregate`).

| Metric | Source entities | Behavior |
|--------|-----------------|----------|
| New leads | Lead | `createdAt` in date range; archived excluded |
| Active opportunities | Opportunity + `opportunity_status` | `behavior = open`; not date-bounded |
| Won / lost opportunities | Opportunity + `opportunity_status` | `terminal_won` / `terminal_lost` + close timestamps in date range |
| Active pipeline / won value | Opportunity | Sum `value` grouped by `currency`; open or won only |
| Activities due today / overdue | Activity + `activity_status` | Pending behavior; due today uses `Workspace.timezone` |
| Leads by source | Lead + `lead_source` | Date-bounded grouping |
| Properties by status | Property + `property_status` | Current inventory snapshot |
| Opportunities by stage | Opportunity + `opportunity_status` | Dictionary order; all non-archived |

Reports and Analytics remain non-V1 primary modules.

---

### Campaign

Drip email campaign.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `name` | |
| `status` | `draft`, `active`, `paused`, `archived` |
| `audienceType` | `leads`, `opportunities` |
| `frequency` | Optional send frequency cap |
| `createdBy` | |
| `ownerId` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | |

---

### CampaignStep

Single step in a campaign sequence.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `campaignId` | |
| `order` | Step sequence |
| `delayDays` | Days after previous step or enrollment |
| `channel` | `email` for V1 |
| `subject` | |
| `body` | |
| `documentIds[]` | Attachments; must be same workspace |
| `createdAt` | |
| `updatedAt` | |

---

### CampaignEnrollment

Lead or opportunity enrolled in a campaign.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `campaignId` | |
| `leadId` | Optional |
| `opportunityId` | Optional |
| `status` | `active`, `paused`, `completed`, `unsubscribed`, `failed` |
| `currentStep` | |
| `nextSendAt` | |
| `lastSentAt` | |
| `completedAt` | |
| `unsubscribedAt` | |
| `failedAt` | |
| `failureReason` | |
| `createdAt` | |
| `updatedAt` | |

---

### CampaignSend

Individual send attempt log.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `campaignId` | |
| `campaignStepId` | |
| `enrollmentId` | |
| `leadId` | Optional |
| `opportunityId` | Optional |
| `status` | `queued`, `sent`, `failed`, `skipped` |
| `providerMessageId` | Resend message ID |
| `error` | Failure detail |
| `scheduledFor` | |
| `sentAt` | |
| `createdAt` | |

---

### AuditLog

Immutable audit trail for sensitive actions.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `actorId` | User who performed the action |
| `action` | Action key |
| `entityType` | |
| `entityId` | |
| `before` | Optional snapshot |
| `after` | Optional snapshot |
| `createdAt` | |

---

### Integration

External system connection (settings/internal in V1).

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `type` | `mls`, `website`, `google_ads`, `meta_ads` |
| `name` | |
| `status` | |
| `credentialsEncrypted` | Encrypted credential blob |
| `apiKeyHash` | Hashed API key for webhook validation |
| `createdBy` | |
| `createdAt` | |
| `updatedAt` | |
| `archivedAt` | Set when archived (soft delete) |

---

### IntegrationLog

Inbound/outbound integration event log.

| Field | Description |
|-------|-------------|
| `workspaceId` | |
| `integrationId` | |
| `direction` | `inbound`, `outbound` |
| `status` | `success`, `failed` |
| `eventType` | |
| `payloadSummary` | Non-sensitive summary only |
| `error` | |
| `createdAt` | |

---

## Status Behavior Contract

**Statuses must never rely on label text for business logic.**

### Opportunity Status Behavior

Dictionary items for opportunity stages use `behavior`:

| Behavior | Meaning |
|----------|---------|
| `open` | Active pipeline stage |
| `terminal_won` | Deal won — sets `wonAt`, `closedAt` |
| `terminal_lost` | Deal lost — sets `lostAt`, `closedAt` |

Example default stages (labels are display-only):

```txt
New          → open
Qualified    → open
Visit        → open
Offer        → open
Negotiation  → open
Won          → terminal_won
Lost         → terminal_lost
```

**Forbidden:**

```ts
if (label === "Won")
if (label === "Lost")
```

**Required:**

```ts
if (statusItem.behavior === "terminal_won")
if (statusItem.behavior === "terminal_lost")
```

### Activity Status Behavior

| Behavior | Meaning |
|----------|---------|
| `pending` | Not yet completed |
| `completed` | Done — sets `completedAt` |
| `cancelled` | Cancelled — sets `cancelledAt` |

**Forbidden:**

```ts
if (label === "Completed")
```

---

## Cross-Workspace Relationship Rules

All foreign keys must resolve within the same workspace:

| Relationship | Rule |
|--------------|------|
| `Property.projectId` | Project must exist in same workspace |
| `Opportunity.leadId` | Lead must exist in same workspace |
| `Opportunity.propertyId` | Property must exist in same workspace |
| `Activity` links | All linked entities must be same workspace |
| `Document.linkedEntityId` | Linked entity must exist in same workspace |
| `CampaignStep.documentIds` | Documents must be same workspace |
| `CampaignEnrollment` | Lead/opportunity must be same workspace |

---

## Entity Relationship Overview

```txt
User
  └─ Membership ── Role (workspace-scoped)

Workspace
  ├─ Project
  ├─ Property ── (optional Project)
  ├─ Lead
  ├─ Opportunity ── Lead + Property
  ├─ Activity ── (optional Lead / Property / Opportunity)
  ├─ Document ── linked entity
  ├─ Campaign
  │    ├─ CampaignStep
  │    ├─ CampaignEnrollment
  │    └─ CampaignSend
  ├─ Dictionary
  │    └─ DictionaryItem
  ├─ Tag
  ├─ Integration
  │    └─ IntegrationLog
  └─ AuditLog
```
