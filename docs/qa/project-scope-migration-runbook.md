# Project scope migration runbook

Deploying commit `5a0c918` (and later) requires `projectId` on leads, properties, opportunities, activities, and lead-linked campaign enrollments. **Do not deploy application code before migration completes** on the target database.

## Preconditions

1. Confirm staging/production backup is current.
2. Confirm `MONGODB_URI` points at the target environment.
3. Schedule a maintenance window if the workspace is large (migration touches all CRM collections).

## Steps

### 1. Run migration

All workspaces (uses each workspace `createdBy` as default-project actor):

```bash
npm run migrate:projects
```

Single workspace:

```bash
npm run migrate:projects -- --workspace-id=<workspaceObjectId>
```

Optional explicit actor when creating the default project:

```bash
npm run migrate:projects -- --workspace-id=<workspaceObjectId> --actor-id=<userObjectId>
```

`--actor-id` is stored as `createdBy` only when a new default project (`reference: default`) is created. Prefer workspace owner or a known admin user — **do not use random ObjectIds**.

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

**Do not deploy if verification fails.**

### 3. Deploy application

Deploy only after verification passes on staging, then repeat verify on production post-migration before production deploy.

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
