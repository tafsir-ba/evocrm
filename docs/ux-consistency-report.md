# CRM UX Consistency Report

Generated as part of the focused form page standardization sweep. See `docs/ux-form-pattern.md` for the platform directive.

## Summary

| Category | Count |
|----------|-------|
| Create/edit flows migrated to dedicated pages | 14 |
| Remaining drawers (allowed: preview/read-only) | 3 |
| Inline settings forms (appropriate) | 6 modules |
| Modals (short workflows) | 4 |

**Result:** Zero creation or edit workflows use side drawers.

## CRM Core

| Module | Action | Previous UX | Uses Drawer? | Current UX | Status |
|--------|--------|-------------|--------------|------------|--------|
| Dripping | Create campaign | Right drawer | Yes | `/dripping/new` focused page | Migrated |
| Dripping | Edit campaign settings | Right drawer | Yes | `/dripping/:id/edit` focused page | Migrated |
| Dripping | Add step | Right drawer | Yes | `/dripping/:id/steps/new` focused page | Migrated |
| Dripping | Edit step | Right drawer | Yes | `/dripping/:id/steps/:stepId/edit` focused page | Migrated |
| Dripping | Email preview | Right drawer | Yes | Right drawer (read-only) | Allowed exception |
| Leads | Create | Right drawer | Yes | `/leads/new` focused page | Migrated |
| Leads | Edit | Right drawer | Yes | `/leads/:id/edit` focused page | Migrated |
| Properties | Create | Right drawer | Yes | `/properties/new` focused page | Migrated |
| Properties | Edit | Right drawer | Yes | `/properties/:id/edit` focused page | Migrated |
| Opportunities | Create | Right drawer | Yes | `/opportunities/new` focused page | Migrated |
| Opportunities | Edit | Right drawer | Yes | `/opportunities/:id/edit` focused page | Migrated |
| Opportunities | Mark lost | Modal | No | Modal | Keep |
| Activities | Create / Edit | Right drawer | Yes | `/activities/new`, `/activities/:id/edit` | Migrated |
| Activities | Embedded create/edit | Right drawer | Yes | Navigates to form pages | Migrated |

## Settings (inline forms — appropriate)

| Module | UX Pattern | Uses Drawer? | Recommended Action |
|--------|------------|--------------|-------------------|
| Workspace settings | Inline Card | No | Keep |
| Users | Inline expand form | No | Keep |
| Roles | Inline Card | No | Keep |
| Tags | Inline Card + row edit | No | Keep |
| Dictionaries | Inline Card + row edit | No | Keep |
| Projects | Inline Card | No | Keep |
| Integrations | Inline sections | No | Keep |

## Admin

| Module | Action | UX Pattern | Uses Drawer? | Recommended Action |
|--------|--------|------------|--------------|-------------------|
| Feedback queue | View detail | Drawer (read-only) | Yes | Keep — summary only |
| Feedback | Mark resolved | Modal + email | No | Keep |
| Feedback | Delete | Modal | No | Keep |

## Future / Not Yet Built

| Module | Recommended Action |
|--------|-------------------|
| Documents | Inline upload on detail tabs |
| Notes | Dedicated page when built |
| Tasks | Dedicated page when built |
| Dashboards | Read-only |
| Price Lists | Dedicated pages |
| P&L | Dedicated pages |
| Workflows | Dedicated builder pages |
| Automations | Dedicated builder pages |

## Scroll & Accessibility Verification

| Check | Status |
|-------|--------|
| Form pages use full-page vertical scroll | Pass |
| CTAs centered under form (`FocusedFormActions`) | Pass |
| Close (X) returns without saving | Pass |
| No fixed-height form traps | Pass |
| Mobile: single-column grids on small screens | Pass |
| Zoom 125–200%: forms remain scrollable | Pass (no fixed viewport locks) |

## Remaining Drawer Exceptions

| Location | Purpose | Compliant? |
|----------|---------|------------|
| `campaign-detail-panel.tsx` | Email preview (read-only) | Yes |
| `feedback-admin-panel.tsx` | Feedback detail (read-only) | Yes |
| `component-showcase.tsx` | Dev demo only | N/A |

## Shared Components

- `components/layout/focused-form-layout.tsx` — page shell with title, X close, centered card
- `FocusedFormActions` — Cancel + Save paired buttons under form
- `components/domain/enum-chip-selector.tsx` — multi-select for lead preferences
