# Roles and Permissions — V1

Server-side permission enforcement is mandatory. Frontend checks are UX only.

---

## Default Roles

| Role | Key | Purpose |
|------|-----|---------|
| Owner | `owner` | Full workspace control; billing; ownership transfer |
| Admin | `admin` | Full operational control except owner-only actions |
| Agent | `agent` | Day-to-day CRM operations |
| Viewer | `viewer` | Read-only access |

All roles are workspace-scoped (`Role.workspaceId`). System roles (`isSystem: true`) are seeded on workspace creation and cannot be deleted.

---

## Membership Statuses

| Status | Can access workspace data |
|--------|---------------------------|
| `active` | Yes |
| `invited` | No — pending acceptance |
| `suspended` | No |
| `removed` | No |

Only `active` memberships may call workspace APIs or view workspace UI.

---

## Permission Keys

Permissions are string keys stored on `Role.permissions[]`.

### Dashboard

| Key | Description |
|-----|-------------|
| `dashboard:read` | View dashboard metrics |

### Leads

| Key | Description |
|-----|-------------|
| `lead:create` | Create leads |
| `lead:read` | View leads |
| `lead:update` | Edit leads |
| `lead:archive` | Archive leads |

### Properties

| Key | Description |
|-----|-------------|
| `property:create` | Create properties |
| `property:read` | View properties |
| `property:update` | Edit properties |
| `property:archive` | Archive properties |

### Opportunities

| Key | Description |
|-----|-------------|
| `opportunity:create` | Create opportunities |
| `opportunity:read` | View opportunities / pipeline |
| `opportunity:update` | Edit opportunities; move pipeline stages |
| `opportunity:archive` | Archive opportunities |

### Activities

| Key | Description |
|-----|-------------|
| `activity:create` | Create activities |
| `activity:read` | View activities / timeline |
| `activity:update` | Edit activities; complete/cancel |
| `activity:archive` | Archive activities |

### Documents

| Key | Description |
|-----|-------------|
| `document:create` | Upload documents (presigned URL flow) — also requires linked entity read |
| `document:read` | View/download documents via signed URLs — also requires linked entity read |
| `document:archive` | Archive documents — also requires linked entity read |

### Campaigns (Dripping)

| Key | Description |
|-----|-------------|
| `campaign:create` | Create campaigns |
| `campaign:read` | View campaigns |
| `campaign:update` | Edit campaigns; enroll leads; restore archived campaigns |
| `campaign:archive` | Archive campaigns (soft) |
| `campaign:delete` | Permanently delete draft campaigns with zero enrollments |

### Settings

| Key | Description |
|-----|-------------|
| `settings:read` | View workspace settings |
| `settings:update` | Edit workspace settings, projects, dictionaries |
| `users:manage` | Invite, suspend, remove members |
| `roles:manage` | Edit role permissions (non-system constraints apply) |
| `billing:manage` | Billing and subscription (later phase) |

---

## Default Role Permission Matrix

| Permission | Owner | Admin | Agent | Viewer |
|------------|:-----:|:-----:|:-----:|:------:|
| `dashboard:read` | ✓ | ✓ | ✓ | ✓ |
| `lead:create` | ✓ | ✓ | ✓ | |
| `lead:read` | ✓ | ✓ | ✓ | ✓ |
| `lead:update` | ✓ | ✓ | ✓ | |
| `lead:archive` | ✓ | ✓ | | |
| `property:create` | ✓ | ✓ | | |
| `property:read` | ✓ | ✓ | ✓ | ✓ |
| `property:update` | ✓ | ✓ | | |
| `property:archive` | ✓ | ✓ | | |
| `opportunity:create` | ✓ | ✓ | ✓ | |
| `opportunity:read` | ✓ | ✓ | ✓ | ✓ |
| `opportunity:update` | ✓ | ✓ | ✓ | |
| `opportunity:archive` | ✓ | ✓ | | |
| `activity:create` | ✓ | ✓ | ✓ | |
| `activity:read` | ✓ | ✓ | ✓ | ✓ |
| `activity:update` | ✓ | ✓ | ✓ | |
| `activity:archive` | ✓ | ✓ | | |
| `document:create` | ✓ | ✓ | ✓ | |
| `document:read` | ✓ | ✓ | ✓ | ✓ |
| `document:archive` | ✓ | ✓ | | |
| `campaign:create` | ✓ | ✓ | | |
| `campaign:read` | ✓ | ✓ | ✓ | ✓ |
| `campaign:update` | ✓ | ✓ | | |
| `campaign:archive` | ✓ | ✓ | | |
| `campaign:delete` | ✓ | ✓ | | |
| `settings:read` | ✓ | ✓ | ✓ | ✓ |
| `settings:update` | ✓ | ✓ | | |
| `users:manage` | ✓ | ✓ | | |
| `roles:manage` | ✓ | ✓ | | |
| `billing:manage` | ✓ | ✓ | | |

Phase 2 seeds the matrix above via `/server/permissions/roles.ts` (`DEFAULT_ROLE_DEFINITIONS`) on every new workspace. Unknown permission strings are rejected by `/server/permissions/permissions.ts`.

---

## Server-Side Enforcement Rule

Every API route must:

1. Authenticate the user
2. Resolve workspace from slug
3. Load membership and verify `status === active`
4. Check required permission key(s) before mutation or sensitive read
5. Return `PERMISSION_DENIED` or `MEMBERSHIP_REQUIRED` on failure

**Reject any implementation where:**

```txt
UI hides an action but backend still allows unauthorized mutation
```

### Enforcement helper pattern (Phase 2 — implemented)

```ts
await requirePermission({
  userId,
  workspaceId,
  permission: "lead:update",
});
```

Permission checks live in server code only — never trust client-sent role or permission flags.

---

## Owner Protection (Phase 11 — implemented)

| Rule | Detail |
|------|--------|
| Owner-equivalent | Role with `key = owner` |
| Last owner guard | Cannot suspend, remove, or demote the last **active** owner membership |
| Reassignment required | Suspend/remove blocked when member has active `assignedTo` records — use `/reassign` first |
| System roles | `owner`, `admin`, `agent`, `viewer` are read-only; cannot be deleted |

Owner transfer to another user (changing who holds the owner role while keeping the workspace operational) is supported indirectly via reassignment of records plus role change, but explicit “transfer ownership” UI is not a separate flow in V1.

---

## Record-Level Access (V1)

V1 uses workspace-level permissions only. All agents with `lead:read` can read all leads in the workspace.

**Not in V1:** per-record private visibility, team-based record partitioning.

If record-level ACL is needed later, document as V2 scope.

---

## Frontend Permission Usage

Allowed:

- Hide nav items the user cannot access
- Disable buttons without permission
- Show `PermissionDenied` state

Not allowed as sole security:

- Relying on hidden UI to protect mutations
- Hardcoding role names for authorization decisions (use permission keys from session/API)

Session should expose resolved `permissions[]` for the current workspace membership.

---

## Audit Expectations

Sensitive permission-related actions should write `AuditLog` entries:

```txt
member.invited
member.removed
member.role_changed
role.updated
ownership.transferred
```
