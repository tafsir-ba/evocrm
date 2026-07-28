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

## Executive verdict

Leads are workspace- and project-scoped. Website integrations authenticate with per-integration API keys and are **locked to `defaultProjectId` by default** (`allowProjectOverride: false`). Cross-project payload targeting returns `403 FORBIDDEN` unless an admin enables override. Email uniqueness is **per project**. Attribution metadata (integration id, UTM, free-text source, property reference) is stored on the lead and shown in lead detail; leads list can filter by website integration and UTM campaign.

Remaining gaps (deferred P2): humanized status/consent labels; lead:read-safe integration name endpoint for custom roles without `settings:read`; making `projectId` required on low-level email lookup helpers.

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
        │ 7. Idempotency / email duplicate     │
        │ 8. Resolve projectId:                │
        │      payload.projectId               │
        │      → payload.projectReference      │
        │      → integration.defaultProjectId  │
        │      → sole active project           │
        │      → else VALIDATION_ERROR         │
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
        │ Filter: project (global), sourceId   │
        │ Detail: Source label + Project name  │
        │ (UTM / website name NOT shown)       │
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

1. **Workspace tenancy (hard):** API key → integration → `workspaceId`. Payload cannot choose another workspace.
2. **Project assignment (hard field, soft routing):** Every lead requires `projectId`. Indexes support `workspaceId + projectId` queries. Global UI `ProjectFilter` and list API `projectId` filter scope views.
3. **Integration attribution (soft metadata):** `attributes.integration.integrationId` permanently stores which website integration created the lead.
4. **Source dictionary:** All website captures set `sourceId` to `lead_source.website` when that dictionary item is active.
5. **Campaign-ish attribution:** UTM campaign string only — not CRM drip Campaign enrollment from the webhook.

### What does **not** exist

- Separate MongoDB databases or collections per website/project (**one Lead collection per deployment**).
- Hard binding of API key → only its `defaultProjectId`.
- Project-level or website-level RBAC on memberships.
- UI filter by integration / website / UTM / form.
- First-class `website`, `form`, or ads campaign entities for inbound capture.

### Enforcement model

| Control | Technical enforcement? | Or tags/manual only? |
|---------|------------------------|----------------------|
| Workspace isolation | Technical (API key hash) | — |
| Project field required | Technical (schema) | — |
| Correct default project | Partial — needs `defaultProjectId` or payload | Easy to misconfigure |
| Cannot post to other projects | **No** — payload can override | Relies on integrator discipline |
| Users cannot see other projects’ leads | **No** — UX filter only | Manual filter |
| Website visible on lead | Metadata stored | Manual inspection of attributes / export |

---

## 5. Evidence: separate projects vs one general bucket

| Question | Answer | Evidence |
|----------|--------|----------|
| One general undifferentiated bucket? | **No** — leads always have `projectId` | `models/lead.ts` requires `projectId`; capture resolves project or errors |
| Separate databases per website? | **No** — single workspace Lead collection | Schema + repositories |
| Stored in separate projects when configured? | **Yes**, when `defaultProjectId` or payload project is set | Segregation tests passed |
| Source website clearly displayed? | **Partial** — dictionary Source = “Website”; specific site name/UTM **not** in lead detail UI | `lead-detail-panel.tsx` shows Source label + Project only |
| Filter / report / export by website? | **Partial** — filter by project + dictionary source; export includes leads/attributes/integrations but not a website-specific export UI | leads list, dashboard sources, workspace export |
| User defines destination per website? | **Partial** — API `PATCH defaultProjectId`; **Settings UI does not expose it** | `integrations.ts` vs `integrations-panel.tsx` |

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

1. Settings → Integrations → create type `website` (name e.g. “Website Lead Capture”).
2. Copy one-time API key `evocrm_whk_…` and webhook URL.
3. Configure the external site to POST JSON with Bearer key.
4. Pause / resume / rotate / archive from UI; view recent logs.

### Gaps affecting auditability / misconfiguration risk

| Gap | Impact | Status |
|-----|--------|--------|
| No UI for `defaultProjectId` | Multi-project workspaces fail capture or require every form to send project | **Partial** |
| Public integration DTO omits `defaultProjectId` | Admins cannot see mapping in API/UI | **Partial** |
| Example payload omits `projectId` / `projectReference` | Docs/UI examples under-document routing | **Partial** |
| No website→project matrix screen | Hard to audit which site feeds which project | **Missing** |
| Lead detail hides integration metadata | Operators cannot see which site/campaign produced a lead | **Missing** |
| Membership has no project scope | Agents with `lead:read` see all projects’ leads | **Missing** |

### Permissions relevant to leads

| Role | lead:read | Can restrict to one project? | Can manage integrations? |
|------|-----------|------------------------------|--------------------------|
| Owner/Admin | Yes | No | Yes (`settings:update`) |
| Agent | Yes | No | No (settings:read only) |
| Viewer | Yes | No | No |

---

## 7. Issues list

### Technical

1. Integration API key is not locked to `defaultProjectId`; payload can retarget any workspace project.
2. Email uniqueness is workspace-scoped, not project-scoped → cross-project duplicate “hijack.”
3. Duplicate email returns existing lead **without merging** new message/UTM into the record.
4. `propertyReference` never resolves to a Property document.
5. MLS / Google Ads / Meta Ads integrations are placeholders only.
6. No outbound webhook reliability (retries, DLQ) for CRM→site; inbound retries are caller-owned.
7. Docs (`api-contracts.md` optional field list) omit `projectId` / `projectReference` despite code support.

### Security

