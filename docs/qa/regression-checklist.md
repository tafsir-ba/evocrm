# Regression Checklist — Phase 13

Manual and automated regression for beta. Each item: role, steps, expected result, automation.

---

## Auth

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Anonymous | Visit `/` | Redirect to `/login` | `tests/e2e/smoke.spec.ts` |
| Anonymous | Visit `/workspaces` | Redirect to `/login` | E2E smoke |
| New user | Sign up with credentials | Account created, redirect workspaces | Manual |
| User | Logout | Session cleared, redirect login | Manual |

---

## Workspace Switching

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Multi-workspace user | Open `/workspaces`, select workspace | Lands on dashboard | Manual |
| Member | Switch slug in URL to other workspace | 403/404 if not member | `tests/unit/require-membership.test.ts` |

---

## Roles / Permissions

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Viewer | POST lead | 403 | API unit tests |
| Agent | POST lead | 201 | `tests/unit/leads-api.test.ts` |
| Owner | Manage roles | 200 | `tests/unit/roles-api.test.ts` |

---

## Settings

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Owner | GET settings | 200 | settings API tests |
| Owner | GET export | JSON bundle, no secrets | Manual + export sanitize tests |
| Viewer | PATCH settings | 403 | Manual |

---

## Dictionaries / Tags

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Admin | Create tag | 201 | `tests/unit/tags-service.test.ts` |
| Admin | Inactivate dictionary item | Item inactive, audit logged | dictionary tests |

---

## Projects

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create project in Settings | 201 | `tests/unit/projects-service.test.ts` |
| Agent | Archive project | archivedAt set | projects API tests |

---

## Leads

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create/edit/archive lead | CRUD works, workspace scoped | leads service + API tests |
| Agent | Duplicate email | 409 | `tests/unit/leads-service.test.ts` |

---

## Properties

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create property linked to project | 201 | properties tests |
| Agent | Duplicate reference | 409 | properties service tests |

---

## Opportunities

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create opportunity lead+property | 201 | opportunities tests |
| Agent | Cross-workspace IDs | Rejected | opportunities service tests |

---

## Pipeline

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Move stage | Status updated, totals correct | `tests/unit/pipeline-service.test.ts` |
| Agent | Move to lost without reason | 400 validation | opportunities stage tests |

---

## Activities

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create, complete, cancel | Status behavior correct | activities service tests |
| Agent | Overdue view | Completed excluded | `tests/unit/activity-status.test.ts` |

---

## Documents

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Upload flow | Presigned URL, metadata only | documents API tests |
| Viewer | Signed URL without permission | 403 | documents API tests |

---

## Dashboard

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Member with dashboard:read | Load dashboard | Metrics from backend | dashboard service tests |
| Viewer without permission | API call | 403 | dashboard API tests |

---

## Dripping / Campaigns

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Create campaign + step | Draft campaign | campaign tests |
| Public | Unsubscribe with valid token | Lead unsubscribed | `tests/unit/campaign-unsubscribe.test.ts` |
| Cron | POST without secret | 401 | E2E smoke + cron tests |

---

## Integrations / Webhooks

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Public | POST website lead no key | 401/403 | E2E + integrations API tests |
| Public | POST with valid key | Lead created | `tests/unit/website-lead-capture-service.test.ts` |
| Admin | Rotate API key | New key once, hash stored | integration API key tests |

---

## Mobile / Responsive

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Any | Open pipeline on narrow viewport | Usable layout, no horizontal overflow | Manual |

---

## Error / Empty / Loading States

| Role | Steps | Expected | Automation |
|------|-------|----------|------------|
| Agent | Empty lead list | Empty state component | UI tests partial |
| Any | Invalid API id | Structured error JSON | `tests/unit/errors.test.ts` |

---

## Required Commands (automated gate)

```txt
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```
