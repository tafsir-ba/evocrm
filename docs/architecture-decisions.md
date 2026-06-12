# Architecture Decisions — V1

This document records the architectural rules all implementation phases must follow.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js App Router |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| UI primitives | shadcn-style components or equivalent custom primitives |
| Database | MongoDB |
| ODM | Mongoose |
| Validation | Zod |
| Forms | React Hook Form |
| Auth | Auth.js / NextAuth with Google provider |
| File storage | DigitalOcean Spaces |
| Email | Resend |
| Payments | Stripe (later phases) |
| Unit tests | Vitest |
| E2E tests | Playwright |

Do not weaken TypeScript strictness. Do not disable lint rules broadly to pass checks.

---

## API Style

Use **REST-style JSON route handlers** for all core V1 mutations and reads.

### Example patterns

```txt
GET    /api/workspaces/[workspaceSlug]/leads
POST   /api/workspaces/[workspaceSlug]/leads
GET    /api/workspaces/[workspaceSlug]/leads/[leadId]
PATCH  /api/workspaces/[workspaceSlug]/leads/[leadId]
```

### Do not use random server actions for core V1 mutations

Route handlers are preferred because they provide:

- QA visibility
- Integration readiness
- Future mobile/API use
- Consistent testing
- Clear permission enforcement at the HTTP boundary

Server actions may be used for non-core UI conveniences only if explicitly approved; default is route handlers.

---

## Workspace Strategy

### URL-based workspace context

Frontend routes:

```txt
/w/[workspaceSlug]/dashboard
/w/[workspaceSlug]/pipeline
/w/[workspaceSlug]/leads
/w/[workspaceSlug]/properties
/w/[workspaceSlug]/activities
/w/[workspaceSlug]/dripping
/w/[workspaceSlug]/settings
```

API routes:

```txt
/api/workspaces/[workspaceSlug]/...
```

### Server resolution chain

```txt
workspaceSlug
  → workspaceId
  → current user membership
  → permissions
```

**Never trust `workspaceId` from the client request body.**

Every workspace-owned database query must use the server-resolved `workspaceId`.

---

## Layered Architecture

### API routes (thin)

Routes are responsible for:

```txt
authenticate user
resolve workspace
verify membership
check permission
validate request (Zod)
call service
return stable response
```

Routes must **not** contain complex business logic.

### Services

Services are responsible for:

```txt
business rules
workflow transitions
relationship validation
status behavior handling
audit log calls
```

### Repositories / data-access

Repositories are responsible for:

```txt
database queries
workspace-scoped lookups
safe updates
pagination
filtering
```

Do not put business logic in React components.

---

## Frontend Rules

### Backend-driven UI

The frontend must not hardcode canonical business data:

```txt
business statuses
status behavior
status colors
role names
permission decisions
lead sources
activity types
property types
pipeline columns
workflow labels
pricing
```

These must come from backend dictionaries, roles, session context, and APIs.

Frontend permission-aware UI (hiding buttons, disabling nav items) is allowed for UX, but is **not** security.

### Generic UI components stay business-agnostic

Allowed generic components (no embedded business rules):

```txt
Button
Input
Select
Textarea
Table
Card
Badge
Modal
Drawer
Tabs
Dropdown
Avatar
EmptyState
Skeleton
ErrorState
PermissionDenied
PageHeader
FilterBar
SearchInput
KanbanColumn
KanbanCard
Timeline
FileList
```

Business-specific rendering (e.g. pipeline column headers, status badge colors) receives data from the backend and maps it generically.

---

## Status Behavior Rule

Status behavior must never depend on label text.

| Entity | Behavior values |
|--------|-----------------|
| Opportunity | `open`, `terminal_won`, `terminal_lost` |
| Activity | `pending`, `completed`, `cancelled` |

See `/docs/domain-model.md` for full contract.

---

## Document / File Access

Documents store `bucket` and `storageKey`. No permanent public URLs as canonical access.

Signed URLs are generated on demand after:

```txt
auth check
workspace check
permission check
linked entity check
```

---

## Campaign Sending

Campaign emails are sent through a protected backend cron/service endpoint:

```txt
POST /api/cron/campaigns/send-due
```

Protected by `CRON_SECRET`. Never send from frontend or page views.

---

## Approved Project Structure (Phase 0+)

Phase 0 scaffolds a **root-level** Next.js App Router layout. Do **not** use a `src/` wrapper — the contract below is the source of truth.

### Phase 0 implementation map

| Concern | Location |
|---------|----------|
| Environment validation | `/server/env.ts` |
| MongoDB connection | `/server/db/mongoose.ts` |
| API responses | `/server/api/responses.ts` |
| Application errors | `/server/errors.ts` |
| Request validation | `/server/validation/request.ts` |
| Auth stubs | `/server/auth/` |
| Workspace resolution stub | `/server/workspaces/resolve-workspace.ts` |
| Workspace scope helper | `/server/workspaces/with-workspace-scope.ts` |
| Permission stubs | `/server/permissions/` |
| Audit stub | `/server/audit/create-audit-log.ts` |
| Seed scaffold | `/server/seed/` |
| Unit tests | `/tests/unit/` |
| E2E scaffold | `/tests/e2e/` |

```txt
/app
  w/[workspaceSlug]/            # Workspace UI routes
  api/
    workspaces/[workspaceSlug]/ # Workspace-scoped APIs
    cron/                         # Protected cron endpoints
    auth/                         # Auth.js routes
/components
  ui/                             # Generic primitives (Button, Input, Table, …)
  layout/                         # App shell, nav, page chrome
  domain/                         # Feature components (data from API only)
/server
  auth/                           # Session helpers, auth guards
  db/                             # MongoDB connection, Mongoose setup
  services/                       # Business logic
  repositories/                   # Data access (workspace-scoped queries)
  validation/                     # Zod schemas
  permissions/                    # Permission checks
  audit/                          # Audit log writers
/models                           # Mongoose model definitions
/lib                              # Shared utilities (non-server-only helpers)
/docs                             # Architecture and product contract
/tests                            # Vitest unit/integration tests
```

### Layer mapping

| Layer | Location |
|-------|----------|
| Thin API routes | `/app/api/...` |
| Services | `/server/services/` |
| Repositories | `/server/repositories/` |
| Models | `/models/` |
| Zod schemas | `/server/validation/` |
| Permission checks | `/server/permissions/` |

Subfolders may be added within these roots, but must preserve route → service → repository separation. Do not move business logic into `/components` or route handlers.

---

## Required Commands Per Phase

Every implementation phase must pass:

```txt
npm run typecheck
npm run lint
npm run test
npm run build
```

---

## Documentation Rule

When schemas, APIs, permissions, architecture, or behavior change, update the relevant docs in `/docs`.

---

## Decision Log

| Decision | Rationale | Status |
|----------|-----------|--------|
| MongoDB + Mongoose | Flexible schema for CRM attributes; team familiarity | Approved |
| URL slug workspace context | Clear multi-tenant URLs; shareable links | Approved |
| REST route handlers over server actions | Testability, API clarity, future clients | Approved |
| No Company model | Workspace is the account boundary | Approved |
| Archive over hard delete | Safer V1; audit-friendly | Approved |
| Dictionary-driven statuses | Backend-driven UI; no label-based logic | Approved |
| Signed URLs for documents | Security; no public file exposure | Approved |
| Stripe later | Billing not in early MVP | Approved |
