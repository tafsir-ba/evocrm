# HubSpot → Evohome lead connector

Connect a HubSpot Private App so **new HubSpot contacts** become Evohome leads in a chosen project.

## What it does

- Evohome stores your HubSpot Private App **access token** + **client secret** (encrypted) and **portal / Hub ID**
- HubSpot sends `contact.creation` webhooks to Evohome
- Evohome verifies the HubSpot signature, fetches the contact, and creates a lead (deduped by HubSpot contact id and email-per-project)

## Historical migration (Phase 0–1)

Historical import is **project-by-project** and not enabled until mapping review.

1. Connect HubSpot with **access token + portal ID** (client secret optional for now)
2. Open the HubSpot integration → **Run capability probe**
3. **Refresh HubSpot projects**, then explicitly map each HubSpot project → Evohome project (or Skip)
4. Do **not** import until Phase 2 dry-run / Phase 3 pilot are approved

Companies are not a separate Evohome entity in V1; future pilot imports will store HubSpot company id/name on lead attributes/notes only.

Live signed webhooks remain deferred until a client secret is saved and webhook setup is approved.

## Notes

- Contacts without email **and** phone are skipped (logged)
- Duplicate HubSpot contact ids / same email in the project return the existing lead
- Pause the integration in Evohome to stop ingest without deleting credentials
- Historical contacts are **not** pulled automatically — use CSV **Imports** for backfill

## Security

- Tokens are stored in `Integration.credentialsEncrypted` (AES-256-GCM)
- Encryption key is derived from `NEXTAUTH_SECRET` (or `INTEGRATION_API_KEY_PEPPER`)
- Webhook signature uses HubSpot **v3** (`X-HubSpot-Signature-v3` + timestamp)
- Public webhook is IP rate-limited (60 req/min) and rejects bodies over 64 KB
- Missing/paused portal lookups return an opaque auth failure (no portal oracle)
