# Manual Lead Enrichment & Financial Situation

Feature-flagged, never automatic. Production stays disabled until `OPENAI_API_KEY` is set **and** the workspace toggle is on. Campaign enrollment, HubSpot GV/WD runners, consent, project membership, and lead status are out of scope.

## Product flow

1. Lead detail header **Enrich** CTA (`lead:enrich`). Hidden when the feature is off or the role cannot enrich.
2. Clicking **Enrich** starts public-web search immediately (default allowed sources: professional directories, company sites, news/press, registries). A short animated progress state is shown. There is no source-picker or per-field accept gate before results appear.
3. Search is meant to work like a broker Googling the person in the **project’s area**, not worldwide. The first queries are `name + project place` (Cressy / Confignon / canton Genève → **Geneva**) then `name + LinkedIn + place`. Also used: Swiss mobile, CRM city/country that was not itself enrichment-written, workspace `CHF`. Work-email domains search `name + domain`. A bare global name search is only a last fallback. Contact-data vendors are dropped. If the only hit is a person in another country than the project/phone market, identity is **ambiguous** and nothing is written.
4. Search-provider hits are synthesized server-side with OpenAI. Citations must come from retrieved https URLs (Tavily / Brave / OpenAI `web_search` annotations). Empty retrieval → failed run, no invented profile.
5. **Safe** suggestions (empty fields, or fields already owned by enrichment) are written onto the lead profile at once. CRM-entered / imported / website / API values are **kept** unless the user later chooses “Replace CRM value” on the profile.
6. On a unique match the dialog shows a brief “Profile filled” beat and **closes onto the lead**. Enriched fields pulse once. Each value has a violet **Enriched** badge, confidence %, rationale, source links, retrieval time, and model/search provenance. Users can edit, **Clear** a field, **Revert this enrichment**, or **Delete enrichment data**.
7. **What we know** is a cited summary stored on the lead. It is not a campaign, drip, status change, or outbound message.
8. If the operator has `lead:financial_update` and the profile now has job title plus city/region/country, Enrich also requests a labelled **occupational pay estimate** (typical pay for this role and market, e.g. a CTO at a company like Neho in Switzerland). That estimate **pre-fills working figures** on the financial tab (annual income = range midpoint, employment type from the job title, discussion budget ≈ 6× midpoint, source `occupational_estimate`) so a broker can gauge affordability and whether to pitch. Declared-by-lead / document / advisor values are not overwritten. Deposit and financing stay empty. This is not a credit or mortgage application. Snippet wage bands are preferred; if search has no numbers, a capped OpenAI occupational range is stored. Agents without financial permission still get the profile + summary only.

Ambiguous identity → run status `ambiguous`, **no suggestions**, no profile write; the dialog stays open with the reason. Missing verifiable source → confidence capped; high confidence is rejected.

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

Manual / import / website / API values are never overwritten without `overwriteAcknowledged`. Safe empty-field suggestions are auto-applied after a unique identity match because the user initiated Enrich.

### `LeadFinancialSituation` (`lead_financial_situations`)

Separate collection. Public-web Enrich does **not** scrape personal finances. After a unique match it may request an **occupational** pay band (job + location + similar-company context) and pre-fill **working figures** for the broker.

Working / manual fields: annual income/revenue, employment type, available deposit/equity, target budget/purchase price, financing need, existing commitments, affordability notes, currency, source (`declared_by_lead` \| `advisor` \| `document` \| `occupational_estimate` \| `other`), as-of date, confidence, assessor notes.

Occupational estimate payload (range, methodology, sources, confidence, reviewed flag) is also stored. Prefill uses the range midpoint as annual income and ~6× that as a discussion budget. Human-entered sources are never overwritten. Must never drive automated credit, mortgage, pricing, housing, or eligibility decisions.

History in `revisions[]`. Soft-delete `deletedAt`. Export via GET.

### Workspace settings (`Workspace.leadEnrichment`)

`enabled` (default **true**), `demoMode` (dry-run fixture), `retentionDays` (default 180). Turn off in Settings → Lead enrichment to hide the Enrich CTA.

Env: `OPENAI_API_KEY` (required for live Enrich), `TAVILY_API_KEY` (preferred web search — Bearer auth, country boost, contact-vendor domains excluded), `OPENAI_ENRICHMENT_MODEL`, `BRAVE_SEARCH_API_KEY`, `LEAD_ENRICHMENT_DEMO`. Settings → Lead enrichment shows whether Tavily is live. Dry-run / demo fixture must be off or Tavily is not called.

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
GET    /api/workspaces/:slug/leads/:id/enrichment         # lead:enrich (full runs) or lead:read (overlay + capability only)
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

Confidence is **source-quality / identity-match**, not a truth claim. Operators review badges, sources, and the summary on the profile. The workspace toggle defaults **on**; disable it in Settings to hide Enrich. Re-enabling requires the privacy/legal acknowledgement checkbox. Live search requires `OPENAI_API_KEY` on the server (demo mode otherwise uses fixtures only).

## Side-effect guard

Accept/revert/clear uses repository `updateLead` (no campaign auto-enrollment). Enrichment never changes status, consent, project membership, campaigns, or drips. Revoke restores previously accepted enrichment fields (newest run first), then marks runs revoked while keeping suggestion history for audit.
