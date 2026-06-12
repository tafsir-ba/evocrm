# EvoHome CRM — Phase 1 (Design System + App Shell)

## Original problem statement

Phase 1 is **design only** for a real estate CRM SaaS (EvoHome). No backend
logic, no production wiring, no modules outside the locked V1 nav. Goal: a clean
visual foundation, app shell, reusable patterns and 12 screens with mock data,
ready to be implemented for real in later phases.

Visual direction: simple, white background, light gray borders, blue primary,
minimal shadows, dense but readable tables, calm operational SaaS for daily use
by agents, admins and managers.

## Tech stack

- **Framework:** Next.js 15 (App Router) on the existing `evocrm` codebase.
- **Language:** TypeScript (strict).
- **Styling:** Tailwind CSS v4 (CSS-first `@theme` tokens) + custom CSS vars.
- **Font:** Plus Jakarta Sans (loaded via `next/font/google`, scoped to `--font-jakarta`).
- **Icons:** Local inline SVG set at `lib/icons.tsx` (no emojis, no icon libraries).
- **Data:** All mock — centralized at `lib/mock-data.ts`. Phase 1 intentionally
  has zero backend integration; Cursor / a later phase will plug real APIs.

## Locked V1 navigation (matches brief exactly)

```
Dashboard · Pipeline · Leads · Properties · Activities · Dripping · Settings
+ Login (auth route)
```

No Contacts, Companies, Reports, Tasks (own module), Documents (own module),
Integrations (primary), Client Portal, Calendar, Automations, Marketing,
Billing (primary), Users (primary), Roles (primary). These either map into
existing primary modules, live inside Settings, or are explicitly deferred.

## Routes / screens delivered

| # | Route | Screen |
|---|-------|--------|
| 1 | `/login` | Login (Google + email visual; split panel desktop) |
| 2 | `/dashboard` | Dashboard shell with metrics, charts, upcoming, campaigns, recent opps |
| 3 | `/pipeline` | Kanban shell with stage columns, totals, opportunity cards |
| 4 | `/leads` | Leads table with filters, status badges, pagination |
| 5 | `/leads/[id]` | Lead detail with identity card, tabs (Overview/Opportunities/Activities/Notes/Files), timeline |
| 6 | `/properties` | Properties table with thumbnails, filters, pagination |
| 7 | `/properties/[id]` | Property detail with gallery, facts, tabs (Overview/Details/Media/Files/Notes/Opportunities/Activities) |
| 8 | `/opportunities/[id]` | Opportunity detail with stage progression, next activity, tabs |
| 9 | `/activities` | Activities list with type icons, status badges, view filters (All/Mine/Upcoming/Overdue/Done) |
| 10 | `/dripping` | Campaign cards with step previews + send-log placeholder |
| 11 | `/settings` | Settings shell with section grid + Workspace/Users/Roles/Dictionaries/Tags/Projects/Billing |
| 12 | `/states` | Reusable UI states showcase (badges, empty/error/forbidden/not-found, skeletons, form validation) |

Root `/` redirects to `/dashboard`.

## File map

```
/app
├── app/
│   ├── layout.tsx              # Root layout, font, metadata
│   ├── globals.css             # Tailwind 4 theme tokens + custom utilities
│   ├── page.tsx                # → redirect /dashboard
│   ├── login/page.tsx          # Login (auth shell, no app chrome)
│   └── (app)/                  # Route group: wraps with AppShell
│       ├── layout.tsx
│       ├── dashboard/page.tsx
│       ├── pipeline/page.tsx
│       ├── leads/page.tsx
│       ├── leads/[id]/page.tsx
│       ├── properties/page.tsx
│       ├── properties/[id]/page.tsx
│       ├── opportunities/[id]/page.tsx
│       ├── activities/page.tsx
│       ├── dripping/page.tsx
│       ├── settings/page.tsx
│       └── states/page.tsx     # Reusable UI states showcase
├── components/
│   ├── ui/                     # Primitives: button, input/select/textarea, badge, card, avatar, tabs, skeleton
│   ├── layout/                 # sidebar, topbar, app-shell, page-header, filter-bar
│   ├── states/                 # state-view, skeletons (TableSkeleton, CardSkeleton, KanbanSkeleton)
│   └── domain/                 # charts (MetricCard, BarChart, DonutChart)
├── lib/
│   ├── icons.tsx               # Local inline SVG icon set
│   ├── mock-data.ts            # All Phase 1 mock data (single source)
│   └── utils.ts                # cn() helper (clsx + tailwind-merge), pre-existing
└── frontend/                   # Bridge for the supervisor (Next runs from /app)
```

