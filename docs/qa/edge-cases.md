# Edge Cases — Phase 13

Behavior expectations by module for beta QA.

---

## Auth / Workspace

| Edge case | Expected behavior |
|-----------|-------------------|
| User without workspace | Redirect to `/workspaces`; can create workspace |
| User with multiple workspaces | Workspace picker lists all active memberships |
| Inactive membership direct URL | `403 MEMBERSHIP_REQUIRED` or safe redirect |
| Workspace slug not found | `404 WORKSPACE_NOT_FOUND` |
| Role missing permission | `403 PERMISSION_DENIED` on API; nav item hidden |

---

## Dictionaries / Tags

| Edge case | Expected behavior |
|-----------|-------------------|
| Dictionary item inactive | Cannot assign on create; existing records may retain until changed |
| Dictionary item system protected | Cannot delete; inactivate only where allowed |
| Tag archived | Excluded from default lists; existing entity links may remain |

---

## Leads

| Edge case | Expected behavior |
|-----------|-------------------|
| Duplicate email (active) | `409 CONFLICT` on create; warning/update rules per service |
| Missing email | Allowed; campaign sends skip missing email |
| Website lead duplicate email | Documented idempotency via integration attributes |

---

## Properties

| Edge case | Expected behavior |
|-----------|-------------------|
| Duplicate reference (active) | `409 CONFLICT` |
| Archived project in property form | Validation error on create/update if project archived |

---

## Opportunities

| Edge case | Expected behavior |
|-----------|-------------------|
| Cross-workspace lead/property | `VALIDATION_ERROR` / `NOT_FOUND` — rejected server-side |
| Lost without lost reason | `VALIDATION_ERROR` when moving to terminal_lost |
| Moving won/lost back to open | Blocked or requires explicit update rules per stage service |

---

## Activities

| Edge case | Expected behavior |
|-----------|-------------------|
| No linked entity | `VALIDATION_ERROR` — at least one of lead/property/opportunity required |
| Inconsistent opportunity/lead/property | Service validates relationships same workspace and consistency |
| Overdue completed activity | Excluded from overdue view; `completedAt` set on complete |

---

## Documents

| Edge case | Expected behavior |
|-----------|-------------------|
| Linked to archived entity | List may show; signed URL policy per implementation |
| Signed URL after archive | `NOT_FOUND` or forbidden for archived/failed documents |
| Storage upload failure | No active document record created |

---

## Campaigns

| Edge case | Expected behavior |
|-----------|-------------------|
| Lead missing email | Enrollment send skipped; logged |
| Unsubscribed lead | Skipped; `emailConsentStatus=unsubscribed` |
| Campaign paused | No sends; cron skips |
| Cron invalid secret | `401 UNAUTHENTICATED` |

---

## Integrations

| Edge case | Expected behavior |
|-----------|-------------------|
| Invalid API key | `401` / `403` — no lead created |
| Integration paused/archived | Payload rejected |
| Website lead duplicate email | Safe duplicate handling per integration idempotency key |

---

## Settings / Ownership

| Edge case | Expected behavior |
|-----------|-------------------|
| Reassignment removing assigned user | Summary shown; records reassigned or unassigned per rules |
| Last owner removal | `403` / validation error — blocked |

---

## Export

| Edge case | Expected behavior |
|-----------|-------------------|
| Export without settings:read | `403 PERMISSION_DENIED` |
| Large workspace | Synchronous JSON; may be slow — monitor |

---

## Test Coverage References

- `tests/unit/opportunities-service.test.ts` — lost reason, cross-workspace
- `tests/unit/activities-service.test.ts` — overdue, relationships
- `tests/unit/campaign-unsubscribe.test.ts` — token validation
- `tests/unit/integrations-api.test.ts` — API key, rate limit
- `tests/unit/owner-protection.test.ts` — last owner
