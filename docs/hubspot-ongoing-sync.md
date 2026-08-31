# HubSpot → EvoHome ongoing lead sync

Production-safe **ongoing** connector for genuinely new HubSpot contacts. This is **not** the GV/WD historical backfill.

Canonical operators: this document. Historical project-by-project import remains `docs/hubspot-lead-connector-setup.md` and `migrations/hubspot-wd-project/`.

---

## Status (durable checkpoint)

| Item | State |
|------|--------|
| Code + migrations/models | Prepared in this change |
| Unit tests (idempotency, order, create/update, reconcile, project conflict, multi-project, campaign guard, dates/source) | Required to pass before merge |
| Live webhook mutations | **Off** until release gate + verified dry-run |
| Reconciliation cron | **Off** by default (`HUBSPOT_ONGOING_SYNC_RECONCILE` must be `true`) |
| Legacy replay as “new” | Prevented by cutover watermark |
| Automatic campaign/drip enrollment from this sync | Never (`triggerAutomation: false`) |
| Notes / inbound engagement timeline | Separate workstream; **off** until its own dry-run + `HUBSPOT_NOTES_SYNC_RELEASE_GATE` |

Do not subscribe the production HubSpot app, import/backfill, or set the release gate to `enabled` without an explicit cutover.

---

## What this sync does

After (and during) migration, every **new** HubSpot contact that is in scope is created or updated in EvoHome with the lead contract below, attributed to the right project, and classified for analytics:

- Genuine **organic / website inbound** → `acquisitionChannel: organic_inbound`, original HubSpot `createdate` as inbound time, dictionary source `website` when available. These leads **may** later enter campaigns via CRM auto-enroll or an explicit manager action.
- HubSpot-sourced **non-organic** leads keep their actual analytics source (never labelled organic) and stay **blocked** from automatic dripping.
- GV/WD/CSV historical records stay `legacy_import` and never count as new acquisition.

---

## Architecture

```txt
HubSpot contact.creation / contact.propertyChange
        │ signed webhook (v3) — public route already exists
        ▼
Event ledger (HubSpotSyncEvent) — idempotent, no PII in reports
        │
        ├── release gate off / dry-run → ledger only (would_create / would_update)
        └── gate enabled + cursor.active + mutate flag
                ▼
        Plan (pure): watermark, source, project, fields, memberships, campaign
                ▼
        Create or non-destructive update (triggerAutomation: false)

Fallback: POST /api/cron/hubspot/reconcile (CRON_SECRET)
  searches HubSpot lastmodifieddate > cursor, same planner
```

Idempotency is keyed by **HubSpot contact ID** + **event/version timestamp** + **normalized email** (email is hashed in the event key; never stored on the ledger). Retries cannot duplicate contacts or memberships. Lead upsert never enrolls campaigns (`triggerAutomation: false`). **Notes/timeline is a separate gated workstream** (below).

---

## Lead contract

| Field | Source |
|-------|--------|
| Name | `firstname` / `lastname` |
| Email / phone | `email`, `phone` / `mobilephone` |
| Original received date | HubSpot `createdate` → `attributes.integration.sourceCreatedAt` / `receivedAt` |
| Sync time | `lastSyncedAt` only — never used as acquisition time |
| Source / provenance | Analytics source + `acquisitionChannel` + inbound `hubspot` |
| UTM / source fields | `utm_*` when present, else `hs_analytics_*` |
| Company | `company` → Company FK (same intelligence planner as CMP) |
| Industry, job title, state/region | `industry`, `jobtitle`, `state` / `hs_state_code` |
| Product | `product_intersted_in` stored, not used as a guess for EvoHome General |

---

## Project attribution (never guess)

1. **`wd_project` is authoritative.** Each token must match an explicit `HubSpotProjectMapping` with `status=mapped`.
2. Else **validated Product interested in / established mapping** (token equals a mapped HubSpot project id/slug, or CMP identity → mapped CMP CRM project).
3. Ordered **multi-project memberships** with first-listed / earliest `sourceOrder` as primary (native memberships). Manual memberships are not overwritten.
4. Conflicts, unmapped tokens, missing signal, or a destination that is EvoHome General / Grosvenor fallback → **park for review**. No write to EvoHome General.

