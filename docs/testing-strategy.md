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
1. login (Google — may use test auth bypass in CI)
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

---

## Phase-Specific Test Expectations

| Phase | Minimum tests |
|-------|---------------|
| 0 | Tooling runs; smoke test that app builds |
| 2 | Auth session, workspace resolution, permission checks, membership status |
| 3 | Dictionary seeding, behavior field on status items |
| 4 | Lead CRUD, workspace isolation, archive |
| 5 | Property CRUD, projectId validation |
| 6 | Opportunity CRUD, pipeline status transitions via behavior |
| 7 | Activity CRUD, due date, complete/cancel via behavior |
| 8 | Document upload auth, signed URL permission gate |
| 9 | Dashboard aggregation workspace-scoped |
| 10 | Campaign enroll, send skip rules, unsubscribe |
| 11 | Member invite/remove guards, owner protection |
| 12 | Webhook signature validation, idempotency |
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
