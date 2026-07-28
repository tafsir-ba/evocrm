# Website → CRM Lead Integration Investigation

**Product:** Evohome CRM (`evocrm`)  
**Date:** 2026-07-28  
**Updated:** 2026-07-28 — remediation applied on branch `cursor/website-lead-integration-investigation-2bb6`  
**Scope:** How external websites capture and route leads into the CRM; whether leads are correctly separated, attributed, and stored by website/project.  
**Method:** Codebase review (models, services, APIs, UI, permissions, docs) + automated practical tests (multi-website segregation suite).  
**Evidence log:** `docs/investigations/test-evidence.log`  
**Segregation test suite:** `tests/unit/website-lead-multi-site-segregation.test.ts`

## Remediation status (applied)

| Issue | Fix |
|-------|-----|
| Website A could post into Project B via payload | **Fixed** — integrations default to `allowProjectOverride: false`; cross-project payload returns `403 FORBIDDEN` |
| Workspace-wide email dedupe misattributed leads | **Fixed** — uniqueness is now `workspaceId + projectId + emailNormalized` |
| `defaultProjectId` hidden from API/UI | **Fixed** — exposed on public DTO; Settings UI configure + create flows |
| Website/UTM not visible on lead | **Fixed** — lead detail shows Website attribution section |
| No website / UTM filters | **Fixed** — leads list filters by website integration + UTM campaign |
| Consent not accepted on webhook | **Fixed** — optional `emailConsentStatus` on capture payload |
| Integrations UI inconsistent | **Fixed** — Label/ProjectSelector patterns aligned with other settings panels |

**Ops note:** Deployments that already created the old unique email index must run `npm run migrate:lead-email-index` (supports `--dry-run`) to drop `workspaceId_1_emailNormalized_1` and ensure `workspaceId_1_projectId_1_emailNormalized_1`.

---

**Status legend used below**

| Marker | Meaning |
|--------|---------|
| **Exists** | Fully implemented and verified in code/tests |
| **Partial** | Implemented in API/storage but incomplete in UI, docs, or enforcement |
| **Missing** | Not present in the current codebase |

---

## Current implementation protocol (source of truth)

> Canonical operator guide: **`docs/website-lead-capture-setup.md`**.  
> Historical narrative below was the **pre-remediation** investigation. Key tables in §§3–6 and Appendices were corrected to match code after remediation; prefer this protocol block and the setup guide if anything conflicts.

### Admin steps

1. Create destination project (Settings → Projects).
2. Settings → Integrations → create website integration with **default project** (required if multi-project).
3. Copy one-time API key.
4. Leave override **locked** unless one site must feed multiple projects.
5. Website POSTs to `/api/integrations/website/leads` with Bearer key.
6. When locked: **omit** `projectId` / `projectReference`.
7. Verify lead under destination project + integration logs.

### Integrator payload (locked)

Required: `firstName`, `lastName`, and `email` or `phone`. Do not send `projectId` while override is locked.

### Multi-website matrix (current)

| Website | Integration default | Override | Result |
|---------|---------------------|----------|--------|
| A | Project A | locked | A → A only |
| B | Project B | locked | B → B only |
| A (mis-sent `projectId=B`) | Project A | locked | `403 FORBIDDEN` |
| A | Project A | enabled | May target any active workspace project via payload |

### Executive verdict (post-remediation)

Leads are workspace- and project-scoped. Website integrations authenticate with per-integration API keys and are **locked to `defaultProjectId` by default** (`allowProjectOverride: false`). Cross-project payload targeting returns `403 FORBIDDEN` unless an admin enables override. Email uniqueness is **per project**. Attribution metadata is stored and shown on lead detail; leads list filters by website integration and UTM campaign. Settings UI exposes default project + override.

Remaining gaps (deferred P2): humanized status/consent labels; lead:read-safe integration name endpoint for custom roles without `settings:read`; project-scoped RBAC; first-class campaign/form ids.

---

## 1. Lead flow diagram