**Email matching is after attribution.** The sync matches normalized email only inside the attributed destination project. Leads with the same email in other projects are ignored and never updated or reassigned. If more than one candidate remains in the destination project, the contact is parked (`email_ambiguous_in_project`) with no CRM write.

This sync does **not** apply the held ~2,380 historical multi-project cohort (`EVOHOME_APPLY_HELD_HUBSPOT_MULTI_PROJECT`).

---

## Cutover watermark

A `HubSpotSyncCursor` per integration stores:

- `cutoverAt` — HubSpot `createdate` **after** this instant may count as new acquisition
- `status` — `pending_cutover` → `dry_run_verified` → `active` / `paused`
- `lastReconciledModifiedAt` — **fixed** HubSpot `lastmodifieddate` filter for the current page sequence
- `lastReconciledAfter` — HubSpot paging token; valid only against that same filter
- `lastReconciledContactId` — durable id tie-break for equal timestamps
- `dryRunVerifiedAt` — required before activate

Contacts at or before `cutoverAt` that are **already** in CRM (migration idempotency key **or** email match in the destination project) may receive non-destructive field updates. Contacts at or before `cutoverAt` that are **not** in CRM are parked (`pre_cutover_not_imported`) — they are not created as new leads.

---

## Reconciliation paging (missed-event fallback)

Guarantees:

1. Search uses inclusive `lastmodifieddate GTE` the stored filter, sorted `lastmodifieddate` then `hs_object_id`.
2. While `nextAfter` is present, the **filter watermark does not move**. The next tick/page sends the same `GTE` value plus `after=nextAfter` from that result set.
3. The watermark and tie-break id advance **only** when `nextAfter` is null (sequence exhausted) **and** the page had zero failures (including ledger retries).
4. Equal timestamps are not skipped: inclusive `GTE` plus `lastReconciledContactId` (skip ids `<=` the last seen id at that exact timestamp).
5. Transient HubSpot/DB/mapping write failures mark the ledger `failed` (dead-letter after 5 attempts). Reconcile **retries failed/received ledger rows first** and **does not advance** the cursor, so those contacts remain retryable.

---

## Cutover dry-run

`--dry-run` **must** search HubSpot for post-watermark contacts (`createdate GT cutoverAt` OR `lastmodifieddate GTE cutoverAt`), then write per-contact ledger outcomes (`would_create` / `would_update` / `parked`). Passing an empty event list is invalid.

A dry-run that retrieves **zero** contacts is invalid: it cannot be saved as verified, and `--verify-dry-run` / `--activate` refuse. Set `--cutover-at=` so at least one staging/fixture contact is in the post-watermark window, then re-run.

---

## Release gates (must all be true to mutate CRM)

| Gate | Default | Meaning |
|------|---------|---------|
| `HUBSPOT_ONGOING_SYNC_RELEASE_GATE` | unset/`off` | `off` \| `dry-run` \| `enabled` |
| `HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE` | unset/`false` | Webhook may persist leads |
| `HUBSPOT_ONGOING_SYNC_RECONCILE` | unset/`false` | Internal reconcile worker + cron may run |
| Cursor `status=active` and `dryRunVerifiedAt` set | pending | Per-integration cutover |

Webhook **always** verifies the HubSpot signature when a client secret exists, and **always** ledgers the event. Mutations happen only when gates allow.

---

## Runtime credentials / configuration

Reuse the existing HubSpot Private App on the workspace integration (encrypted `accessToken`, `portalId` / `externalAccountId`, `clientSecret` for webhook v3).

