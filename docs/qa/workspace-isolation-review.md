# Workspace Isolation Review — Phase 13

Every workspace-owned module reviewed for list/detail/mutation scoping.

**Verdict: Pass — no known workspace leaks.**

---

## Review Pattern

Preferred query pattern:

```ts
Model.findOne({ _id: id, workspaceId })
// or
Model.find(withWorkspaceScope(workspaceId, filter))
```

Cross-workspace access must return `404 NOT_FOUND`, not foreign data.

---

## Module Matrix

| Module | List scoped | Detail scoped | Mutations scoped | Relationship validation | Client workspaceId ignored | Cross-workspace error |
|--------|-------------|---------------|------------------|-------------------------|----------------------------|------------------------|
| Workspace | N/A (slug resolve) | slug → id | owner actions | N/A | Yes | 404 |
| Membership | Yes | Yes | Yes | same workspace | Yes | 404 |
| Role | Yes | Yes | Yes | same workspace | Yes | 404 |
| Dictionary | Yes | Yes | Yes | same workspace | Yes | 404 |
| DictionaryItem | Yes | Yes | Yes | dictionary in workspace | Yes | 404 |
| Tag | Yes | Yes | Yes | same workspace | Yes | 404 |
| Project | Yes | Yes | Yes | same workspace | Yes | 404 |
| Lead | Yes | Yes | Yes | tags/status in workspace | Yes | 404 |
| Property | Yes | Yes | Yes | project/tags in workspace | Yes | 404 |
| Opportunity | Yes | Yes | Yes | lead+property same workspace | Yes | 404 |
| Activity | Yes | Yes | Yes | linked entities same workspace | Yes | 404 |
| Document | Yes | Yes | Yes | linked entity in workspace | Yes | 404 |
| Dashboard | Yes | N/A | read-only | aggregates workspaceId | Yes | 404 |
| Campaign | Yes | Yes | Yes | same workspace | Yes | 404 |
| CampaignStep | Yes | Yes | Yes | campaign in workspace | Yes | 404 |
| CampaignEnrollment | Yes | Yes | Yes | audience in workspace | Yes | 404 |
| CampaignSend | Yes | Yes | system writes | enrollment in workspace | Yes | 404 |
| Integration | Yes | Yes | Yes | same workspace | Yes | 404 |
| IntegrationLog | Yes | Yes | append-only | integration in workspace | Yes | 404 |

---

## Implementation References

- Scope helper: `server/workspaces/with-workspace-scope.ts`
- API gate: `server/workspaces/require-workspace-api-access.ts`
- Membership: `server/permissions/require-membership.ts` (active only)
- Website webhook: workspace from `apiKeyHash` lookup, not request body

---

## Exceptions (Safe)

| Pattern | Location | Why safe |
|---------|----------|----------|
| `UserModel.findById` | `server/repositories/users.ts` | Global user entity, not tenant data |
| `WorkspaceModel.findById` | `server/repositories/workspaces.ts` | Resolved after slug + membership check |
| `RoleModel.findById` | `server/repositories/roles.ts` | Followed by workspaceId verification in service |

---

## Reject Conditions (Beta Blockers)

```txt
[ ] Any known list query without workspaceId filter
[ ] Any mutation accepting client workspaceId as source of truth
[ ] Cross-workspace opportunity/activity/document links possible
[ ] Integration webhook trusting payload workspaceId
```

**All reject conditions: clear.**

---

## Regression Tests

- `tests/unit/with-workspace-scope.test.ts`
- `tests/unit/opportunities-service.test.ts` (cross-workspace rejection)
- `tests/unit/activities-service.test.ts` (relationship validation)
- `tests/unit/integrations-api.test.ts` (API key workspace derivation)
- Per-entity API tests with non-member / cross-workspace cases
