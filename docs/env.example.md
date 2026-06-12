# Environment Variables

Expected environment variables for the real estate CRM. **Do not commit real secrets.**

Copy to `.env.local` for local development. Production values set in deployment platform.

---

## Application

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL (e.g. `http://localhost:3000`) |

---

## Authentication (Auth.js / NextAuth)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_URL` | Yes | Same as app URL for local; production URL in prod |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption — generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |

---

## Database

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string (use separate DB for test: `evocrm_test`) |

---

## File Storage (DigitalOcean Spaces)

| Variable | Required | Description |
|----------|----------|-------------|
| `DIGITALOCEAN_SPACES_ENDPOINT` | Yes | Spaces endpoint URL |
| `DIGITALOCEAN_SPACES_REGION` | Yes | Region (e.g. `nyc3`) |
| `DIGITALOCEAN_SPACES_BUCKET` | Yes | Bucket name |
| `DIGITALOCEAN_SPACES_KEY` | Yes | Spaces access key |
| `DIGITALOCEAN_SPACES_SECRET` | Yes | Spaces secret key |

Bucket must be **private**. Access via signed URLs only.

---

## Email (Resend)

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes (Phase 10+) | Resend API key |
| `EMAIL_FROM` | Yes (Phase 10+) | Default sender address (e.g. `noreply@yourdomain.com`) |
| `EMAIL_REPLY_TO` | Yes (Phase 10+) | Reply-to address for campaign emails |

---

## Cron

| Variable | Required | Description |
|----------|----------|-------------|
| `CRON_SECRET` | Yes (Phase 10+) | Bearer token protecting cron endpoints — generate with `openssl rand -base64 32` |

Used by:

```txt
POST /api/cron/campaigns/send-due
```

---

## Payments (Stripe) — Later / Optional

Not required for early phases. Needed for Phase 11 billing.

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Later | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Later | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Later | Client-side Stripe key (if checkout UI added) |

---

## Example `.env.local` (placeholders only)

```bash
# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Auth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret

# Database
MONGODB_URI=mongodb://localhost:27017/evocrm

# DigitalOcean Spaces
DIGITALOCEAN_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DIGITALOCEAN_SPACES_REGION=nyc3
DIGITALOCEAN_SPACES_BUCKET=evocrm-files
DIGITALOCEAN_SPACES_KEY=replace-with-spaces-key
DIGITALOCEAN_SPACES_SECRET=replace-with-spaces-secret

# Email (Phase 10+)
RESEND_API_KEY=replace-with-resend-key
EMAIL_FROM=noreply@example.com
EMAIL_REPLY_TO=support@example.com

# Cron (Phase 10+)
CRON_SECRET=replace-with-openssl-rand-base64-32

# Stripe (Phase 11+ — optional until billing)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Test Environment

For CI and local tests:

```bash
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/evocrm_test
```

Other variables may use test doubles or mocks per `/docs/testing-strategy.md`.

---

## Security Notes

- Never commit `.env`, `.env.local`, or real credentials
- Rotate secrets if exposed
- Use different secrets per environment (dev/staging/prod)
- `CRON_SECRET` and `NEXTAUTH_SECRET` must be cryptographically random