| Item | Where | Notes |
|------|-------|-------|
| Access token | Integration credentials | Contacts read (+ search), companies read, projects read |
| Client secret | Integration credentials | Required to **verify** webhooks; saving it does **not** by itself enable mutations |
| Portal / Hub ID | `externalAccountId` | Routes the public webhook |
| Mapping inventory | Settings → HubSpot project mappings | Must be reviewed; unmapped slugs park |
| `NEXTAUTH_SECRET` or `INTEGRATION_API_KEY_PEPPER` | Env | Credential encryption |
| `CRON_SECRET` | Env | `POST /api/cron/hubspot/reconcile` |
| `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` | Env | Signature URI + internal cron |

Webhook URL (already public, signed):

```txt
POST /api/integrations/hubspot/webhooks
```

Subscribe in HubSpot only after dry-run: `contact.creation` and `contact.propertyChange`. Do not enable `contact.deletion` processing (this sync never auto-deletes CRM leads).

---

## Rollout steps

1. Deploy this code with all gates **off**. Confirm `npm run typecheck` / `lint` / `test` / `build`.
2. Confirm HubSpot project mappings for live slugs (wd_project). Unmapped → park, not General.
3. `npm run cutover:hubspot-ongoing -- --dry-run --cutover-at=<iso>` — searches HubSpot for post-watermark contacts, writes `would_create` / `would_update` / `parked` ledger rows, reports counts **without PII**. A zero-contact result is invalid and is not verifiable.
4. Spot-check parked conflicts. Fix mappings. Re-run dry-run until unexpected is zero (still a non-zero HubSpot result set).
5. `npm run cutover:hubspot-ongoing -- --verify-dry-run` — stamps `dryRunVerifiedAt` only if the last dry-run searched HubSpot and `received >= 1`.
6. Set env `HUBSPOT_ONGOING_SYNC_RELEASE_GATE=dry-run` in staging. Send a **fixture** webhook (or HubSpot test app). Confirm ledger, no CRM writes.
7. Create one staging contact **after** watermark with a mapped `wd_project` and organic source; set `HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE=true` **and** `RELEASE_GATE=enabled` **only on staging**. Confirm create, source, dates, no campaign enrollment.
8. Production: set cursor active via `npm run cutover:hubspot-ongoing -- --activate` (refuses unless verified). Then set `HUBSPOT_ONGOING_SYNC_RELEASE_GATE=enabled` and `HUBSPOT_ONGOING_SYNC_WEBHOOK_MUTATE=true`. Subscribe HubSpot webhooks.
9. Enable `HUBSPOT_ONGOING_SYNC_RECONCILE=true` for missed-event fallback (or schedule `POST /api/cron/hubspot/reconcile` with `CRON_SECRET`).
10. Watch ledger counts (created / updated / duplicate / parked / failed / dead_letter). No PII in logs.

Rollback: set `HUBSPOT_ONGOING_SYNC_RELEASE_GATE=off` and/or pause the HubSpot integration. Cursor remains; no automatic drip side effects.

---

## Observability

- `HubSpotSyncEvent` — durable per-event ledger (`received` → `processed` / `skipped` / `failed` / `dead_letter`)
- `HubSpotSyncCursor` — watermark + reconcile pointer + dry-run verification
- `IntegrationLog` + audit actions (`integration.hubspot_sync_*`) — counts and contact **ids** only
- Dead-letter after 5 failed attempts; reconcile retries `failed`/`received` ledger rows before paging and will not advance the watermark past a failed page

Reports never include name, email, or phone.

---

## Notes / inbound engagement workstream (distinct)

Synchronizes HubSpot **contact notes**, **form-submission messages**, and **permitted inbound email** onto the matching EvoHome lead as Activity type `Note` / `Email` on the timeline. This is not lead upsert and cannot change project, status, or source.

### Identity

1. HubSpot contact ID on the CRM lead (`attributes.integration.externalId` / `hubspot:contact:{id}`).
2. Safe fallback only: exactly one active workspace lead with that normalized email. If more than one lead shares the email (including multi-project), **park** — do not attach the note to anyone.

