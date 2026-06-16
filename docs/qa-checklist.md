# QA Checklist — Standing Review

Used by Codex (and humans) to review each phase before merge to `dev`.

---

## Alignment Ratings

| Rating | Meaning |
|--------|---------|
| **Fully aligned** | Meets brief, architecture, security, and docs requirements with no material gaps |
| **Partially aligned** | Works but has non-blocking gaps, minor doc drift, or missing non-critical tests |
| **Missing / deviating** | Blocking issues — phase must not merge until resolved |

A phase with any **Missing / deviating** item in a critical section cannot merge to `dev`.

---

## 1. Brief Compliance

- [ ] Implementation matches the approved phase scope only
- [ ] No unplanned primary navigation modules added
- [ ] No unplanned V1 entities created
- [ ] No delayed features implemented early
- [ ] Emergent designs reflected accurately (screens/states in scope)

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 2. Architecture

- [ ] REST route handlers used for core mutations (not random server actions)
- [ ] Thin routes → services → repositories separation
- [ ] No business logic in React components
- [ ] TypeScript strict mode unchanged
- [ ] Stack matches `/docs/architecture-decisions.md`

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 3. Workspace Isolation

- [ ] `workspaceSlug` resolved server-side to `workspaceId`
- [ ] Client `workspaceId` never trusted from body
- [ ] All queries include server-resolved `workspaceId`
- [ ] No `findById` without workspace scope
- [ ] Cross-workspace ID access returns 404/403, not foreign data
- [ ] Foreign keys validated within same workspace

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 4. Permissions

- [ ] Server-side permission checks on all mutations
- [ ] Server-side checks on sensitive reads
- [ ] Only `active` memberships access workspace data
- [ ] Frontend hiding is not the only authorization layer
- [ ] Owner protection rules respected (Phase 2+)
- [ ] Permission keys match `/docs/roles-permissions.md`

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 5. Backend Validation

- [ ] Zod validation on all API inputs
- [ ] Stable error response shape with correct codes
- [ ] Immutable fields cannot be mutated (`createdBy`, `workspaceId`, etc.)
- [ ] Archive used instead of hard delete by default

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 6. Data Integrity

- [ ] Status transitions use `behavior`, not label text
- [ ] Opportunity won/lost sets `wonAt`/`lostAt`/`closedAt` correctly
- [ ] Activity complete/cancel sets timestamps correctly
- [ ] Relationship integrity enforced (lead + property same workspace)
- [ ] Normalized fields updated on write (email, phone, fullName)
- [ ] Models match `/docs/domain-model.md`

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 7. Frontend / Backend Boundary

- [ ] No hardcoded statuses, colors, pipeline columns, role names
- [ ] Dictionaries and permissions drive UI state
- [ ] Generic UI components contain no business rules
- [ ] API contracts match `/docs/api-contracts.md`

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 8. UI States

- [ ] Loading states present
- [ ] Empty states present
- [ ] Error states present
- [ ] Permission denied states where applicable
- [ ] Archived records hidden from default lists

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 9. Tests

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] Workspace isolation tests where applicable
- [ ] Permission denial tests where applicable
- [ ] Validation failure tests where applicable
- [ ] Critical logic has unit tests

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 10. Regression Risk

- [ ] No changes outside phase scope that could break prior phases
- [ ] Existing tests still pass
- [ ] API response shapes remain stable
- [ ] Database migrations/index changes documented

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 11. Security Risk