## Design tokens (theme)

Defined as CSS vars in `app/globals.css` under `@theme`:

- **Brand:** `--color-brand-50…900` (blue, primary action `#2563eb`)
- **Surfaces:** `--color-surface`, `--color-canvas`, `--color-muted`
- **Borders:** `--color-line`, `--color-line-strong`
- **Ink:** `--color-ink`, `--color-ink-soft`, `--color-ink-muted`, `--color-ink-faint`
- **Status tints:** info / success / warn / danger / neutral (each `-bg/-fg/-border`)
- **Radii:** `--radius-xs…xl`
- **Shadows:** `--shadow-xs…lg` (kept very subtle, per brief)
- **Fonts:** `--font-sans` → Plus Jakarta Sans; `--font-mono` for `.kbd`

Utilities added: `.focus-ring`, `.dot-grid` (empty state backdrop),
`.kbd` (keyboard hint chip), `.skeleton` (shimmer), `.tabular` (numeric).

## Component patterns

- **Button** — primary / secondary / outline / ghost / danger; sm/md/lg; loading state
- **Input / Textarea / Select / Label / FieldError** — left/right icon slots, invalid state, sm/md
- **Badge** — `tone` of neutral / info / success / warn / danger / muted; `dot`, `size`
- **StatusBadge** — automatically maps domain status string → tone
- **Card / CardHeader** — flat, light gray border, optional `padded`
- **Avatar / AvatarWithName** — deterministic color from id, monogram fallback
- **Tabs** — underline-style, with optional count, keyboard accessible
- **Sidebar / Topbar / AppShell** — desktop sidebar; mobile drawer overlay; sticky topbar; user menu
- **PageHeader / PageContainer** — back link, title, description, meta badge, actions slot
- **FilterBar** — search + select chips + Filters button
- **StateView** — empty / error / forbidden / notfound / noworkspace variants
- **Skeletons** — TableSkeleton, CardSkeleton, KanbanSkeleton
- **Charts** — MetricCard, BarChart (horizontal), DonutChart (SVG, no deps)

All interactive + status elements carry semantic class hooks. `data-testid` is
**not** yet stamped because no functional flow is wired in Phase 1; will be
added when Cursor wires real behavior.

## Responsive behavior

- **Desktop ≥1024px:** Full sidebar (244px), wide layouts, multi-column grids.
- **Tablet 768–1023px:** Sidebar collapses to drawer (hamburger). Kanban scrolls
  horizontally. Tables scroll horizontally. Property gallery becomes vertical thumbnails.
- **Mobile <768px:** Single-column layout, top bar minimal, sidebar in drawer.
  All filter selects, page headers and tabs wrap. Tables scroll horizontally.

## Accessibility

- Visible focus rings (`focus-ring` utility, 2px brand outline + offset)
- Status conveyed by both color **and** dot/label (not color alone)
- Form labels for every field, error helper text
- Modal-style drawer dismissable with backdrop click (mobile nav)
- Semantic landmarks (`<main>`, `<aside>`, `<nav>`, `<header>`)
- Keyboard hints exposed via `.kbd` style

## Boundaries respected