```text
┌─────────────────────┐     ┌─────────────────────┐
│  Website A (form)   │     │  Website B (form)   │
│  API key A          │     │  API key B          │
└─────────┬───────────┘     └─────────┬───────────┘
          │ POST JSON                 │ POST JSON
          │ Authorization: Bearer …   │
          └────────────┬──────────────┘
                       ▼
        ┌──────────────────────────────────────┐
        │ POST /api/integrations/website/leads │
        │ (public allowlist; no session)       │
        ├──────────────────────────────────────┤
        │ 1. Content-Length ≤ 64 KB            │
        │ 2. Rate limit 60/min (IP + key hash) │
        │ 3. Parse Bearer / X-Integration-Key  │
        │ 4. Zod validate payload              │
        │ 5. SHA-256(pepper:key) → Integration │
        │    (type=website, status=active)     │
        │ 6. Workspace = integration.workspace │
        │ 7. Idempotency / email duplicate (per project)
        │ 8. Resolve projectId (locked unless allowProjectOverride):
        │      if locked: defaultProjectId / sole project only
        │      if override: payload projectId|projectReference → default → sole
        │      → else VALIDATION_ERROR / FORBIDDEN
        │ 9. Create Lead (source=website)      │
        │10. IntegrationLog + AuditLog         │
        └──────────────────┬───────────────────┘
                           ▼
        ┌──────────────────────────────────────┐
        │ MongoDB (single workspace collection)│
        │ Lead { workspaceId, projectId,       │
        │   sourceId, attributes.integration } │
        └──────────────────┬───────────────────┘
                           ▼
        ┌──────────────────────────────────────┐
        │ CRM UI /w/{slug}/leads               │
        │ Filter: project, sourceId, website,  │
        │         UTM campaign                 │
        │ Detail: Source, Project, attribution │
        └──────────────────────────────────────┘
```

### What data is collected?

| Field | Required? | Stored where | Status |
|-------|-----------|--------------|--------|
| `firstName`, `lastName` | Yes | Lead | **Exists** |
| `email` or `phone` | At least one | Lead (+ normalized) | **Exists** |
| `message` | No | Lead.`notes` | **Exists** |
| `preferredAreas`, `budgetMin`/`budgetMax` | No | Lead | **Exists** |
| `propertyReference` | No | `attributes.integration` only (not linked to Property) | **Partial** |
| `source` (free text) | No | `attributes.integration.inboundSource` | **Partial** (stored, not shown in UI) |
| Dictionary `lead_source` = `website` | Auto | Lead.`sourceId` | **Exists** |
| `utm.{source,medium,campaign,term,content}` | No | `attributes.integration.utm` | **Partial** (stored, not shown/filterable) |
| `externalId`, `idempotencyKey` | No | `attributes.integration` | **Exists** |
| `projectId` / `projectReference` | Conditional | Lead.`projectId` | **Exists** |
| `website_id`, `form_id`, `campaign_id`, `client_id`, `property_id` | — | — | **Missing** as first-class API params |
| Consent / GDPR flags from form | — | Defaults to `emailConsentStatus: "unknown"` | **Missing** on webhook |

### Where is data sent?

Single public webhook:

```txt
POST /api/integrations/website/leads
```

No middleware product, no embeddable JS snippet, no third-party form bridge in-repo. Websites must POST JSON themselves.

---

## 2. APIs, endpoints, auth, and fields

### Inbound lead capture (public)

| Item | Detail |
|------|--------|
| Endpoint | `POST /api/integrations/website/leads` |
| Protocol | REST JSON over HTTPS |
| Auth | API key: `Authorization: Bearer evocrm_whk_…` **or** `X-Integration-Key` |
| Key storage | SHA-256(`INTEGRATION_API_KEY_PEPPER` or `NEXTAUTH_SECRET` + `:` + raw key); raw key shown once |
| OAuth / signed requests | **Missing** |
| Rate limit | 60 req/min per IP **and** per API-key hash → `429 RATE_LIMITED` |
| Body limit | 64 KB Content-Length → `400 VALIDATION_ERROR` |
| Validation | Zod strict schema |
| Success | `{ data: { leadId, duplicate, idempotent } }` |
| Errors | `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `RATE_LIMITED`, `CONFLICT` (handled as duplicate where possible) |
| Retry / webhooks out | Caller responsibility; CRM does not push outbound lead webhooks |
| Duplicate prevention | Idempotency key per integration; workspace-unique active email |
| Logging | `IntegrationLog` + `AuditLog` on receive / create / duplicate / fail |

### Integration management (session + workspace RBAC)

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/api/workspaces/[slug]/integrations` | `settings:read` / `settings:update` |
| GET/PATCH/DELETE | `…/integrations/[id]` | read / update / archive |
| POST | `…/integrations/[id]/rotate-api-key` | `settings:update` |
| GET | `…/integrations/[id]/logs` | `settings:read` |

`PATCH` accepts `defaultProjectId` (**Exists** in API). Public DTO **omits** `defaultProjectId` (**Partial**).

