# Permissions Review — Phase 13

Server-side enforcement review for all V1 permission keys.

**Verdict: Pass — backend enforces mutations; frontend is not security.**

---

## Permission Keys Reviewed

| Permission | Enforced on | API / service reference |
|------------|-------------|-------------------------|
| `dashboard:read` | Dashboard GET | `app/api/workspaces/[workspaceSlug]/dashboard/route.ts` |
| `lead:create` | Lead POST | `app/api/workspaces/[workspaceSlug]/leads/route.ts` |
| `lead:read` | Lead GET/list | leads routes |
| `lead:update` | Lead PATCH | leads `[leadId]/route.ts` |
| `lead:archive` | Lead DELETE | leads `[leadId]/route.ts` |
| `property:create` | Property POST | properties route |
| `property:read` | Property GET/list | properties routes |
| `property:update` | Property PATCH | properties `[propertyId]/route.ts` |
| `property:archive` | Property DELETE | properties `[propertyId]/route.ts` |
| `opportunity:create` | Opportunity POST | opportunities route |
| `opportunity:read` | Opportunity GET/list/pipeline | opportunities + pipeline routes |
| `opportunity:update` | Opportunity PATCH + stage | `[opportunityId]/route.ts`, `stage/route.ts` |
| `opportunity:archive` | Opportunity DELETE | `[opportunityId]/route.ts` |
| `activity:create` | Activity POST | activities route |
| `activity:read` | Activity GET/list | activities routes |
| `activity:update` | Activity PATCH/complete/cancel | activities routes |
| `activity:archive` | Activity DELETE | activities `[activityId]/route.ts` |
| `document:create` | Upload URL POST | documents upload route |
| `document:read` | List + signed URL | documents routes |
| `document:archive` | Document DELETE | documents `[documentId]/route.ts` |
| `campaign:create` | Campaign POST | campaigns route |
| `campaign:read` | Campaign GET/list | campaigns routes |
| `campaign:update` | Campaign PATCH, steps, enrollments | campaign sub-routes |
| `campaign:archive` | Campaign DELETE | campaigns `[campaignId]/route.ts` |
| `settings:read` | Settings GET, integrations list | settings/integrations routes |
| `settings:update` | Settings PATCH, integrations mutate, workspace export | settings/integrations/export routes |
| `users:manage` | Memberships CRUD, reassignment | members routes |
| `roles:manage` | Roles CRUD | roles routes |
| `billing:manage` | Billing shell | billing route |

---

## Membership Guards

| Check | Implementation |
|-------|----------------|
| Unauthenticated | `requireAuth()` → `401 UNAUTHENTICATED` |
| Non-member | `requireMembership()` → `403 MEMBERSHIP_REQUIRED` |
| Inactive member | Filtered in `requireMembership()` → `403` |
| Missing permission | `requirePermission()` → `403 PERMISSION_DENIED` |
| Unknown permission key | Rejected at `requirePermission()` allowlist |

---

## Owner Protection

- `server/permissions/owner-protection.ts`
- Cannot demote/remove last active owner
- Tested: `tests/unit/owner-protection.test.ts`

---

## Role Changes

- Require `roles:manage` or `users:manage` as applicable
- Audit logged on role/membership changes

---

## Frontend vs Backend

- Nav built from permissions in workspace context (`lib/v1-navigation.ts`)
- Hidden UI buttons are **not** security controls
- Direct API calls still require server permission checks

---

## Blocking Issues

_None._

---

## Manual Verification Checklist

```txt
[ ] Viewer cannot POST/PATCH/DELETE leads (403)
[ ] Agent can create lead but not manage roles (403 on roles route)
[ ] Owner can manage users and roles
[ ] Inactive member direct URL returns forbidden/redirect
[ ] settings:update can export; viewer/agent with settings:read only cannot
```

Automated coverage: `tests/unit/require-permission.test.ts`, per-API permission tests.
