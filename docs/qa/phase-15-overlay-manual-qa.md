# Phase 15 — Overlay scroll manual QA matrix

Use this document when authenticated Playwright E2E cannot run (no MongoDB, CI gap) or to complete coverage Playwright does not automate (browser zoom, Safari, platform admin flows).

## Prerequisites

```bash
# MongoDB must be running (Playwright webServer uses evocrm_e2e database)
# Example: mongodb://localhost:27017/evocrm_e2e

npx playwright install chromium
npm run test:e2e -- tests/e2e/overlay-layout.spec.ts
```

If MongoDB is unavailable, overlay E2E tests **skip** with a clear message. Complete coverage via this manual matrix instead.


1. Start app: `npm run dev`
2. Use a platform admin account for admin rows; standard workspace member for CRM rows.
3. For each row: open route → open overlay → verify expected result.
4. Record **Actual result**, **Pass/fail**, and attach screenshot filename.

## Viewport / zoom matrix (required combinations)

| ID | Browser | Viewport / device | Zoom | Notes |
|----|---------|-------------------|------|-------|
| V1 | Chrome desktop | 1440×900 | 100% | Baseline |
| V2 | Chrome desktop | 1440×900 | 125% | Browser zoom, not just resize |
| V3 | Chrome desktop | 1440×900 | 150% | |
| V4 | Chrome desktop | 1280×720 | 100% | Small laptop |
| V5 | Safari desktop | 1440×900 | 100% | macOS |
| V6 | Safari desktop | 1440×900 | 125% | |
| V7 | Chrome responsive | 390×844 (iPhone) | 100% | DevTools device mode |
| V8 | Chrome responsive | 768×1024 (iPad) | 100% | |

## Overlay test rows

Status key: **Pending** = not yet executed by a human tester.

| ID | Route | Overlay | Viewport IDs | Expected result | Actual result | Screenshot | Pass/fail | Status |
|----|-------|---------|--------------|-----------------|---------------|------------|-----------|--------|
| M01 | `/w/{slug}/states` | Example modal | V1–V8 | Panel within viewport; body locked; Escape closes | | | | Pending |
| M02 | `/w/{slug}/states` | Example drawer | V1–V8 | Panel within viewport; body locked; Close works | | | | Pending |
| M03 | `/w/{slug}/leads` | New lead drawer | V1–V8 | All fields scroll; Create/Cancel always visible | | | | Pending |
| M04 | `/w/{slug}/leads/{id}` | Edit lead drawer | V2,V3,V7 | Save/Cancel visible; long notes scroll | | | | Pending |
| M05 | `/w/{slug}/properties` | New property drawer | V2,V3,V7 | Create/Cancel visible; no horizontal clip | | | | Pending |
| M06 | `/w/{slug}/properties/{id}` | Edit property drawer | V2,V3,V7 | Save/Cancel visible | | | | Pending |
| M07 | `/w/{slug}/pipeline` | New opportunity drawer | V2,V3,V7 | Create/Cancel visible | | | | Pending |
| M08 | `/w/{slug}/opportunities/{id}` | Edit opportunity drawer | V2,V3,V7 | Save/Cancel visible | | | | Pending |
| M09 | `/w/{slug}/activities` or detail | Activity drawer | V2,V7 | Save/Cancel visible | | | | Pending |
| M10 | `/w/{slug}/dripping` | New campaign drawer | V7 | Create/Cancel visible | | | | Pending |
| M11 | `/w/{slug}/dripping/{id}` | Add/Edit step drawer | V2,V3,V7 | Save/Cancel visible; 8-row body scrolls | | | | Pending |
| M12 | `/w/{slug}/dripping/{id}` | Email preview drawer | V7 | Long body scrolls inside drawer | | | | Pending |
| M13 | `/w/{slug}/opportunities/{id}` | Mark as lost modal | V2,V7 | Confirm/Cancel visible | | | | Pending |
| M14 | `/w/{slug}/settings/users` | Reassign records modal | V2,V7 | Reassign/Cancel visible | | | | Pending |
| M15 | Any workspace page | Feedback widget modal | V1–V8 | Send/Cancel visible; screenshots scroll | | | | Pending |
| M16 | `/admin/feedback` | Feedback detail drawer | V1–V8 | **P0 row** — Mark resolved/Delete visible; screenshots scroll | | | | Pending |
| M17 | `/admin/feedback` | Delete confirm modal | V7 | Delete/Cancel visible | | | | Pending |

## Pass criteria (all rows)

- Overlay panel/dialog bounding box stays within the visible viewport.
- `document.body` does not become the primary scroll target while overlay is open.
- Inner content region scrolls when content exceeds available height.
- Primary action buttons (Save, Create, Send, Mark resolved, etc.) remain visible without scrolling.
- Close control (X, Cancel, Escape, backdrop where intended) works.
- No horizontal overflow on the page (`scrollWidth <= clientWidth`).

## Playwright ↔ manual mapping

| Playwright test | Manual rows covered |
|-----------------|---------------------|
| component showcase modal | M01 (viewport resize only; zoom = manual) |
| component showcase drawer | M02 |
| new lead drawer | M03 (viewport resize only) |
| feedback widget modal | M15 (viewport resize only) |

Rows **M04–M14, M16–M17** and all **zoom-level** checks require this manual matrix.

## Sign-off

| Role | Name | Date | Phase 15 approved? |
|------|------|------|--------------------|
| QA | | | |
| Dev | | | |

Phase 15 is **fully QA-approved** only when:

1. `npm test` passes, and
2. `npm run test:e2e` passes (with MongoDB), **or** all required manual rows above are marked Pass with screenshots, and
3. M16 (admin feedback detail drawer) passes at V2, V3, and V7 minimum.
