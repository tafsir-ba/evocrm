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
- [ ] Campaign cron protected by `CRON_SECRET` (Phase 10+)
- [ ] Unsubscribe behavior works (Phase 10+)
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

## Manual Smoke Test (post-merge to dev)

After Codex approval and merge to `dev`, perform manual smoke test for the phase scope before considering stable.

See `/docs/release-gates.md` for merge rules.
