# Phase 15 — Overlay scroll-trap fix matrix

Commit: `1a06f89` — Fix overlay scroll traps by constraining drawer and modal layout.

This matrix maps every overlay surface to its fix path and QA status.

## Legend

| QA status | Meaning |
|-----------|---------|
| **Unit** | Covered by `tests/unit/overlay-components.test.tsx` (DOM class contract only) |
| **E2E** | Covered by `tests/e2e/overlay-layout.spec.ts` (real browser layout; requires MongoDB) |
| **Manual** | Requires human browser pass — see `phase-15-overlay-manual-qa.md` |
| **Inherit** | No direct file change; inherits primitive fix |

## Primitives

| Surface | File | Change type | QA status | Notes |
|---------|------|-------------|-----------|-------|
| Modal primitive | `components/ui/modal.tsx` | Direct — flex column, `max-h`, scroll body, optional `footer`, body scroll lock | Unit + E2E | All modals inherit |
| Drawer primitive | `components/ui/drawer.tsx` | Direct — flex column, `flex-1 min-h-0 overflow-y-auto`, optional `footer`, body scroll lock | Unit + E2E | All drawers inherit |

## Drawers (directly updated)

| Surface | File | Route to open | QA status | Notes |
|---------|------|---------------|-----------|-------|
| New lead | `components/leads/leads-panel.tsx` | `/w/{slug}/leads` → New lead | E2E + Manual | Footer via `form="new-lead-form"` |
| Edit lead | `components/leads/lead-detail-panel.tsx` | `/w/{slug}/leads/{id}` → Edit | Manual | Long form; footer `form="edit-lead-form"` |
| New property | `components/properties/properties-panel.tsx` | `/w/{slug}/properties` → New property | Manual | Footer `form="new-property-form"` |
| Edit property | `components/properties/property-detail-panel.tsx` | `/w/{slug}/properties/{id}` → Edit | Manual | Footer `form="edit-property-form"` |
| New opportunity | `components/opportunities/opportunity-form-drawer.tsx` | Pipeline / detail → New opportunity | Manual | Used from pipeline panel |
| Edit opportunity | `components/opportunities/opportunity-detail-panel.tsx` | `/w/{slug}/opportunities/{id}` → Edit | Manual | Footer `form="edit-opportunity-form"` |
| Activity form | `components/activities/activity-form-drawer.tsx` | Detail pages / activities → New or Edit | Manual | Footer hidden during edit load only |
| New campaign | `components/campaigns/campaigns-panel.tsx` | `/w/{slug}/dripping` → New campaign | Manual | |
| Campaign step editor | `components/campaigns/campaign-detail-panel.tsx` | `/w/{slug}/dripping/{id}` → Add/Edit step | Manual | Long textarea (8 rows) |
| Email preview | `components/campaigns/campaign-detail-panel.tsx` | Campaign detail → Preview step | Inherit + Manual | Read-only; no footer needed |
| Admin feedback detail | `components/admin/feedback-admin-panel.tsx` | `/admin/feedback` → row click | **Manual only** | Requires platform admin; reported P0 bug |

## Modals (directly updated)

| Surface | File | Route to open | QA status | Notes |
|---------|------|---------------|-----------|-------|
| Send feedback | `components/feedback/feedback-widget.tsx` | Any workspace page → Feedback button | E2E + Manual | Fixed bottom-right trigger |
| Delete feedback confirm | `components/admin/feedback-admin-panel.tsx` | Admin feedback detail → Delete | Manual | Platform admin only |
| Mark as lost | `components/opportunities/lost-reason-modal.tsx` | Opportunity detail / pipeline → lost status | Manual | |
| Reassign records | `components/settings/reassignment-modal.tsx` | Settings → Users → suspend/remove with assignments | Manual | Migrated to `Modal` primitive |

## Inherit-only (no file change in Phase 15)

| Surface | File | QA status |
|---------|------|-----------|
| Example modal (dev) | `components/states/component-showcase.tsx` | E2E via `/w/{slug}/states` |
| Example drawer (dev) | `components/states/component-showcase.tsx` | E2E via `/w/{slug}/states` |

## Non-overlay pages (document scroll — out of Phase 15 scope)

These routes scroll via the document body (`AppShell` → `main` without viewport lock). No overlay trap fix required unless a future phase locks the app chrome.

| Module | Route |
|--------|-------|
| Dashboard | `/w/{slug}/dashboard` |
| Settings (all) | `/w/{slug}/settings/*` |
| Detail pages (main content) | leads, properties, opportunities detail |
| Admin overview | `/admin` |
| Auth | `/login`, `/signup`, `/workspaces` |

## QA gap summary

| Gap | Severity | Mitigation |
|-----|----------|------------|
| Admin feedback drawer | P1 | Manual matrix row; needs platform admin session |
| Browser zoom 125–200% | P1 | Manual matrix; E2E uses viewport size not CSS zoom |
| Safari-specific behavior | P2 | Manual matrix on Safari |
| Keyboard focus trap audit | P2 | Not in Phase 15 brief; follow-up if needed |