### CRM lead APIs

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/api/workspaces/[slug]/leads` | Filters include `projectId`, `sourceId` |
| GET/PATCH/DELETE | `…/leads/[id]` | Archive on DELETE |
| GET | `…/export` | Full workspace JSON export (`settings:update`) |
| GET | `…/dashboard/sources` | Lead counts by dictionary source, optional `projectId` |

### Identifier support matrix

| Parameter | Accepted on webhook? | Stored permanently? | Visible in CRM UI? |
|-----------|---------------------|---------------------|--------------------|
| `website_id` | **Missing** (workspace resolved from API key → `integrationId`) | `attributes.integration.integrationId` | **Missing** |
| `project_id` | As `projectId` / `projectReference` | Lead.`projectId` | **Exists** (detail + global filter) |
| `campaign_id` | **Missing** (only `utm.campaign` string) | UTM string only | **Missing** |
| `property_id` | **Missing** (`propertyReference` string only) | attributes only | **Missing** |
| `client_id` | **Missing** | — | **Missing** |
| `source` | Free-text optional | `inboundSource` + dictionary `website` | Dictionary source only |
| `form_id` | **Missing** (use `externalId` / `idempotencyKey`) | If sent as those fields | **Missing** |

---

## 3. Website ↔ CRM destination matrix

There is **no** first-class Website entity. A “website connection” = an `Integration` with `type: "website"`.

| Simulated website | Integration | Auth | Default destination | Alternate routing | Same workspace DB? |
|-------------------|-------------|------|---------------------|-------------------|--------------------|
| Website A | Integration A (`defaultProjectId` = Project A) | API key A | Project A | Any active project via payload | Yes |
| Website B | Integration B (`defaultProjectId` = Project B) | API key B | Project B | Any active project via payload | Yes |
| Website C (optional) | Integration C with same default as A | API key C | Project A | Same | Yes |

**Observed in tests** (`website-lead-multi-site-segregation.test.ts`):

| Scenario | Result |
|----------|--------|
| Website A batch → Project A | Pass — all leads `projectId = A`, `integrationId = A` |
| Website B batch → Project B | Pass — all leads `projectId = B`, `integrationId = B` |
| No cross-contamination when using defaults | Pass |
| Several websites → same project | Pass when defaults match |
| One website → multiple projects via payload | Pass (by design / also a risk) |
| Website A deliberately posts `projectId = B` | **Allowed** — no technical lock |
| Unknown / foreign project id | Rejected with `VALIDATION_ERROR` |
| Duplicate idempotency key | Returns existing lead, no create |
| Same email already on Project B, posted via Website A | Returns Project B lead as duplicate (**misrouting risk**) |
| Missing project mapping in multi-project WS | Clear `VALIDATION_ERROR` |
| Bad / paused key | `UNAUTHENTICATED` / `FORBIDDEN` |

---

## 4. How lead segregation currently works

### What exists

1. **Workspace tenancy (hard):** API key → integration → `workspaceId`.
2. **Project assignment (hard):** Every lead requires `projectId`; list API + UI filter by project.
3. **Locked website → project routing (hard when `allowProjectOverride=false`):** mismatched `projectId` → `403 FORBIDDEN`; omit `projectId` to use `defaultProjectId`.
4. **Email uniqueness (hard):** unique active lead per `(workspaceId, projectId, emailNormalized)`.
5. **Integration attribution (metadata + UI):** `attributes.integration.integrationId` + Website attribution panel + website/UTM filters.
6. **Source dictionary:** captures set `sourceId` to `lead_source.website` when active.
7. **UTM campaign string:** stored on lead; filterable; not CRM Campaign enrollment.

### What does **not** exist

- Separate MongoDB databases/collections per website.
- Project-level or website-level RBAC on memberships.
- First-class `website` / `form` / ads campaign entities beyond Integration + UTM strings.
- Per-website selective export UI (workspace export only).

### Enforcement model

| Control | Technical enforcement? | Notes |
|---------|------------------------|-------|
| Workspace isolation | Yes (API key hash) | — |
| Project field required | Yes (schema) | — |
| Default project configured | Yes when multi-project + locked | Create/update validation |
| Cannot post to other projects | Yes when override locked | `403 FORBIDDEN` |
| Users cannot see other projects’ leads | **No** | UI filter only |
| Website visible / filterable | Yes | Detail + list filters |

---

## 5. Evidence: separate projects vs one general bucket

| Question | Answer | Evidence |
|----------|--------|----------|
| One general undifferentiated bucket? | **No** — leads always have `projectId` | `models/lead.ts` requires `projectId`; capture resolves project or errors |
| Separate databases per website? | **No** — single workspace Lead collection | Schema + repositories |
| Stored in separate projects when configured? | **Yes**, via `defaultProjectId` / locked routing | Segregation tests + Settings UI |
| Source website clearly displayed? | **Yes** — Website attribution on lead detail | `lead-detail-panel.tsx` |
| Filter / report / export by website? | **Partial** — filter by website + UTM + project; export is workspace-wide admin JSON | leads list + `/export` |
| User defines destination per website? | **Yes** — Settings create/configure + public DTO | `integrations-panel.tsx`, `toIntegrationPublicRecord` |

**Test evidence summary (2026-07-28):**

```text
Existing website/integration unit tests: 46 passed
Multi-website segregation investigation: 13 passed
Combined: 59 passed
Log: /opt/cursor/artifacts/lead-integration-investigation-evidence.log
```

---

## 6. CRM configuration & usability

### Connecting a new website (**Exists**)

See **Current implementation protocol** above and `docs/website-lead-capture-setup.md`. Settings → Integrations supports create (name + default project), Configure (routing + mode-aware examples), pause/rotate/archive, and logs.

### Gaps affecting auditability / misconfiguration risk (post-remediation)

| Gap | Impact | Status |
|-----|--------|--------|
| Project-scoped memberships | Agents with `lead:read` can see all projects’ leads | **Missing** (deferred P2) |
| Selective per-website export UI | Admins use workspace export only | **Partial** |
| Humanized consent/status labels | Raw enums in some places | **Partial** (deferred P2) |
| lead:read-safe website name map | Custom roles without `settings:read` see warnings + raw ids | **Partial** (warning now shown) |

### Permissions relevant to leads

| Role | lead:read | Can restrict to one project? | Can manage integrations? |
|------|-----------|------------------------------|--------------------------|
| Owner/Admin | Yes | No | Yes (`settings:update`) |
| Agent | Yes | No | No (`settings:read` only) |
| Viewer | Yes | No | No |

---

## 7. Issues list (remaining after remediation)

### Technical

1. Duplicate email returns existing lead **without merging** new message/UTM into the record.
2. `propertyReference` never resolves to a Property document.
3. MLS / Google Ads / Meta Ads integrations are placeholders only.
4. No outbound webhook reliability (retries, DLQ) for CRM→site; inbound retries are caller-owned.

### Security

1. Long-lived static API keys (hashed at rest) — no OAuth / request signing.
2. No project-level authorization — any member with `lead:read` can access all project leads if they clear the UI filter or call the API without `projectId`.
3. Rate limit is IP + key based; no per-workspace anomaly alerting UI beyond integration logs.

### Usability

1. Humanize status/consent labels (deferred).
2. Custom roles without `settings:read` cannot populate website name filter (warning surfaced).

### Data governance / compliance

1. Webhook accepts optional consent but does not require it.
2. Export is workspace-wide (admin) — not a per-website selective lead export in the leads UI.

---

## 8. Professional CRM benchmark

Compared to common capabilities in HubSpot, Salesforce, Pipedrive, Dynamics, Zoho (real-estate CRM class):

| Capability | Industry norm | Evohome CRM today | Gap |
|------------|---------------|-------------------|-----|
| Lead-source attribution | Channel + campaign + form | Dictionary `website` + UTM + attribution UI | Low–Medium |
| Project / campaign segmentation | Native objects + reporting | Project hard; campaign = UTM string | Medium |
| Custom fields & mapping | Mapper UI per form | Fixed Zod schema; `attributes` bag | Medium |
| Multi-account / multi-project separation | Portals, teams, record sharing | Workspace + project lock; no sharing rules | High |
| API security | OAuth, scoped tokens, signing | Static hashed API key | Medium |
| Webhook reliability | Retries, signatures, DLQ | Rate limit + logs; no signature | Medium |
| Duplicate management | Configurable rules, merge UI | Per-project email unique + idempotency; no merge | Medium–High |
| Audit logs | Entity history | Integration + audit actions | Low–Medium |
| Consent / GDPR | Explicit capture & suppress | Optional `emailConsentStatus` on webhook | Medium |
| Error monitoring | Alerts / dashboards | Integration logs in settings | Medium |
| Integration documentation | Public developer docs | Setup guide + in-app protocol + `api-contracts.md` | Low–Medium |
| Scalability | Queues, async ingest | Sync request path; Mongo rate counters | Low for current scale |
| RBAC | Team / pipeline / record ACL | Workspace roles only | High for multi-project agencies |
| Reporting by source/website/campaign/project | Standard | Project + website + UTM filters; limited reports | Medium |

**Overall maturity:** Solid multi-project website capture with technical lock and attribution. Remaining enterprise gaps: project ACL, merge UI, OAuth/signing, selective export.

---

## 9. Prioritised recommendations (remaining)

### Critical

None open for the original segregation brief after remediation.

### High

1. Project-scoped memberships / record ACL for multi-project agencies.
2. lead:read-safe website name resolution (avoid `settings:read` dependency).

### Medium

3. Configurable duplicate merge (append message/UTM).
4. Resolve `propertyReference` to Property when unique.
5. Request signing (HMAC) or rotating short-lived tokens.
6. Per-project / per-integration selective export from leads UI.

### Low

7. Humanize consent/status labels.
8. First-class `form_id` / landing-page registry.
9. Embeddable form snippet / JS SDK.
10. Real MLS / Google Ads / Meta Ads inbound.

---

## 10. Proposed target architecture

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Website A    │   │ Website B    │   │ Website A    │
│ Form: Contact│   │ Form: Contact│   │ Form: Unit X │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │ key A            │ key B            │ key A
       │ project locked   │ project locked   │ form→project map
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────┐
│ Inbound Lead Gateway                                │
│ - Auth: API key (+ optional HMAC)                   │
│ - Resolve Integration → Workspace                   │
│ - Enforce project allowlist for that integration    │
│ - Map form_id / page / property → project           │
│ - Validate consent                                  │
│ - Dedupe policy (configurable: project|workspace)   │
│ - Idempotency                                       │
│ - Write IntegrationLog + metrics                    │
└──────────────────────────┬──────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────┐
│ Lead record                                         │
│ workspaceId | projectId | sourceId                  │
│ attribution: { websiteIntegrationId, formId,        │
│   campaignId?, propertyId?, utm, consent }          │
└──────────────────────────┬──────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────┐
│ CRM                                                 │
│ - Project & website filters (server-enforced ACLs)  │
│ - Attribution visible on every lead                 │
│ - Reports: website × project × campaign             │
│ - Admin matrix: Website ↔ allowed Projects          │
└─────────────────────────────────────────────────────┘
```

