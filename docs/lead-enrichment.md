# Manual Lead Enrichment & Financial Situation

Feature-flagged, never automatic. Production stays disabled until `OPENAI_API_KEY` is set **and** the workspace toggle is on. Campaign enrollment, HubSpot GV/WD runners, consent, project membership, and lead status are out of scope.

## Product flow

1. Lead detail header **Enrich** CTA (`lead:enrich`). Hidden when the feature is off or the role cannot enrich.
2. Review modal shows CRM-known fields (name, email, company, job title, industry, location) and lets the user pick allowed public-web source classes.
3. Search runs **only** after the user confirms. Query is **name + email only** (no phone, address, or financials).
4. Search-provider hits are synthesized server-side with OpenAI. The model may only cite provided results; it must not invent facts.
5. Field-level proposals appear before any save. Each proposal has value, confidence %, rationale, source URLs, retrieval time, and model/search provenance.
6. User accepts / rejects / edits per field. CRM-entered values require an explicit overwrite acknowledgement. Nothing is written silently.
7. Optional **Enrichment summary** is a cited, user-reviewed note. It is not a campaign, drip, status change, or outbound message.

Ambiguous identity → run status `ambiguous`, **no suggestions**. Missing verifiable source → confidence capped; high confidence is rejected.

## Data model

### `LeadEnrichmentRun` (`lead_enrichment_runs`)

Workspace-scoped. One document per manual run.

| Field | Purpose |
|-------|---------|
| `status` | `searching` \| `reviewing` \| `ambiguous` \| `failed` \| `accepted` \| `expired` \| `revoked` |
| `query` | `{ fullName, email, allowedSources[] }` |
| `searchProvider`, `aiModel` | Provenance |
| `retrievedAt`, `expiresAt` | Retention / re-enrichment |
| `identityMatch` | `unique` \| `ambiguous` \| `none` |
| `sources[]` | `{ url, title, retrievedAt, snippet }` |
| `suggestions[]` | Field proposals (below) |
| `summaryDraft` / `acceptedSummary` | Cited summary; accepted only after review |
| `demoMode` | Fixture / dry-run, no live providers |
| `revokedAt`, `revokedBy` | Delete/revoke |

### Suggestion

`id`, `fieldKey`, `proposedValue`, `currentValue`, `currentOrigin`, `confidencePercent`, `rationale`, `sourceUrls[]`, `retrievedAt`, `searchProvider`, `aiModel`, `status` (`proposed` \| `accepted` \| `rejected` \| `edited` \| `reverted` \| `revoked`), `acceptedValue`, `previousValue` + `previousProvenance` (for revert), `overwriteAcknowledged`, `decidedBy`, `decidedAt`.

### Lead writes on accept

Only after explicit accept, with `triggerAutomation: false`:

- Intelligence: `companyId` (via company name resolve), `jobTitle`, `industry`, `stateRegion`
- Optional structured: `city`, `country`, `professionalProfileUrl`
- Overlay on `attributes.webEnrichment`: `preferredContactClues`, `otherProfessional`, `summary`
- Provenance `method: "enrichment"`, `source: "manual_web_enrichment"`

Manual / import / website / API values are never overwritten without `overwriteAcknowledged`.

### `LeadFinancialSituation` (`lead_financial_situations`)

Separate collection. **Never** filled by public-web enrichment.

Manual fields: declared annual income/revenue, employment type, available deposit/equity, target budget/purchase price, financing need, existing commitments, affordability notes, currency, source, as-of date, confidence, assessor notes.

Optional **market-income estimate** (job + location only, not the person): range, methodology, sources, confidence, human-reviewed flag. Stored separately from declared figures. Must never drive credit, mortgage, pricing, housing, or eligibility decisions.

History in `revisions[]`. Soft-delete `deletedAt`. Export via GET.

### Workspace settings (`Workspace.leadEnrichment`)

`enabled` (default **false**), `demoMode` (dry-run fixture), `retentionDays` (default 180).

Env (optional, not production-required): `OPENAI_API_KEY`, `OPENAI_ENRICHMENT_MODEL`, `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, `LEAD_ENRICHMENT_DEMO`.

## Access

| Key | Owner/Admin | Agent | Viewer |
|-----|-------------|-------|--------|
| `lead:enrich` | yes | yes | no |
| `lead:enrich_revoke` | yes | no | no |
| `lead:financial_read` | yes | no | no |
| `lead:financial_update` | yes | no | no |
| `lead:financial_delete` | yes | no | no |

Financial permissions are **not** granted on project roles (workspace ceiling only).

## API

```txt
GET    /api/workspaces/:slug/settings/lead-enrichment
PATCH  /api/workspaces/:slug/settings/lead-enrichment     # settings:update
GET    /api/workspaces/:slug/leads/:id/enrichment         # lead:enrich or lead:read (accepted overlay only)
POST   /api/workspaces/:slug/leads/:id/enrichment         # lead:enrich — start run
POST   /api/workspaces/:slug/leads/:id/enrichment/:runId/decisions
POST   /api/workspaces/:slug/leads/:id/enrichment/:runId/revert
DELETE /api/workspaces/:slug/leads/:id/enrichment         # lead:enrich_revoke
GET    /api/workspaces/:slug/leads/:id/financial-situation
PATCH  /api/workspaces/:slug/leads/:id/financial-situation
POST   /api/workspaces/:slug/leads/:id/financial-situation/market-estimate
DELETE /api/workspaces/:slug/leads/:id/financial-situation
```

## Inclusion / exclusion policy (legal-privacy checkpoint)

**Include (public professional/business only):** employer, job title, industry, city/region/country of work, public professional profile or company website, public contact preference clues (e.g. “lists work email on company site”).

**Exclude:** credentials/secrets, government IDs, health data, exact home address, anyone appearing to be a minor, protected characteristics, private/social posts, unverified allegations, financial accounts, credit data, and anything not corroborated by a retrieved public URL.

Confidence is **source-quality / identity-match**, not a truth claim. Operators must review before accepting. Enablement in production requires a privacy/legal sign-off recorded in Settings (acknowledgement checkbox) plus `OPENAI_API_KEY` on the server.

## Side-effect guard

Accept/revert uses `updateLeadForWorkspace(..., { triggerAutomation: false })`. Enrichment never changes status, consent, project membership, campaigns, or drips.
