# HubSpot → Evohome lead connector

Connect a HubSpot Private App so **new HubSpot contacts** become Evohome leads in a chosen project.

## What it does

- Evohome stores your HubSpot Private App **access token** + **client secret** (encrypted) and **portal / Hub ID**
- HubSpot sends `contact.creation` webhooks to Evohome
- Evohome verifies the HubSpot signature, fetches the contact, and creates a lead (deduped by HubSpot contact id and email-per-project)

## Setup

### 1. HubSpot Private App

1. HubSpot → **Settings → Integrations → Private Apps** (or Developer → Legacy/Private Apps)
2. Create an app with scope: `crm.objects.contacts.read`
3. Copy:
   - **Access token**
   - **Client secret** (for webhook signature v3)
   - **Hub ID / portal ID** (Settings → Account Defaults, or from the HubSpot URL)

### 2. Evohome

1. Settings → **Integrations** → **HubSpot CRM**
2. Paste access token, client secret, portal ID
3. Choose the destination **project**
4. Click **Connect HubSpot**
5. Copy the webhook URL shown:
   `https://<your-host>/api/integrations/hubspot/webhooks`

### 3. Subscribe HubSpot webhooks

In the same Private App → **Webhooks**:

1. Target URL = the Evohome webhook URL above
2. Subscribe to **`contact.creation`**
3. Save

## Notes

- Contacts without email **and** phone are skipped (logged)
- Duplicate HubSpot contact ids / same email in the project return the existing lead
- Pause the integration in Evohome to stop ingest without deleting credentials
- Historical contacts are **not** pulled automatically — use CSV **Imports** for backfill

## Security

- Tokens are stored in `Integration.credentialsEncrypted` (AES-256-GCM)
- Encryption key is derived from `NEXTAUTH_SECRET` (or `INTEGRATION_API_KEY_PEPPER`)
- Webhook signature uses HubSpot **v3** (`X-HubSpot-Signature-v3` + timestamp)
