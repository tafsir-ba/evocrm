# Known Bugs — Phase 13

Tracked defects at beta gate. **Critical** bugs block beta release.

---

## Critical

_None at Phase 13 gate._

---

## High

| ID | Severity | Area | Roles | Steps | Expected | Actual | Status | Owner/Fix |
|----|----------|------|-------|-------|----------|--------|--------|-----------|
| BUG-001 | High | E2E auth | All | Run full Playwright suite with real Google OAuth | Authenticated smoke paths pass | OAuth cannot run in CI without credentials; only public/unauth paths automated | Open (accepted limitation) | Documented in `/docs/testing-strategy.md` |

---

## Medium

| ID | Severity | Area | Roles | Steps | Expected | Actual | Status | Owner/Fix |
|----|----------|------|-------|-------|----------|--------|--------|-----------|
| BUG-002 | Medium | Rate limiting | Public | Burst requests to `/api/auth/signup` | Rate limited | In-process IP limiter (10 / 15 min) | Fixed | `server/security/public-route-rate-limit.ts` |
| BUG-003 | Medium | Rate limiting | Public | Burst requests to `/unsubscribe` | Rate limited | IP limiter on one-click POST (still HTTP 200) | Fixed | `server/security/public-route-rate-limit.ts` |
| BUG-004 | Medium | Export | Owner/Admin | Export very large workspace (>10k records) | Async job or streaming | Synchronous JSON bundle may be slow/large | Open | Beta uses sync export; monitor size |

---

## Low

| ID | Severity | Area | Roles | Steps | Expected | Actual | Status | Owner/Fix |
|----|----------|------|-------|-------|----------|--------|--------|-----------|
| BUG-005 | Low | Seed | Dev | Re-run `npm run seed` after partial failure | Idempotent full fixture | Skips entity seed if workspace slug already exists | Open | Documented; delete workspace to re-seed |
| BUG-006 | Low | Monitoring | Ops | Trigger unhandled server error | External alert | Console-only via `captureError` placeholder | Open | Sentry recommended post-beta |

---

## Fixed in Phase 13

| ID | Area | Fix |
|----|------|-----|
| FIX-001 | Audit log | `AuditLog` model + persisted `createAuditLog()` with payload sanitization |
| FIX-002 | Backup/export | `GET /api/workspaces/[workspaceSlug]/export` workspace-scoped JSON export |
| FIX-003 | Production config | `validateProductionEnv()` fail-fast on missing required vars |
| FIX-004 | Error handling | `handleRouteError` logs non-exposed errors via `captureError` |
| FIX-006 | Export permission | Restricted to `settings:update` only (viewers/agents cannot bulk export) |
| FIX-007 | Export document metadata | Uses model fields `fileName` and `fileSize` |
| FIX-008 | Auth signup rate limit | BUG-002 — IP limiter on `/api/auth/signup` |
| FIX-009 | Unsubscribe rate limit | BUG-003 — IP limiter on one-click unsubscribe POST |
| FIX-010 | Drip soft-bounce | Transient Resend bounces no longer permanent suppressions |
| FIX-011 | Enrollment defer sync | Passive list/detail loads no longer undo skip/fail retry backoff |
| FIX-012 | Webhook side effects | Bounce/complaint suppressions still apply on provider retry |
| FIX-013 | Campaign cron hang | Fetch timeout so hung ticks cannot pin `workerRunning` |
