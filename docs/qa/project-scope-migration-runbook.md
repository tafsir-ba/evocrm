# Project scope migration runbook

Deploying commit `5a0c918` (and later) requires `projectId` on leads, properties, opportunities, activities, and lead-linked campaign enrollments.

**Hosting:** EvoCRM runs on **DigitalOcean App Platform** (managed app from Git), not a Droplet. You do not SSH into a VM to migrate. Run migration as a **one-off job** or from a trusted machine with the target `MONGODB_URI`.

**After `eebf33f`:** The web app tolerates legacy records missing `projectId` (no list 500), but migration is still required for correct project scoping and auto-enrollment.

## Preconditions

1. Confirm staging/production MongoDB backup is current (Atlas / managed DB).
2. Obtain `MONGODB_URI` for the target environment from **App Platform → app → Settings → App-Level Environment Variables** (or the attached database component).
3. Schedule a short maintenance window if the workspace is large (migration touches all CRM collections).

## Steps

### 1. Run migration (App Platform–compatible)

Pick **one** approach:

#### Option A — One-off Job on App Platform (recommended)

1. In the DO control panel, open your **App** → **Console** or add a **Job** component (same repo, same env vars as the web service).
2. Run:

```bash
npm run migrate:projects
```

3. For a single workspace:

```bash
npm run migrate:projects -- --workspace-id=<workspaceObjectId>
```

The job must use the **same** `MONGODB_URI` as the running web service.

#### Option B — Local machine against remote DB

From a developer machine (never commit the URI):

```bash
MONGODB_URI='mongodb+srv://...' npm run migrate:projects
MONGODB_URI='mongodb+srv://...' npm run verify:projects
```

Use the production or staging URI from App Platform env config.

#### Option C — Staging first, then production

1. Run migrate + verify on **staging** App / staging DB.
2. Deploy app to staging; smoke test.
3. Repeat migrate + verify on **production** DB.
4. Deploy app to production (push to `main` triggers App Platform build).

Optional explicit actor when creating the default project:

```bash
npm run migrate:projects -- --workspace-id=<workspaceObjectId> --actor-id=<userObjectId>
```

`--actor-id` is stored as `createdBy` only when a new default project (`reference: default`) is created. Prefer workspace owner or a known admin user.

### 2. Verify migration

```bash
npm run verify:projects
```

Or for one workspace:

```bash
npm run verify:projects -- --workspace-id=<workspaceObjectId>
```

Verification must report `ok: true` with zero missing counts for:

- leads
- properties
- opportunities
- activities
- campaign enrollments (lead-linked)

**Do not treat migration as complete if verification fails.**

### 3. Deploy application (App Platform)

Deployment is **automatic** on push to `main` (or your configured branch):

1. App Platform runs `npm ci` → `npm run build` → `npm run start`.
2. No manual `git push` on the server; the platform builds from Git.
3. Ensure the new build (`eebf33f` or later) is **Active** in App Platform → **Deployments**.

You may deploy the hotfix **before** migration (reads work), but still run migrate + verify on the shared database as soon as possible.

### 4. Post-deploy smoke tests

- Global project filter on Dashboard, Pipeline, Leads, Properties, Activities, Dripping
- Lead create (project required)
- Website lead capture:
  - single-project workspace auto-selects
  - multi-project workspace requires `projectId`, `projectReference`, or integration `defaultProjectId`
- Campaign auto-enrollment (new lead + lead update) including custom-field rules

## Rollback notes

- Migration assigns missing `projectId` values; it does not remove projects.
- Rolling back code without rolling back data leaves `projectId` populated (safe).
- Rolling back data without rolling back code will break reads — restore from backup instead.

## Website integration configuration

For workspaces with **multiple active projects**, configure website capture explicitly:

1. Set `defaultProjectId` on the website integration (PATCH `/api/workspaces/{slug}/integrations/{id}`), **or**
2. Send `projectId` or `projectReference` in each inbound lead payload.

Silent assignment to the first active project is **not** supported.
