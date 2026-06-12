# evocrm

Evohome CRM — real estate workspace SaaS (V1).

## Status

Phase 2 complete: Google auth (Auth.js v5), workspace creation/selection, membership + role permissions, permission-aware navigation, and protected routes. Phase 1 UI shell remains with mock-data placeholder pages for CRM modules. Next: Phase 3 — Dictionaries / Tags / Statuses.

## Documentation

| Doc | Purpose |
|-----|---------|
| [product-scope.md](docs/product-scope.md) | V1 scope, nav, MVP, delayed features |
| [domain-model.md](docs/domain-model.md) | Entities, fields, status behavior |
| [architecture-decisions.md](docs/architecture-decisions.md) | Stack, layering, workspace strategy |
| [api-contracts.md](docs/api-contracts.md) | API shapes, endpoints, error codes |
| [roles-permissions.md](docs/roles-permissions.md) | Roles, permission keys, enforcement |
| [data-access-patterns.md](docs/data-access-patterns.md) | Workspace scoping, indexes, archive |
| [testing-strategy.md](docs/testing-strategy.md) | Test types, phase expectations |
| [security-baseline.md](docs/security-baseline.md) | Auth, files, campaigns, cron |
| [qa-checklist.md](docs/qa-checklist.md) | Codex review checklist |
| [env.example.md](docs/env.example.md) | Environment variables |
| [release-gates.md](docs/release-gates.md) | Merge and beta gates |

## Development gates (every phase)

```txt
npm run typecheck
npm run lint
npm run test
npm run build
```

Available after Phase 0 scaffold.
