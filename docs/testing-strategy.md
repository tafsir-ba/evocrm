# Testing Strategy — V1

Testing expectations for every implementation phase.

---

## Required Commands Every Phase

All must pass before merge to `dev`:

```txt
npm run typecheck
npm run lint
npm run test
npm run build
```

Do not weaken TypeScript strictness, disable lint rules broadly, or skip tests to pass.

---

## Test Stack

| Type | Tool | Purpose |
|------|------|---------|
| Unit / service | Vitest | Business logic, validation, permissions helpers |
| API / integration | Vitest + test HTTP client | Route behavior, status codes, workspace isolation |
| E2E | Playwright | Critical user flows in browser |

---

## What to Test Where

### Unit / service tests (Vitest)

Phase 1 adds React component tests (Vitest + jsdom + Testing Library) for:

- V1 navigation scope (allowed vs forbidden primary nav labels)
- Core UI state components (empty, error, permission denied)
- Domain display components that accept props (`KanbanColumn`, `Timeline`)

- Zod schema validation (valid + invalid inputs)
- Status transition logic (behavior-based, not label-based)
- Cross-workspace relationship validation
- Permission helper functions
- Normalization helpers (email, phone, fullName)
- Campaign skip rules (no email, unsubscribed)
- Archive behavior

### API tests

- `401` unauthenticated
- `403` permission denied / membership required
- `404` not found in workspace
- `400` validation errors with stable error shape
- Happy-path CRUD
- Workspace isolation: user A cannot access user B's workspace data via ID guessing
- Archived records excluded from default lists

### E2E tests (Playwright)

Critical flows only — not every edge case. Run against a test workspace with seeded data.

Phase 2 note: full Google OAuth cannot run in CI without credentials. E2E smoke verifies unauthenticated redirect, public routes, cron protection, and webhook auth rejection. Auth/workspace/permission logic is covered by Vitest unit tests with mocked repositories.

Phase 13 E2E (`tests/e2e/smoke.spec.ts`): login/signup page render, unsubscribe token requirement, protected route redirects, website webhook without API key, cron without secret.

### Seed / demo data

```txt
npm run seed          # creates demo@evocrm.local + demo-agency workspace (idempotent)
npm run seed -- --dry-run
```

Requires `MONGODB_URI`. Optional `SEED_DEMO_PASSWORD`. Do not run against production.

Phase 2A adds unit tests for credentials signup/login (`credentials-auth.test.ts`, `auth-signup-api.test.ts`, `auth-validation.test.ts`) and login/signup UI component tests.

---

## Minimum Critical Test Themes

Every relevant phase should add tests covering applicable themes:

```txt
workspace isolation
server-side permissions
validation failures
happy path
not found behavior
forbidden behavior
archived record behavior
relationship integrity
empty states (E2E where UI exists)
error states (E2E where UI exists)
```

---

## Critical E2E Flow for MVP

Full flow to implement by Phase 13:

```txt
1. login (Google — may use test auth bypass in CI; see safety rules below)
2. create/select workspace
3. create project
4. create lead
5. create property
6. create opportunity
7. move opportunity through pipeline
8. create activity
9. upload document
10. view dashboard
11. create campaign
12. manage users/settings
```

Implement incrementally per phase. Each phase adds tests for its scope.

### Test auth bypass — safety rules

If CI uses a test auth bypass instead of real Google OAuth:

- Must exist **only** when `NODE_ENV === "test"` (or an equivalent explicit test flag).
- Must be **impossible to enable in production** — guard at module load; fail closed if misconfigured.
- Must not weaken server-side permission or workspace checks — bypass authenticates a test user only.
- Must be documented in test setup; never exposed as a public route in non-test builds.

---

## Phase-Specific Test Expectations

| Phase | Minimum tests |
|-------|---------------|
| 0 | Tooling runs; unit tests for API helpers, errors, env, validation, `withWorkspaceScope()`; Playwright scaffold |
| 2 | Auth session, workspace resolution, permission checks, membership status |
| 3 | Dictionary seeding, behavior field on status items, tag archive, settings UI, API permission gates |
| 3.5 | Project CRUD, workspace isolation, archive via DELETE (`tests/unit/projects-{service,api,repository}.test.ts`, `project-selector.test.tsx`, `projects-panel.test.tsx`) |
| 4 | Lead CRUD, workspace isolation, archive via DELETE (`tests/unit/leads-{service,api,repository,validation}.test.ts`) |
| 5 | Property CRUD, workspace isolation, archive via DELETE, reference uniqueness, project/dictionary/tag validation (`tests/unit/properties-{service,api,repository,validation}.test.ts`) |
| 6 | Opportunity CRUD, pipeline status transitions via behavior (`tests/unit/opportunities-{service,api,repository,validation}.test.ts`, `pipeline-service.test.ts`) |
| 7 | Activity CRUD, due date, complete/cancel via behavior (`tests/unit/activities-{service,api,repository,validation}.test.ts`) |
| 8 | Document upload auth, signed URL permission gate, linked entity validation, file validation, archive behavior (`tests/unit/documents-{validation,service,api,ui}.test.ts`) |
| 9 | Dashboard aggregation workspace-scoped, behavior-based metrics, date range validation, permissions (`tests/unit/dashboard-{service,api,ui}.test.ts`) |
| 10 | Campaign enroll, send skip rules, unsubscribe |
| 11 | Member invite/remove guards, owner protection |
| 12 | Integration CRUD permissions, API key hash/rotate, website webhook auth, idempotency, duplicate email, log sanitization (`tests/unit/integrations-{validation,service,api}.test.ts`, `website-lead-capture-service.test.ts`, `integration-api-keys.test.ts`, `integration-logs-service.test.ts`) |
| 13 | Full E2E MVP flow |

---

## Test Data Conventions

- Use separate test database (`MONGODB_URI` pointing to `evocrm_test`)
- Seed fixtures per test file or suite; clean up between runs
- Two workspaces minimum for isolation tests
- Four test users: owner A, agent A, owner B, viewer A

---

## Mocking Guidelines

| Dependency | Approach |
|------------|----------|
| MongoDB | Test DB or mongodb-memory-server for unit tests |
| DigitalOcean Spaces | Mock presign/upload in unit tests; integration optional |
| Resend | Mock send; assert payload includes unsubscribe |
| Auth.js session | Test helper to inject session |
| Cron | Test endpoint with `CRON_SECRET` header |

---

## CI Expectations (Phase 0+)

```txt
typecheck → lint → test → build
```

Fail fast. No merge on red.

---

## Coverage Guidance

No hard coverage percentage in V1. Prioritize:

- Permission checks
- Workspace isolation
- Status behavior transitions
- Campaign compliance paths
- Document access authorization

Coverage reports optional; critical paths must have explicit tests.

---

## Regression Prevention

When fixing a bug:

1. Add a failing test reproducing the bug
2. Fix the code
3. Verify test passes

Codex may reject phases where known regressions lack test coverage.
