# Environment Variables

Expected environment variables for the real estate CRM. **Do not commit real secrets.**

Copy to `.env.local` for local development. Production values set in deployment platform.

Phase 0 env validation must require **only Phase 0 variables**. Feature-specific variables become required when their phase is active — not before.

---

## Quick reference — Required from phase

| Variable | Required from | Notes |
|----------|---------------|-------|
| `NODE_ENV` | Phase 0 | `development`, `test`, or `production` |
| `NEXT_PUBLIC_APP_URL` | Phase 0 | Public app URL |
| `MONGODB_URI` | Phase 0 | Use `evocrm_test` DB for tests |
| `NEXTAUTH_URL` | Phase 2 | Auth.js callback base URL |
| `NEXTAUTH_SECRET` | Phase 2 | Session encryption secret |
| `GOOGLE_CLIENT_ID` | Phase 2 | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Phase 2 | Google OAuth |
| `DIGITALOCEAN_SPACES_ENDPOINT` | Phase 8 | Private bucket |
| `DIGITALOCEAN_SPACES_REGION` | Phase 8 | |
| `DIGITALOCEAN_SPACES_BUCKET` | Phase 8 | |
| `DIGITALOCEAN_SPACES_KEY` | Phase 8 | |
| `DIGITALOCEAN_SPACES_SECRET` | Phase 8 | |
| `RESEND_API_KEY` | Phase 10 | Campaign email |
| `EMAIL_FROM` | Phase 10 | Sender identity |
| `EMAIL_REPLY_TO` | Phase 10 | Reply-to |
| `CRON_SECRET` | Phase 10 | Campaign cron protection |
| `STRIPE_SECRET_KEY` | Phase 11 | Only if live billing implemented |
| `STRIPE_WEBHOOK_SECRET` | Phase 11 | Only if live billing implemented |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Phase 11 | Only if checkout UI added |

---

## Application

| Variable | Required from | Description |
|----------|---------------|-------------|
| `NODE_ENV` | Phase 0 | `development`, `test`, or `production` |
| `NEXT_PUBLIC_APP_URL` | Phase 0 | Public app URL (e.g. `http://localhost:3000`) |

---

## Database

| Variable | Required from | Description |
|----------|---------------|-------------|
| `MONGODB_URI` | Phase 0 | MongoDB connection string (use separate DB for test: `evocrm_test`) |

---

## Authentication (Auth.js / NextAuth)

| Variable | Required from | Description |
|----------|---------------|-------------|
| `NEXTAUTH_URL` | Phase 2 | Same as app URL for local; production URL in prod |
| `NEXTAUTH_SECRET` | Phase 2 | Random secret — `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Phase 2 | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Phase 2 | Google OAuth client secret |

Phase 0 and Phase 1 must boot without these configured. Phase 2 auth requires `NEXTAUTH_SECRET` and Google OAuth credentials at **production runtime** — the app fails closed if `NEXTAUTH_SECRET` is missing when `NODE_ENV=production`. Development and test may use local fallbacks. Production builds use a build-only placeholder during `next build` page collection; that placeholder is never used at runtime.

---

## File Storage (DigitalOcean Spaces)

| Variable | Required from | Description |
|----------|---------------|-------------|
| `DIGITALOCEAN_SPACES_ENDPOINT` | Phase 8 | Spaces endpoint URL |
| `DIGITALOCEAN_SPACES_REGION` | Phase 8 | Region (e.g. `nyc3`) |
| `DIGITALOCEAN_SPACES_BUCKET` | Phase 8 | Bucket name — must be **private** |
| `DIGITALOCEAN_SPACES_KEY` | Phase 8 | Spaces access key |
| `DIGITALOCEAN_SPACES_SECRET` | Phase 8 | Spaces secret key |

Access via signed URLs only. Not required before Phase 8.

---

## Email (Resend)

| Variable | Required from | Description |
|----------|---------------|-------------|
| `RESEND_API_KEY` | Phase 10 | Resend API key |
| `EMAIL_FROM` | Phase 10 | Default sender (e.g. `noreply@yourdomain.com`) |
| `EMAIL_REPLY_TO` | Phase 10 | Reply-to for campaign emails |

---

## Cron

| Variable | Required from | Description |
|----------|---------------|-------------|
| `CRON_SECRET` | Phase 10 | Bearer token for `POST /api/cron/campaigns/send-due` |

---

## Payments (Stripe)

| Variable | Required from | Description |
|----------|---------------|-------------|
| `STRIPE_SECRET_KEY` | Phase 11 | Only if live billing is implemented |
| `STRIPE_WEBHOOK_SECRET` | Phase 11 | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Phase 11 | Client-side key if checkout UI added |

---

## Example `.env.local` — Phase 0 minimum

```bash
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/evocrm
```

## Example `.env.local` — full (all phases)

```bash
# Phase 0
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/evocrm

# Phase 2
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-openssl-rand-base64-32
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret

# Phase 8
DIGITALOCEAN_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DIGITALOCEAN_SPACES_REGION=nyc3
DIGITALOCEAN_SPACES_BUCKET=evocrm-files
DIGITALOCEAN_SPACES_KEY=replace-with-spaces-key
DIGITALOCEAN_SPACES_SECRET=replace-with-spaces-secret

# Phase 10
RESEND_API_KEY=replace-with-resend-key
EMAIL_FROM=noreply@example.com
EMAIL_REPLY_TO=support@example.com
CRON_SECRET=replace-with-openssl-rand-base64-32

# Phase 11 (optional until billing)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Test Environment

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
