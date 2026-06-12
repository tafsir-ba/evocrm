# Product Scope — Real Estate CRM V1

## Product North Star

A real estate workspace can capture demand, manage supply, connect buyers to properties, track sales progress, drive follow-up, and report performance.

This is a **real estate CRM**, not a generic CRM. V1 is built around the core sales workflow for property professionals working inside a shared workspace.

---

## Core Product Loop

```txt
Lead enters
→ Property exists
→ Opportunity connects them
→ Activity drives follow-up
→ Pipeline shows progress
→ Dashboard proves performance
→ Dripping supports follow-up
```

Everything outside this loop waits unless explicitly included in an approved phase scope.

---

## Locked V1 Navigation

Only these primary navigation items are allowed in V1:

```txt
Dashboard
Pipeline
Leads
Properties
Activities
Dripping
Settings
```

No additional primary modules may be added without explicit product approval.

---

## Explicit Non-V1 Primary Modules

Do **not** add these as primary modules in V1:

```txt
Contacts
Companies
Reports
Tasks
Documents
Integrations
Client Portal
Projects
Opportunities
Calendar
Automations
Marketing
Billing
Users
Roles
```

### Clarifications

| Deferred module | V1 treatment |
|-----------------|--------------|
| Contacts | Leads for V1 |
| Tasks | Activity type (e.g. task, call, visit, email) |
| Documents | Embedded under Lead / Property / Opportunity / Dripping detail pages |
| Reports | Dashboard for V1 |
| Companies | Not a V1 model — Workspace is the account environment |
| Integrations | Settings/internal later, not primary nav in V1 |
| Projects | Settings-managed lightweight property grouping, not primary nav |
| Opportunities | Represented through Pipeline and entity detail pages |
| Users, Roles, Billing | Live inside Settings where relevant |

---

## Workspace / Project Structure

```txt
Workspace = the company/account/client environment
Project = optional real estate development/grouping
Company = not a separate V1 model
```

Approved hierarchy:

```txt
Workspace
  ├─ Projects
  └─ Properties
```

A property may optionally belong to a project.

Do **not** use:

```txt
Workspace → Company → Project → Properties
```

---

## V1 MVP Definition

The first sellable version supports:

```txt
User logs in
Creates/selects workspace
Creates/configures project
Creates lead
Creates property
Creates opportunity between lead and property
Moves opportunity through pipeline
Creates activities
Uploads documents
Views dashboard
Creates simple drip campaign
Manages users/settings
```

---

## Approved V1 Entities

Only these entities are allowed in V1:

```txt
User
Workspace
Membership
Role
Dictionary
DictionaryItem
Tag
Project
Lead
Property
Opportunity
Activity
Document
Campaign
CampaignStep
CampaignEnrollment
CampaignSend
AuditLog
Integration
IntegrationLog
```

### Optional / Delayed Entities

Do not create unless explicitly approved in a future phase:

```txt
Subscription
BillingPlan
Company
Contact
Report
ClientPortal
Commission
Contract
```

---

## Explicitly Delayed Features

The following are **not** in V1 scope:

```txt
advanced custom fields UI
complex automation builder
full MLS sync
AI lead scoring
WhatsApp
SMS
client portal
commission tracking
contract generation
full billing automation
advanced reports
Contacts module
Companies module
Documents module (as primary nav)
Tasks module
mobile app
Automations module
Marketing module
Advanced billing UI
```

If a feature is necessary but not listed in the current phase, document it as a question or limitation. Do not silently add it.

---

## Scope Control Rules

1. Do not improvise product scope.
2. Do not create new entities unless listed for the current phase.
3. Do not create new primary navigation modules.
4. Do not introduce generic CRM features early.
5. Implement only the approved phase scope.
6. Emergent designs phase-specific screens; Cursor implements approved scope only.

---

## Phase Roadmap Reference

| Phase | Scope |
|-------|-------|
| -1 | Product + Architecture Contract (docs only) |
| 0 | Foundation |
| 1 | Design System + App Shell |
| 2 | Auth / Workspace / Users / Membership / Base Permissions |
| 3 | Dictionaries / Tags / Statuses |
| 3.5 | Projects |
| 4 | Leads |
| 5 | Properties |
| 6 | Opportunities / Pipeline |
| 7 | Activities / Timeline |
| 8 | Documents / Files |
| 9 | Dashboard / Analytics |
| 10 | Dripping / Campaigns |
| 11 | Settings / Billing / Ownership |
| 12 | External Integrations |
| 13 | Hardening / Beta |