**Design principles**

1. Every lead is permanently attributed to **website integration + project + (optional) form/campaign/property**.
2. Routing is **technically enforced**, not trust-based on client-supplied project ids alone.
3. Several websites may feed one project when explicitly allowlisted; one website may feed multiple projects only via **server-side form→project maps**, not free client override (unless an admin opt-in).
4. Access control can restrict users to project subsets so leads are not exposed across projects.
5. Consent and duplicate policies are first-class configuration, not afterthoughts.

---

## Appendix A — Key source files

| File | Role |
|------|------|
| `app/api/integrations/website/leads/route.ts` | Public webhook |
| `server/services/website-lead-capture.ts` | Capture + project resolution |
| `server/validation/website-lead-capture.ts` | Payload schema |
| `server/services/integration-api-keys.ts` | Key generate/hash/parse |
| `server/services/integrations.ts` | CRUD; public DTO includes `defaultProjectId` + `allowProjectOverride` |
| `models/lead.ts` / `models/integration.ts` | Persistence |
| `components/settings/integrations-panel.tsx` | Connect websites UI + setup protocol |
| `components/leads/leads-panel.tsx` / `lead-detail-panel.tsx` | List/detail + attribution/filters |
| `docs/website-lead-capture-setup.md` | Canonical setup protocol |
| `components/layout/project-filter.tsx` | Global project UX filter |
| `server/permissions/roles.ts` | Workspace RBAC |
| `tests/unit/website-lead-multi-site-segregation.test.ts` | Practical multi-site tests |

## Appendix B — Existence summary (post-remediation)

| Question | Verdict |
|----------|---------|
| Can Website A send exclusively to Project A? | **Exists** when override locked + `defaultProjectId=A` |
| Can Website B send exclusively to Project B? | **Exists** (same pattern) |
| Can several websites feed the same project? | **Exists** |
| Can one website feed different projects by page/form/params? | **Exists** only when `allowProjectOverride` enabled |
| Separation enforced technically? | **Exists** for lock; override is admin opt-in |
| Risk of mix / misattribution / duplicate / exposure? | **Reduced** — lock + per-project email; remaining: no project ACL |
| Users filter/report/export/manage by website or project? | Project + website + UTM filter **Exists**; selective export **Partial** |
| Permissions prevent viewing other projects’ leads? | **Missing** (workspace roles only) |
