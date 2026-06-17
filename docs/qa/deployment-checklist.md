# Deployment Checklist — Phase 13 Beta

Use for DigitalOcean App Platform or equivalent Node hosting.

---

## Runtime

| Item | Value |
|------|-------|
| Node version | 22.x LTS (or 20.x LTS) |
| Package manager | npm |
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm run start` |

---

## Required Environment Variables

### Always required

```txt
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
MONGODB_URI=mongodb+srv://...
```

### Auth (required in production)

```txt
NEXTAUTH_URL=https://your-app-domain.com
NEXTAUTH_SECRET=<strong-random-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
```

### Storage (required for documents)

```txt
DIGITALOCEAN_SPACES_ENDPOINT=https://<region>.digitaloceanspaces.com
DIGITALOCEAN_SPACES_REGION=<region>
DIGITALOCEAN_SPACES_BUCKET=<bucket>
DIGITALOCEAN_SPACES_KEY=<spaces-key>
DIGITALOCEAN_SPACES_SECRET=<spaces-secret>
```

### Email / cron (required for campaigns)

```txt
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=noreply@your-verified-domain.com
EMAIL_REPLY_TO=support@your-domain.com
CRON_SECRET=<strong-random-secret>
```

### Optional (Phase 11 shell)

```txt
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

### Seed (dev/staging only — not production)

```txt
SEED_DEMO_PASSWORD=<optional-demo-password>
```

Production startup **fails fast** if required production keys are missing (`server/env.ts`).

---

## Pre-Deploy Checks

```txt
[ ] MongoDB reachable from app network
[ ] Indexes created (Mongoose ensures on first connect)
[ ] Google OAuth redirect URIs include NEXTAUTH_URL callback
[ ] Resend domain verified for EMAIL_FROM
[ ] Spaces bucket private; CORS if direct browser upload
[ ] CRON job scheduled: POST /api/cron/campaigns/send-due with Authorization: Bearer $CRON_SECRET
    (or rely on built-in internal cron — enabled by default in production when CRON_SECRET is set;
     disable with CAMPAIGN_CRON_INTERNAL=false if using an external scheduler)
[ ] Website integration URL documented for clients: POST /api/integrations/website/leads
```

---

## Database

```txt
[ ] Connection string uses TLS
[ ] Backup policy enabled (MongoDB Atlas / DO managed DB)
[ ] Run npm run seed on staging only (optional demo workspace)
```

Default dictionaries seed automatically on workspace creation via `ensureDefaultDictionaries()`.

---

## Smoke Test Steps (post-deploy)

```txt
1. Login (Google or credentials)
2. Create or select workspace
3. Create lead + property + opportunity
4. Move pipeline stage
5. Create and complete activity
6. Upload document (if Spaces configured)
7. Load dashboard metrics
8. Create paused campaign with step
9. Test unsubscribe link from campaign email (if Resend live)
10. POST website lead with integration API key
11. GET /api/workspaces/{slug}/export as owner
12. Logout
13. Quick mobile width check on pipeline
```

---

## Rollback Steps

```txt
1. Redeploy previous successful build
2. Confirm health: GET /login returns 200
3. Confirm auth callback works
4. Spot-check one workspace CRUD path
5. Verify cron job still uses same CRON_SECRET
```

---

## Monitoring / Error Tracking

```txt
[ ] Platform logs aggregated
[ ] captureError JSON lines visible in server logs
[ ] Optional: wire Sentry DSN (recommended post-beta)
[ ] Alert on 5xx spike on /api/workspaces/*
```

---

## Backup / Export

```txt
[ ] MongoDB provider backups enabled
[ ] Admin runbook: GET /api/workspaces/{slug}/export (settings:update)
[ ] Export excludes API keys, storage keys, signed URLs
```

---

## Security Final Checks

```txt
[ ] No secrets in NEXT_PUBLIC_* vars
[ ] CRON_SECRET not committed
[ ] Integration API keys rotated after staging tests
[ ] Public paths limited to auth, unsubscribe, website webhook
```
