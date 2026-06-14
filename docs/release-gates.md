# Release Gates — V1

Merge and release rules for phased development.

---

## Phase 0 Gate (foundation)

Phase 0 merges when all of the following pass with no product modules implemented:

```txt
npm run typecheck
npm run lint
npm run test
npm run build
```

Foundation utilities required: env validation, MongoDB connection helper, API response/error helpers, Zod request validation, auth/workspace/permission stubs, `withWorkspaceScope()`, audit stub, seed scaffold.

---

## Branch Strategy

```txt
main     — production-stable only
dev      — integration branch; phases merge here after Codex approval
feature  — phase work branches (optional)
```

---

## Per-Phase Workflow

```txt
1. Emergent designs phase-specific screens/states
2. Cursor implements approved phase scope
3. Cursor updates docs for schema/API/permission changes
4. Cursor runs typecheck / lint / test / build
5. Codex reviews strictly (see /docs/qa-checklist.md)
6. Cursor fixes blocking issues
7. Codex re-checks
8. Merge to dev
9. Manual smoke test
10. Merge to main only when stable
```

---

## Per-Phase Merge Gate (dev)

A phase **cannot merge to `dev`** if any of the following are true:

```txt
npm run typecheck fails
npm run lint fails
npm run test fails
npm run build fails
docs are not updated for changed schemas/APIs/permissions
workspace isolation has a known critical issue
server-side permission checks are missing (where applicable to phase)
Codex rates the phase as Missing / deviating
required QA fixes are unresolved
current phase scope was exceeded
unplanned entities or primary nav modules were added
```

### Required commands

```txt
npm run typecheck
npm run lint
npm run test
npm run build
```

All four must pass.

---

## Codex Review Gate

Codex reviews against `/docs/qa-checklist.md` and rejects on:

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

**Overall rating must not be "Missing / deviating"** for merge to `dev`.

---

## Manual Smoke Test Gate (post-dev merge)

After merge to `dev`, a human performs manual smoke test for:

- New functionality in the phase
- Regression on prior phase flows
- Auth and workspace switching
- Permission boundaries (at least owner vs viewer)

Document smoke test results in PR or phase notes.

---

## Main Merge Gate

Merge `dev` → `main` only when:

```txt
All planned phases up to target release are complete and stable on dev
No known critical security issues
No known workspace isolation bugs
Manual smoke test passed on dev
typecheck / lint / test / build pass on dev
```

`main` is not updated mid-phase unless hotfix policy applies.

---

## Beta Blockers (Phase 13)

Beta release is **blocked** if any of the following exist:

```txt
auth bypass exists
workspace data leak exists
permissions are frontend-only
document access is public (unsigned/unauthenticated)
campaign unsubscribe fails
cron endpoint is unprotected
integration webhook is unauthenticated
pipeline movement is broken
activity due/overdue logic is wrong
dashboard numbers are inaccurate
build / typecheck / lint / test fail
/docs/qa/release-readiness.md missing or status = Not ready
```

All beta blockers must be resolved before `dev` → `main` for beta.

Phase 13 QA artifacts live under `/docs/qa/`. Release verdict: **Ready with accepted risks** (see `release-readiness.md`).

---

## Hotfix Policy

Critical production fixes on `main`:

1. Branch from `main`
2. Minimal fix + test
3. Codex review (abbreviated security/regression focus)
4. Merge to `main` and backport to `dev`

---

## Documentation Gate

Any phase that changes the following must update docs **before** merge:

| Change | Update |
|--------|--------|
| Entity fields | `/docs/domain-model.md` |
| API routes/shapes | `/docs/api-contracts.md` |
| Permissions | `/docs/roles-permissions.md` |
| Query patterns | `/docs/data-access-patterns.md` |
| Security behavior | `/docs/security-baseline.md` |
| Product scope | `/docs/product-scope.md` |
| Architecture | `/docs/architecture-decisions.md` |
| Env vars | `/docs/env.example.md` |
| Test expectations | `/docs/testing-strategy.md` |

Phase -1 establishes baseline docs. Later phases patch docs as part of the same PR.

---

## Phase Completion Checklist

Before requesting Codex review:

```txt
[ ] Scope matches phase brief
[ ] Docs updated
[ ] typecheck passes
[ ] lint passes
[ ] test passes
[ ] build passes
[ ] No secrets committed
[ ] PR description lists what was built and how to test
```

---

## Release Milestones

| Milestone | Target |
|-----------|--------|
| Phase -1 complete | Architecture contract frozen (docs only) |
| Phase 0 complete | Repo scaffold, tooling, CI commands |
| Phase 2 complete | Auth + workspace + permissions foundation |
| Phase 3.5 complete | Projects CRUD (Settings-managed grouping) |
| Phase 4 complete | Leads CRUD (demand capture, dictionary-backed status/source) |
| Phase 5 complete | Properties CRUD (supply capture, dictionary-backed status/type, project linking) |
| Phase 6 complete | Opportunities CRUD + Pipeline (lead/property linking, behavior-based stages, backend pipeline totals) |
| Phase 7 complete | Activities CRUD + timeline (relationship validation, behavior-based complete/cancel, overdue/upcoming views) |
| Phase 8 complete | Documents / Files (upload auth, signed URLs, linked entity validation, archive) |
| Phase 9 complete | Dashboard / Analytics (backend-driven metrics, date range, dictionary-backed charts, `dashboard:read`) |
| MVP feature complete | Phases 1–10 on dev |
| Beta | Phase 13 on main |
| V1 GA | Beta stable + billing (Phase 11) as scoped |