One HubSpot engagement → **one** EvoHome activity (`workspaceId` + `hubspotExternalActivityId` unique). Multi-project memberships do not fan-out duplicates.

### Privacy

**Include:** user-authored CRM notes, form `message` / form-labelled submissions, inbound email (`INCOMING` / `INCOMING_EMAIL`).

**Exclude:** empty bodies; HubSpot workflow/sequence/automation/import sources; outbound email; mailer-daemon / `hubspot.com` / noreply senders; generated “system” copy. HTML is stripped to readable text (max 5000 chars). Reports never include note bodies.

### Persistence

- Original HubSpot timestamp → Activity `createdAt` / `completedAt` (completed so they are history, not overdue tasks)
- External id + source/form labels + provenance on `attributes.integration`
- Replay-safe: existing `hubspotExternalActivityId` is a duplicate; the activity is not overwritten
- `triggerAutomation: false`; `assignedTo` null; lead project/status never patched

### Gates (independent of lead upsert)

| Gate | Default | Role |
|------|---------|------|
| `HUBSPOT_NOTES_SYNC_RELEASE_GATE` | `off` | `off` / `dry-run` / `enabled` |
| `HUBSPOT_NOTES_SYNC_INCREMENTAL` | off | After a successful lead upsert, sync that contact’s timeline |
| `HUBSPOT_NOTES_SYNC_BACKFILL` | off | Historical backfill of HubSpot-linked leads |
| `HUBSPOT_NOTES_SYNC_RECONCILE` | off | `POST /api/cron/hubspot/notes` missed-event search |
| Cursor `notesStatus=active` + `notesDryRunVerifiedAt` | pending | Per-integration notes cutover |

Private app also needs **notes read** and **emails read**. Missing scopes return empty lists (no CRM writes, no crash).

### Rollout

1. Keep notes gates **off** until lead sync dry-run is understood.
2. `npm run cutover:hubspot-notes -- --workspace-id=... --integration-id=... --dry-run` — scans HubSpot-linked CRM leads, fetches timeline items, writes `would_create` ledger rows. Must scan ≥ 1 contact.
3. `npm run cutover:hubspot-notes -- --verify-dry-run` then `--activate`.
4. Staging: `HUBSPOT_NOTES_SYNC_RELEASE_GATE=enabled` and `HUBSPOT_NOTES_SYNC_INCREMENTAL=true`. Confirm one inbound note/form/email on the lead timeline, **no** project/status change, **no** campaign enrollment.
5. Historical: `HUBSPOT_NOTES_SYNC_BACKFILL=true` and `npm run cutover:hubspot-notes -- --backfill` (refuses to mutate unless gate enabled + cursor active).
6. Optional: `HUBSPOT_NOTES_SYNC_RECONCILE=true` for `POST /api/cron/hubspot/notes`.

Rollback: `HUBSPOT_NOTES_SYNC_RELEASE_GATE=off`. Existing timeline notes remain; they are not deleted.

---

## Coordination (do not duplicate)

| Workstream | This sync |
|------------|-----------|
| WD/GV migration scripts | Unchanged; inbound sources `hubspot-wd-project` / `hubspot-gv-pilot` stay legacy |
| Multi-project native memberships | Reuses `planHubSpotMultiProjectMemberships` / `applyPlannedMembershipsToLead`; does not apply the held cohort |
| CMP lead intelligence | Same field contract + non-destructive apply rules |
| HubSpot notes / inbound engagement | Independent of lead upsert | Does not apply held multi-project cohort; one activity per HubSpot engagement id | Does not write lead intelligence fields | Timeline `createdAt` is HubSpot original time; not acquisition |

---

## Blockers (ops, not code)

- Production HubSpot **client secret** must be saved before signature verification can succeed.
- Explicit mapping review for any slug that should receive new leads.
- Human approval of dry-run before `RELEASE_GATE=enabled`.
- HubSpot app webhook subscription is **out of band** — this repo does not create HubSpot subscriptions.
