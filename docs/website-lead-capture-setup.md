# Website lead capture — setup protocol

Canonical integrator and admin guide for connecting an external website to Evohome CRM.

This document matches current backend behavior (`allowProjectOverride` defaults to `false`, email uniqueness is per project). Prefer this over older investigation narrative text.

---

## Ordered setup (admin)

1. **Create the destination project**  
   Settings → Projects → create (or reuse) the project that should own these leads.

2. **Create the website integration**  
   Settings → Integrations → Website lead capture:
   - Name the connection (e.g. “Marketing site”).
   - Select **Default project**.
   - If the workspace has **more than one active project**, default project is **required**.
   - Create. Override starts **locked** (`allowProjectOverride: false`).

3. **Copy the API key immediately**  
   The raw key `evocrm_whk_…` is shown **once** on create (and again only after rotate). Store it in the website secret store.

4. **Keep override locked** unless one website must intentionally feed multiple projects.  
   Locked means Website A cannot post into Project B via payload.

5. **Wire the website form** to:
   ```txt
   POST /api/integrations/website/leads
   Authorization: Bearer <apiKey>
   ```
   Alternative header: `X-Integration-Key: <apiKey>`.

6. **Verify**  
   Submit a test lead → CRM Leads (filtered by project) → Settings → Integrations → Configure → Recent logs.

---

## Payload contract

### Required

| Field | Notes |
|-------|--------|
| `firstName` | string |
| `lastName` | string |
| `email` **or** `phone` | At least one required |

### Recommended

| Field | Notes |
|-------|--------|
| `idempotencyKey` / `externalId` | Prevents duplicate creates for retries |
| `message` | Stored as lead notes |
| `emailConsentStatus` | `unknown` \| `subscribed` \| `unsubscribed` |
| `utm` | Stored under `attributes.integration.utm` |
| `propertyReference` | Stored in attributes (not auto-linked to Property) |
| `source` | Free-text inbound source label |

### Project routing fields

| Mode | What to send |
|------|----------------|
| **Override locked (default)** | **Omit** `projectId` and `projectReference`. Lead goes to the integration default project (or the sole active project). |
| **Override enabled** | Send **either** `projectId` **or** `projectReference` (not both) for an active project in the same workspace. |

Sending a `projectId` that does not match the locked default returns **`403 FORBIDDEN`**.  
Sending a non-ObjectId `projectId` returns **`400 VALIDATION_ERROR`**.

### Minimal locked example

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@example.com",
  "idempotencyKey": "form-submit-123"
}
```

### Curl (locked)

```bash
curl -X POST 'https://<host>/api/integrations/website/leads' \
  -H 'Authorization: Bearer evocrm_whk_…' \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"John","lastName":"Smith","email":"john@example.com","idempotencyKey":"form-submit-123"}'
```

---

## Multi-website patterns

| Goal | How |
|------|-----|
| Website A → Project A only | Integration A with `defaultProjectId = A`, override locked |
| Website B → Project B only | Integration B with `defaultProjectId = B`, override locked |
| Several websites → same project | Multiple integrations sharing the same `defaultProjectId` |
| One website → multiple projects | Enable override on that integration; each form/page sends the correct `projectId` or `projectReference` |

---

## CRM management

| Action | Effect |
|--------|--------|
| Pause | Inbound requests return `403` (integration not active) |
| Resume | Capture resumes |
| Rotate API key | Old key stops working; copy the new key once |
| Archive | Integration retired |
| Configure routing | Change default project / override flag |

Leads list: filter by project (global filter), website integration, and UTM campaign.  
Lead detail: Website attribution section shows integration name, inbound source, UTM, property reference, external/idempotency ids, and consent.

---

## Ops / upgrades

- Existing deployments upgrading from workspace-scoped email uniqueness must run:
  ```bash
  npm run migrate:lead-email-index
  # optional: --dry-run
  ```
- Rate limit: 60 requests/minute per IP and per API-key hash.
- Max body: 64 KB.

---

## Related docs

- API reference: `docs/api-contracts.md` (Integrations / website lead capture)
- Domain model: `docs/domain-model.md` (Integration, Lead)
- Investigation history: `docs/investigations/website-lead-integration-report.md`