- [ ] No auth bypass
- [ ] No workspace data leak vectors identified
- [ ] No secrets committed
- [ ] Document access requires auth + permission (Phase 8+)
- [x] Campaign cron protected by `CRON_SECRET` (Phase 10)
- [x] Unsubscribe behavior works (Phase 10 — `GET /unsubscribe?token=...`)
- [x] Campaign enrollment UI uses searchable lead/opportunity selectors (Phase 10 — not raw ObjectId text input)
- [x] Zero-delay steps with a configured send time respect exact wall-clock `nextSendAt` (Phase 10)
- [x] Activation, enrollment, and resume only trigger immediate send passes for due enrollments (Phase 10)
- [x] Consecutive zero-delay steps only chain when the next step is also due (Phase 10)
- [x] Delayed steps respect `nextSendAt` and do not send early on activation (Phase 10)
- [x] Enrollment schedule projection lists all drip steps with paused/sent/pending states (Phase 10)
- [ ] Production schedules `POST /api/cron/campaigns/send-due` with `CRON_SECRET` (Phase 10 ops)
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` configured for outbound campaign email (Phase 10 ops)
- [ ] File upload restrictions enforced (Phase 8+)

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## 12. Performance / Index Risk

- [ ] List endpoints paginated
- [ ] Filters backend-supported (no load-all-then-filter)
- [ ] Recommended indexes considered for new query patterns
- [ ] Dashboard aggregations workspace-scoped and efficient

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Codex Rejection Conditions

Codex **must reject** the phase if any of the following are true:

```txt
workspace data can leak
permissions are frontend-only
business logic is hardcoded in UI
status behavior depends on label text
models or APIs contradict docs
unplanned entities were added
required tests/checks are missing
destructive actions are unsafe
current phase scope was exceeded
data-access queries are not workspace-scoped
document access bypasses authorization
campaign unsubscribe behavior is missing
```

---

## Phase Review Sign-Off Template

```txt
Phase: ___
Reviewer: Codex
Date: ___

Brief compliance:         [ ]
Architecture:             [ ]
Workspace isolation:      [ ]
Permissions:              [ ]
Backend validation:       [ ]
Data integrity:           [ ]
Frontend/backend boundary:[ ]
UI states:                [ ]
Tests:                    [ ]
Regression risk:          [ ]
Security risk:            [ ]
Performance/index risk:   [ ]

Overall: Fully aligned | Partially aligned | Missing / deviating
Blocking issues:
-
-

