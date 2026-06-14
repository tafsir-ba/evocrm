# Security Review — Phase 13 Beta Gate

Review date: 2026-06-14  
Scope: Phases 0–12 + Phase 13 hardening

---

## Summary

| Category | Verdict |
|----------|---------|
| Authentication | Pass |
| Authorization / permissions | Pass |
| Workspace isolation | Pass |
| Input validation | Pass |
| Document access | Pass |
| Campaign compliance | Pass |
| Integration security | Pass |
| Cron / webhook security | Pass |
| Secrets / env | Pass (with production validation) |
| Rate limiting | Partial — accepted beta risk |
| Error leakage | Pass |
| Audit logging | Pass (persisted Phase 13) |

---

## Authentication

- Auth.js session required for `/w/*`, `/workspaces`, `/api/me`, `/api/workspaces`
- Public paths explicitly allowlisted in `lib/public-paths.ts`
- Credentials + Google OAuth supported
- Inactive memberships blocked via `requireMembership()`

**Blocking issues:** None  
**Non-blocking:** Auth signup/login rate limiting not implemented

---

## Authorization

- 38 permission keys allowlisted in `server/permissions/permissions.ts`
- All workspace API routes use `requireWorkspaceApiAccess()` with explicit permission keys
- Owner protection prevents last-owner removal/demotion
- Frontend nav visibility is not treated as security

**Blocking issues:** None

---

## Workspace Isolation

- Repositories scope queries with `withWorkspaceScope(workspaceId, filter)`
- Cross-workspace ID access returns `404 NOT_FOUND`
- Client-supplied `workspaceId` rejected in Zod `.strict()` schemas
- Relationships validated same-workspace in services (leads, properties, opportunities, activities, documents, campaigns, integrations)

**Blocking issues:** None  
**Reviewed modules:** Workspace, Membership, Role, Dictionary, Tag, Project, Lead, Property, Opportunity, Activity, Document, Dashboard, Campaign, Integration, IntegrationLog

---

## Input Validation

- Zod schemas in `server/validation/` for all major mutations
- Immutable fields server-controlled (`workspaceId`, `createdBy`, `uploadedBy`, `apiKeyHash`, timestamps)
- Website lead capture validates via lead service (not bypassed)

**Blocking issues:** None

---

## Document Access

- Private DO Spaces storage; no public canonical URLs
- Signed URLs require `document:read` + active membership
- Archived/failed documents do not receive signed URLs
- MIME allowlist and size limits in `lib/documents.ts`

**Blocking issues:** None

---

## Campaign Compliance

- Unsubscribe route public; token validated
- Unsubscribed / missing-email leads skipped
- `CampaignSend` logs sent/failed/skipped
- Cron requires `Bearer ${CRON_SECRET}`
- Paused/archived campaigns and terminal enrollments do not send

**Blocking issues:** None

---

## Integration Security

- Website webhook requires `Authorization: Bearer evocrm_whk_*` API key
- API keys hashed (SHA-256 + pepper); shown once on create/rotate
- Workspace derived from integration record, not payload
- Paused/archived integrations reject processing
- Integration logs store sanitized summaries only
- MLS/ads integrations are placeholders

**Blocking issues:** None

---

## Environment / Secrets

- `server/env.ts` Zod validation; production fail-fast for required keys
- Secrets never in `NEXT_PUBLIC_*` vars
- Build-time defaults only when `NEXT_PHASE=phase-production-build`

**Required before beta (production deploy):** All vars in `/docs/qa/deployment-checklist.md`

---

## Rate Limiting

| Endpoint | Status |
|----------|--------|
| Website lead webhook | Implemented — 60/min per key hash or IP |
| Campaign cron | Secret auth (not rate limit) |
| Auth signup/login | Not implemented |
| Unsubscribe | Not implemented |
| Document upload URL | Not implemented |

**Accepted beta risks:** Auth and unsubscribe abuse possible at low volume; monitor logs. Documented in release-readiness.

---

## Error Leakage / PII

- Unknown errors return generic `INTERNAL_ERROR` message
- `handleRouteError` + `captureError` log server-side without secrets
- Audit/export payloads sanitized (`sanitizeAuditPayload`, export redaction)

**Blocking issues:** None

---

## Required Fixes Before Beta

```txt
[x] Audit log persistence
[x] Workspace export without secrets
[x] Production env validation
[x] Website webhook rate limiting
[x] Cron secret enforcement
[x] Error capture placeholder
[ ] Configure production env vars at deploy time (ops)
[ ] Optional: external error tracking provider (post-beta)
```

---

## Accepted Risks

```txt
- Auth/unsubscribe rate limiting deferred
- Synchronous workspace export for large tenants
- E2E does not cover authenticated Google OAuth in CI
- No third-party APM until provider approved
```