- ❌ No Contacts, Companies, Reports, Tasks (separate), Documents (separate),
  Integrations primary, Client Portal, Calendar primary, Automations, Marketing,
  Commission, Contracts, AI scoring, WhatsApp, MLS sync — none included.
- ✅ Tasks = activity type. Documents/Files = tab inside detail pages.
  Reports = Dashboard. Companies = not modeled. Projects = under Settings.
  Opportunities = surfaced through Pipeline + detail page, not primary nav.
  Billing / Users / Roles / Integrations = inside Settings only (Integrations
  shown as a "Coming in V2" disabled card per the brief).

## What's been implemented (Phase 1 — Jan 2026)

- ✅ Design tokens + global CSS utilities
- ✅ Reusable UI primitives (button, input, select, textarea, badge, card, avatar, tabs, skeleton)
- ✅ App shell (sidebar, topbar, mobile drawer, workspace selector placeholder, user menu)
- ✅ 12 screens listed above, every one renders with mock data and passes `/api/200`-style smoke
- ✅ Responsive: desktop, tablet, mobile
- ✅ Reusable state patterns (empty / error / forbidden / not found / loading skeletons / form validation)
- ✅ Status badges and tag tones for leads, properties, activities, campaigns, users
- ✅ Pipeline kanban with stage counts and aggregated CHF totals (K/M units handled)
- ✅ Dashboard charts (custom inline SVG bar + donut, no external libs)
- ✅ TypeScript strict passes (`yarn typecheck` green)
- ✅ ESLint passes (`yarn lint` → 0 warnings, 0 errors)

## Not implemented (intentionally)

- ❌ Backend logic / API routes / database
- ❌ Auth wiring (Google button visually navigates to `/dashboard`)
- ❌ Real form handling, validation logic, mutations
- ❌ Drag & drop on Kanban (visual hint only)
- ❌ File uploads, document generation
- ❌ `data-testid` attributes (added when behavior is wired)
- ❌ E2E tests (Playwright already scaffolded by Phase 0, Phase 1 is design only)

## Next action items (handoff to next phase / Cursor)

- **Phase 2 — Auth:** Wire Auth.js / NextAuth with the Google login (visual already in place)
- **Phase 3 — Workspace + Users + Roles:** real workspace switching, member CRUD, role enforcement
- **Phase 4 — Leads + Properties CRUD:** real listing, detail, create/edit forms
- **Phase 5 — Pipeline + Opportunities:** drag/drop, real stages from workspace dictionaries
- **Phase 6 — Activities:** real activity types, due-date logic, reminders
- **Phase 7 — Dripping:** simple step builder + send log + email delivery (Resend)
- **Phase 8 — Files / Documents:** DigitalOcean Spaces upload, in-page attachments
- **Phase 9 — Notifications + cron:** activity reminders, drip scheduling
- **Phase 10 — Billing (in Settings):** Stripe subscription management
- Add `data-testid` attributes during Phase 2+ as flows become interactive
- Migrate `next lint` → `eslint` CLI (Next 16 deprecation notice)

## Useful URLs (preview)

```
/             → redirects to /dashboard
/login        → Login screen
/dashboard    → Dashboard shell
/pipeline     → Pipeline kanban
/leads        → Leads list
/leads/L-1042 → Sample lead detail
/properties   → Properties list
/properties/P-2201 → Sample property detail (Green View Apt. 12)
/opportunities/O-307 → Sample opportunity detail
/activities   → Activities list with view tabs
/dripping     → Campaign cards
/settings     → Settings shell
/states       → Reusable UI state patterns showcase
```

## Potential improvement (idea for the team)

Since this is the operational dashboard agents will live in 6+ hours a day,
consider an **on-screen "Today" command palette** (⌘K, already hinted in topbar)
that surfaces overdue activities, hot leads with no recent contact, and
opportunities idle in a stage for too long. It is a tiny lever that turns the
CRM into a "next best action" coach and is a great fit for the calm operational
tone you've set — measurably lifts daily active usage and pipeline velocity.
