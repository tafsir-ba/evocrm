# Data Access Patterns — V1

Rules for database queries, workspace scoping, relationships, indexes, and archival behavior.

---

## Workspace Scope Rule

Every workspace-owned query **must** include the server-resolved `workspaceId`.

### Reject unsafe patterns

```ts
// UNSAFE — no workspace scope
Lead.findById(id)
Property.findById(id)
Opportunity.findById(id)
```

Unless immediately followed by strict workspace verification on the returned document, this pattern is forbidden.

### Preferred pattern

```ts
Lead.findOne(
  withWorkspaceScope(workspaceId, {
    _id: id,
  }),
)
```

`withWorkspaceScope()` lives at `/server/workspaces/with-workspace-scope.ts`. Pass only server-resolved `workspaceId` — never from the client body.

### List queries

```ts
Lead.find({
  workspaceId,
  archivedAt: null,
})
  .sort({ createdAt: -1 })
  .skip((page - 1) * pageSize)
  .limit(pageSize)
```

Always pass `workspaceId` from server resolution — never from client input.

---

## Client Workspace Rule

**Never accept workspace ownership from the client body.**

### Reject

```json
{
  "workspaceId": "client-provided-id",
  "firstName": "Jane"
}
```

The server resolves workspace from:

```txt
workspaceSlug (URL param)
authenticated user
active membership
```

If creating a record, set `workspaceId` in the service layer from resolved context. Strip any client-sent `workspaceId` from validated input.

---

## Cross-Workspace Relationship Rule

All foreign keys must reference entities in the **same workspace**.

| Field | Validation |
|-------|------------|
| `Property.projectId` | Project exists and `project.workspaceId === workspaceId` |
| `Opportunity.leadId` | Lead exists and `lead.workspaceId === workspaceId` |
| `Opportunity.propertyId` | Property exists and `property.workspaceId === workspaceId` |
| `Activity.opportunityId` | Opportunity in same workspace |
| `Activity.leadId` | Lead in same workspace |
| `Activity.propertyId` | Property in same workspace |
| `Document.linkedEntityId` | Linked entity exists in same workspace |
| `CampaignStep.documentIds[]` | Each document in same workspace |
| `CampaignEnrollment.leadId` | Lead in same workspace |
| `CampaignEnrollment.opportunityId` | Opportunity in same workspace |
| `Membership.roleId` | Role in same workspace |

Validate in the **service layer** before write. Return `VALIDATION_ERROR` or `NOT_FOUND` on mismatch.

---

## Repository Layer Conventions

Repositories accept `workspaceId` as a required first parameter or context object:

```ts
export async function findLeadById(
  ctx: { workspaceId: string },
  leadId: string,
) {
  return Lead.findOne({ _id: leadId, workspaceId: ctx.workspaceId });
}
```

Repositories do not resolve workspace or check permissions — that is the route/service responsibility.

---

## Update Patterns

### Partial updates

Use `$set` with validated fields only. Do not allow updating:

```txt
workspaceId
createdBy
uploadedBy
```

### Immutable fields

Reject or strip attempts to mutate:

```txt
createdBy
uploadedBy
workspaceId
```

### Assignment changes

`assignedTo` and `ownerId` may change via PATCH with appropriate permission.

---

## Archive Rule

V1 uses `archivedAt` for user-facing removal. Hard delete is not default behavior.

### Archive mutation

```ts
await Lead.updateOne(
  { _id: leadId, workspaceId },
  { $set: { archivedAt: new Date() } },
);
```

### Active list default

V1 convention: active records have `archivedAt: null`. Always set `archivedAt` on create.

```ts
{ workspaceId, archivedAt: null }
```

Do not use `{ $exists: false }` — missing field and `null` must not coexist.

### Unarchive (if supported)

Requires explicit permission and sets `archivedAt: null`. Not required for MVP but document if added.

---

## Index Guidance

Recommended MongoDB indexes:

### Universal

```txt
{ workspaceId: 1 }
{ workspaceId: 1, createdAt: -1 }
{ workspaceId: 1, archivedAt: 1 }
```

### Leads

```txt
{ workspaceId: 1, emailNormalized: 1 }
{ workspaceId: 1, statusId: 1 }
{ workspaceId: 1, assignedTo: 1 }
{ workspaceId: 1, fullName: "text", email: "text" }  // if text search
```

### Properties

```txt
{ workspaceId: 1, reference: 1 }
{ workspaceId: 1, statusId: 1 }
{ workspaceId: 1, projectId: 1 }
{ workspaceId: 1, assignedTo: 1 }
```

### Opportunities

```txt
{ workspaceId: 1, statusId: 1 }
{ workspaceId: 1, leadId: 1 }
{ workspaceId: 1, propertyId: 1 }
{ workspaceId: 1, assignedTo: 1 }
{ workspaceId: 1, expectedCloseDate: 1 }
```

### Activities

```txt
{ workspaceId: 1, dueDate: 1 }
{ workspaceId: 1, statusId: 1 }
{ workspaceId: 1, assignedTo: 1 }
{ workspaceId: 1, opportunityId: 1 }
```

### Documents

```txt
{ workspaceId: 1, linkedEntityType: 1, linkedEntityId: 1 }
{ workspaceId: 1, status: 1 }
```

### Campaigns

```txt
{ workspaceId: 1, campaignId: 1 }          // CampaignStep, Enrollment, Send
{ workspaceId: 1, status: 1 }              // Campaign
{ workspaceId: 1, nextSendAt: 1 }          // CampaignEnrollment — cron queries
```

### Tags

```txt
{ workspaceId: 1, archivedAt: 1 }
{ workspaceId: 1, name: 1 }
```

### Membership

```txt
{ userId: 1, workspaceId: 1 }              // unique compound
{ workspaceId: 1, status: 1 }
```

### Workspace

```txt
{ slug: 1 }                                 // unique
```

Review indexes when query patterns emerge in implementation phases.

---

## Pagination Pattern

```ts
const filter = { workspaceId, archivedAt: null };
const total = await Model.countDocuments(filter);
const data = await Model.find(filter)
  .sort(sort)
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .lean();
```

Never paginate without `workspaceId` in the filter.

---

## Aggregation / Dashboard Queries

Dashboard aggregations must always start with `$match: { workspaceId }`.

```ts
Opportunity.aggregate([
  { $match: { workspaceId, archivedAt: null } },
  { $group: { _id: "$statusId", count: { $sum: 1 } } },
]);
```

---

## Transaction Guidance

Use MongoDB transactions when a single user action spans multiple collections:

```txt
Opportunity status change → update opportunity + audit log
Campaign send → update enrollment + create send log
Member removal → update membership + audit log
```

Not every write needs a transaction; use when partial failure would corrupt state.

---

## Normalization Helpers

| Field | Rule |
|-------|------|
| `emailNormalized` | `email.trim().toLowerCase()` |
| `phoneNormalized` | Strip non-digits; store E.164 when possible |
| `fullName` | Derived from `firstName` + `lastName` on write |

Normalization happens in the service layer before repository persist.

---

## Anti-Patterns

| Anti-pattern | Why rejected |
|--------------|--------------|
| `findById` without workspace | Cross-tenant data leak |
| Client-sent `workspaceId` | Spoofing |
| Business logic in repository | Violates layering |
| Label-based status queries | Use `behavior` via dictionary lookup |
| Public document URLs in DB | Use `storageKey` + signed URLs |
| Loading all records for client filter | Backend must filter/search |
