# Lead project membership runbook

Native multi-project contact membership is deployed. Contacts (leads) may belong to many projects; exactly one membership is primary. `Lead.projectId` remains the denormalized primary.

This change does **not** import the held HubSpot multi-project cohort (~2,380). That remains a dedicated follow-up.

## Backfill existing Evohome contacts

Idempotent. Creates a primary membership from the current `Lead.projectId` when no ordered history exists. Does not enroll campaigns or drips.

```bash
npm run migrate:lead-project-memberships -- --dry-run
npm run migrate:lead-project-memberships -- --actor-id=<userObjectId>
npm run migrate:lead-project-memberships -- --workspace-id=<workspaceObjectId> --actor-id=<userObjectId>
```

Apply requires a real `--actor-id` (24-character hex user ObjectId). Do not use a placeholder actor. The apply run syncs membership indexes and writes one audit log per scanned workspace.

Requires the same `MONGODB_URI` or `MONGO_URL` as the running app. If the URI has no database path, the runner defaults to `evocrm`. Safe to re-run.

## Held HubSpot multi-project contacts — do not run yet

The capability planner/apply path exists. The held cohort is gated.

Exact command for the **main HubSpot multi-project task only**:

```bash
EVOHOME_APPLY_HELD_HUBSPOT_MULTI_PROJECT=1 \
npm run migrate:hubspot-multi-project -- \
  --apply \
  --source=held-exceptions \
  --acknowledge-held-cohort=2380
```

Rules for that future task:

- Primary must be the earliest HubSpot association by membership date, then source order.
- Preserve ordered membership history and provenance.
- Do not enroll campaigns or drips from associations.
- Legacy HubSpot contacts remain excluded from automatic dripping.
- Do not use `migrate:hubspot-wd-project` to import `multi_project` exceptions.