1. Long-lived static API keys (hashed at rest) — no OAuth, no request signing, no key scoped permissions beyond “capture lead in this workspace.”
2. Cross-project injection via compromised or misconfigured site form (`projectId` override).
3. No project-level authorization — any member with `lead:read` can access all project leads if they clear/change the UI filter or call the API without `projectId`.
4. Rate limit is IP + key based (good) but no per-workspace quota / anomaly alerting UI beyond integration logs.

### Usability

1. Settings UI cannot set/view default project for a website integration.
2. Lead UI does not surface website name, UTM, external id, or form idempotency key.
3. No filter by integration / campaign UTM / form.
4. Example curl/payload incomplete for multi-project setups.

### Data governance / compliance

1. Webhook does not accept or require marketing consent; defaults to `unknown`.
2. No purpose-of-processing or lawful-basis capture on inbound leads.
3. Audit logs exist for receive/create/duplicate/fail (**Exists**) but operators lack an attribution audit view in the lead UI.
4. Export is workspace-wide (admin) — not a per-website/project selective lead export in the leads UI.

---

## 8. Professional CRM benchmark

Compared to common capabilities in HubSpot, Salesforce, Pipedrive, Dynamics, Zoho (real-estate CRM class):

| Capability | Industry norm | Evohome CRM today | Gap |
|------------|---------------|-------------------|-----|
| Lead-source attribution | Channel + campaign + form | Dictionary `website` + UTM in attributes | Medium — storage Partial, UI Missing |
| Project / campaign segmentation | Native objects + reporting | Project hard; campaign = UTM string | Medium–High |
| Custom fields & mapping | Mapper UI per form | Fixed Zod schema; `attributes` bag | Medium |
| Multi-account / multi-project separation | Portals, teams, record sharing | Workspace + project field; no sharing rules | High |
| API security | OAuth, scoped tokens, signing | Static hashed API key | Medium |
| Webhook reliability | Retries, signatures, DLQ | Rate limit + logs; no signature | Medium |
| Duplicate management | Configurable rules, merge UI | Email unique + idempotency; no merge | High |
| Audit logs | Entity history | Integration + audit actions | Low–Medium (exists, limited UI) |
| Consent / GDPR | Explicit capture & suppress | Field exists; webhook ignores | High |
| Error monitoring | Alerts / dashboards | Integration logs in settings | Medium |
| Integration documentation | Public developer docs | In-app example + internal `api-contracts.md` | Medium |
| Scalability | Queues, async ingest | Sync request path; Mongo rate counters | Low for current scale |
| RBAC | Team / pipeline / record ACL | Workspace roles only | High for multi-project agencies |
| Reporting by source/website/campaign/project | Standard | Project + dictionary source; not by website/UTM | Medium–High |

**Overall maturity:** Solid foundation for a single-agency multi-project CRM with website capture, but **below professional multi-site / multi-client separation standards** until project locking, attribution UI, consent, and access control are completed.

---

## 9. Prioritised recommendations

### Critical

1. **Lock website integrations to an allowlist of projects** (at minimum enforce `defaultProjectId` unless admin enables “allow payload project override”). Reject Website A → Project B by default.
2. **Revisit workspace-wide email uniqueness** for multi-project agencies: either scope uniqueness to project, or return a conflict that preserves intended project attribution instead of silently returning another project’s lead.
3. **Expose and require `defaultProjectId` in Settings UI** for every website integration in multi-project workspaces; show website→project mapping clearly.

### High

4. Surface `attributes.integration` on lead detail (website/integration name, UTM, externalId, propertyReference).
5. Add lead list filters: integrationId / website, UTM campaign.
6. Accept optional consent fields on the webhook; store and honour them for campaigns.
7. Document `projectId` / `projectReference` in public contracts and in-app examples.
8. Include `defaultProjectId` on `IntegrationPublicRecord` for auditability.

### Medium

9. Optional project-scoped memberships or “assigned projects” for agents/viewers.
10. Configurable duplicate rules + merge UI (message/UTM append on duplicate).
11. Resolve `propertyReference` to Property when unique within project/workspace.
12. Add request signing (HMAC) or rotating short-lived tokens for higher-security sites.
13. Per-project / per-integration selective export from leads UI.
14. Alerting when integration error rate spikes.

### Low

15. First-class `form_id` / landing-page registry.
16. Embeddable form snippet / JS SDK.
17. Implement real MLS / Google Ads / Meta Ads inbound (currently placeholders).
18. Async ingest queue for very high volume sites.

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
| `server/services/integrations.ts` | CRUD; public DTO omits defaultProjectId |
| `models/lead.ts` / `models/integration.ts` | Persistence |
| `components/settings/integrations-panel.tsx` | Connect websites UI |
| `components/leads/leads-panel.tsx` / `lead-detail-panel.tsx` | List/detail |
| `components/layout/project-filter.tsx` | Global project UX filter |
| `server/permissions/roles.ts` | Workspace RBAC |
| `tests/unit/website-lead-multi-site-segregation.test.ts` | Practical multi-site tests |

## Appendix B — Existence summary for investigation questions

| Question | Verdict |
|----------|---------|
| Can Website A send exclusively to Project A? | **Partial** — yes via `defaultProjectId`, but override possible |
| Can Website B send exclusively to Project B? | **Partial** — same |
| Can several websites feed the same project? | **Exists** |
| Can one website feed different projects by page/form/params? | **Exists** via payload (also the risk vector) |
| Separation enforced technically? | **Partial** — workspace hard; project soft/overridable |
| Risk of mix / misattribution / duplicate / exposure? | **Yes** — documented above |
| Users filter/report/export/manage by website or project? | Project **Exists**; website **Missing**/Partial |
| Permissions prevent viewing other projects’ leads? | **Missing** |