Merge to dev: APPROVED | REJECTED
```

---

## Phase 0 Foundation Checklist

Phase 0 has no product routes or domain models. Verify foundation only:

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Strict TypeScript enabled (`strict`, `noImplicitAny`, `strictNullChecks`)
- [ ] Env validation in `/server/env.ts` requires only `NODE_ENV`, `MONGODB_URI`, `NEXT_PUBLIC_APP_URL`
- [ ] MongoDB connection helper caches dev connections (`/server/db/mongoose.ts`)
- [ ] API helpers match `/docs/api-contracts.md` (`successResponse`, `paginatedResponse`, `errorResponse`)
- [ ] `AppError` + `handleRouteError` mask `expose: false` internal messages
- [ ] `withWorkspaceScope()` tested; server-resolved `workspaceId` only
- [x] Phase 2: Auth/workspace/permission enforcement implemented (stubs replaced)
- [x] Phase 2A: Email/password auth (bcrypt, Credentials provider, `/signup`, `POST /api/auth/signup`) — no bypass, Google auth preserved
- [ ] No product modules, domain models, or non-V1 nav
- [ ] `.env.example` present; no committed secrets

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 1 Design System + App Shell Checklist

Phase 1 is UI-only with mock data. Verify shell and boundaries only:

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Workspace UI routes live under `/w/[workspaceSlug]/…` (e.g. `/w/demo-workspace/dashboard`)
- [ ] Primary nav includes only: Dashboard, Pipeline, Leads, Properties, Activities, Dripping, Settings
- [ ] No forbidden labels in primary nav (see `FORBIDDEN_PRIMARY_NAV_LABELS` in `lib/v1-navigation.ts`)
- [ ] `/w/[workspaceSlug]/states` documented as internal QA-only (not V1 primary nav)
- [ ] Login page exists at `/login` (UI only — no real auth)
- [ ] Placeholder list + detail pages for leads, properties, opportunities
- [ ] Reusable UI primitives under `/components/ui/` contain no business taxonomy maps
- [ ] Domain display components (`kanban-column`, `timeline`, `file-list`, etc.) receive data via props
- [ ] Mock data centralized in `/lib/mock-data.ts` with Phase 1 comments
- [ ] Loading, empty, error, forbidden, and no-workspace states exist (see `/w/demo-workspace/states`)
- [ ] No product API routes or Mongoose product models added
- [ ] Vitest covers nav scope and key component rendering

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 3.5 Projects Checklist

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Project model at `/models/project.ts` with required fields and indexes
- [ ] Project APIs workspace-scoped under `/api/workspaces/[workspaceSlug]/projects`
- [ ] `settings:read` enforced for GET; `settings:update` for mutations
- [ ] `workspaceId` and `createdBy` server-controlled; not accepted from client
- [ ] Reference uniqueness workspace-scoped (includes archived)
- [ ] Archive via `DELETE` sets `archivedAt`; no hard delete
- [ ] Archived projects excluded from default list; `includeArchived=true` for management UI
- [ ] Settings → Projects UI at `/w/[workspaceSlug]/settings/projects`
- [ ] Projects **not** in primary navigation
- [ ] Project selector foundation at `/components/domain/project-selector.tsx` (props only, no fetch)
- [ ] No `project_status` dictionary added; no Company model
- [ ] Unit tests for service, repository, API permissions, workspace isolation

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 4 Leads Checklist

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Lead model at `/models/lead.ts` with required fields and indexes
- [ ] Lead APIs workspace-scoped under `/api/workspaces/[workspaceSlug]/leads`
- [ ] `lead:read` / `lead:create` / `lead:update` / `lead:archive` enforced server-side
- [ ] `workspaceId`, `createdBy`, `fullName`, `emailNormalized`, `phoneNormalized` server-controlled
- [ ] Duplicate active email blocked per workspace; archived email does not block re-create
- [ ] Duplicate phone warns via response metadata; does not block
- [ ] `statusId` validated as same-workspace `lead_status`; `sourceId` as `lead_source`
- [ ] Tags validated as same-workspace with `entityTypes` including `lead`
- [ ] Archive via `DELETE` sets `archivedAt`; no hard delete
- [ ] Archived leads excluded from default list; `includeArchived=true` supported
- [ ] Lead list UI at `/w/[workspaceSlug]/leads` with search, filters, pagination, create drawer
- [ ] Lead detail UI at `/w/[workspaceSlug]/leads/[leadId]` with edit drawer and placeholder tabs
- [ ] Status/source/tag options from backend dictionaries/tags APIs (not hardcoded canonical arrays)
- [ ] No Contacts module; Leads remains primary people module
- [ ] Opportunities/Activities/Files/timeline Notes tabs are placeholders only
- [ ] Lead create/edit drawers include assigned-to selector backed by `GET /members`
- [ ] Unit tests for service, repository, API permissions, validation, workspace isolation

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 5 Properties Checklist

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Property model at `/models/property.ts` with required fields and indexes
- [ ] Property APIs workspace-scoped under `/api/workspaces/[workspaceSlug]/properties`
- [ ] `property:read` / `property:create` / `property:update` / `property:archive` enforced server-side
- [ ] `workspaceId`, `createdBy`, `archivedAt` server-controlled
- [ ] Duplicate reference blocked per workspace (includes archived)
- [ ] `currency` defaults from workspace when missing on create
- [ ] `statusId` validated as same-workspace `property_status`; `typeId` as `property_type`
- [ ] `projectId` validated as same-workspace non-archived Project
- [ ] Tags validated as same-workspace with `entityTypes` including `property`
- [ ] Archive via `DELETE` sets `archivedAt`; no hard delete
- [ ] Archived properties excluded from default list; `includeArchived=true` supported
- [ ] Property list UI at `/w/[workspaceSlug]/properties` with search, filters, pagination, create drawer
- [ ] Property detail UI at `/w/[workspaceSlug]/properties/[propertyId]` with edit drawer and placeholder tabs
- [ ] Status/type/project/tag options from backend APIs (not hardcoded canonical arrays)
- [ ] Missing image/media placeholder on list and detail
- [ ] Projects do not appear in primary navigation
- [ ] Opportunities/Activities/Files/Media/Notes tabs are placeholders only
- [ ] Unit tests for service, repository, API permissions, validation, workspace isolation

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 7 Activities Checklist

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Activity model at `/models/activity.ts` with required fields and indexes
- [ ] Activity APIs workspace-scoped under `/api/workspaces/[workspaceSlug]/activities`
- [ ] Complete/cancel endpoints at `…/complete` and `…/cancel`
- [ ] `activity:read` / `activity:create` / `activity:update` / `activity:archive` enforced server-side
- [ ] `workspaceId`, `createdBy`, `archivedAt`, `completedAt`, `cancelledAt` server-controlled
- [ ] At least one linked entity required; opportunity-linked activities derive lead/property
- [ ] `typeId` validated as same-workspace `activity_type`; `statusId` as `activity_status`
- [ ] Status behavior drives completion/cancellation timestamps (not label text)
- [ ] Overdue/upcoming exclude completed, cancelled, archived, and no-due-date activities
- [ ] Archive via `DELETE` sets `archivedAt`; no hard delete
- [ ] Activities list UI at `/w/[workspaceSlug]/activities` with search, filters, views, pagination
- [ ] Lead/Property/Opportunity detail Activities tabs show real activities and timeline
- [ ] Type/status options from backend dictionaries (not hardcoded canonical workflow logic)
- [ ] Tasks is not primary navigation; Activities remains the follow-up module
- [ ] Unit tests for validation, repository, service, API permissions, status behavior

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 9 Dashboard Checklist

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Dashboard APIs under `/api/workspaces/[workspaceSlug]/dashboard/*`
- [ ] `dashboard:read` enforced server-side on all dashboard routes and page
- [ ] Metrics calculated backend-side (not client-side full-record aggregation)
- [ ] `newLeads` date-scoped; excludes archived leads
- [ ] `activeOpportunities` uses `opportunity_status.behavior = open` (not date-bounded)
- [ ] `wonOpportunities` / `lostOpportunities` use terminal behaviors + date range on `wonAt`/`lostAt` (fallback `closedAt`)
- [ ] `activePipelineValue` includes open opportunities only; grouped by currency
- [ ] `wonValue` grouped by currency for terminal_won in date range
- [ ] `activitiesDueToday` uses pending behavior + workspace timezone day bounds
- [ ] `overdueActivities` excludes completed, cancelled, and archived activities
- [ ] Pipeline/sources/properties charts use dictionary labels/colors/order from backend
- [ ] Recent opportunities and upcoming activities lists are limited and workspace-scoped
- [ ] Date range defaults to last 30 days; `dateFrom <= dateTo` validated
- [ ] Zero-data workspace returns safe zeros/empty arrays
- [ ] Dashboard UI at `/w/[workspaceSlug]/dashboard` renders backend metrics with loading/empty/error/forbidden states
- [ ] Reports and Analytics are not primary navigation modules
- [ ] Unit tests for dashboard service, API permissions, metric behavior, zero-data

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 11 — Settings / Billing / Ownership Reassignment

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Workspace settings API/UI (`GET/PATCH /settings`) with `settings:read` / `settings:update`
- [ ] Membership APIs (`/memberships`) with `users:manage` for mutations
- [ ] Role APIs (`/roles`) with `roles:manage` for mutations; system roles read-only
- [ ] Billing shell at `/settings/billing` and `GET /billing` with `billing:manage`
- [ ] Reassignment summary + POST reassign for leads/properties/opportunities/activities/projects
- [ ] Owner protection: last active owner cannot be suspended/removed/demoted
- [ ] Inactive members cannot receive new assignments (`validateAssignableMember`)
- [ ] Users/Roles/Billing are Settings subsections only — not primary navigation
- [ ] Primary navigation remains locked V1 modules
- [ ] Workspace slug immutable; client `workspaceId` not trusted
- [ ] Email invite delivery not faked — add-member requires existing user account
- [ ] Stripe placeholder only — no secrets or invented pricing exposed
- [ ] Unit tests for settings, memberships, roles, billing, assignments, reassignment, owner protection

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 12 — External Integrations

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] `Integration` and `IntegrationLog` models with workspace-scoped indexes
- [ ] Settings → Integrations UI (not primary navigation)
- [ ] Management APIs enforce `settings:read` / `settings:update`
- [ ] Website integration creates `apiKeyHash` only; raw key shown once on create/rotate
- [ ] `POST /api/integrations/website/leads` authenticates via API key; derives workspace from integration
- [ ] Paused/archived/error integrations reject inbound website leads
- [ ] Website payload requires `firstName`, `lastName`, and email or phone
- [ ] Website webhook rate limited (60/min per API key hash or IP)
- [ ] Middleware public allowlist limited to `/api/integrations/website/leads`
- [ ] Lead creation reuses lead service; source attribution via `lead_source` key `website`
- [ ] Idempotency via `Lead.attributes.integration.idempotencyKey`
- [ ] Duplicate normalized email returns existing lead (`duplicate: true`) without second insert
- [ ] Integration logs store sanitized `payloadSummary` only
- [ ] MLS / Google Ads / Meta Ads are placeholders only (paused, no OAuth/credentials)
- [ ] Unit tests for workspace isolation, permissions, webhook auth, duplicate/idempotency, logging

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 13 — Final Hardening / Beta Release

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] `/docs/qa/*` deliverables exist (bugs, security, isolation, permissions, edge cases, regression, release-readiness, deployment)
- [ ] `AuditLog` model persisted; `createAuditLog()` sanitizes secrets
- [ ] `GET /api/workspaces/[workspaceSlug]/export` workspace-scoped backup
- [ ] Production env fail-fast validation
- [ ] `captureError` placeholder for server error tracking
- [ ] Seed script: `npm run seed` (demo workspace, idempotent)
- [ ] E2E smoke expanded (public routes, cron, webhook auth)
- [ ] No critical auth/workspace/permission defects
- [ ] No scope creep (V1 nav unchanged)
- [ ] Release readiness verdict documented

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

## Phase 14 — In-App Feedback + Platform Admin

- [ ] `npm run typecheck`, `lint`, `test`, `build` pass
- [ ] Floating feedback widget on authenticated workspace shell only (not primary V1 nav)
- [ ] `POST /api/feedback` enforces auth, `Content-Length` cap, and rate limit **before** `request.formData()`
- [ ] Screenshot MIME/count/size validation remains in service (defense-in-depth)
- [ ] `page_url` restricted to same-origin `http`/`https`; untrusted values stored as `null`
- [ ] Admin panel renders only trusted `page_url` values as clickable links
- [ ] Platform admin gated server-side to `tafsir@evo-home.ch` (`requirePlatformAdmin`)
- [ ] Admin resolve/reopen/delete writes `feedback.*` audit entries
- [ ] Screenshots stored under `feedback/` prefix; admin streaming route auth-gated
- [ ] `Feedback` documented in product/domain model as platform telemetry (not CRM entity)
- [ ] No scope creep (V1 primary nav unchanged)

**Rating:** Fully aligned / Partially aligned / Missing / deviating

---

After Codex approval and merge to `dev`, perform manual smoke test for the phase scope before considering stable.

See `/docs/release-gates.md` for merge rules.
