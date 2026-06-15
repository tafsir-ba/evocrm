# CRM focused form page pattern

Platform-wide UX directive for entity creation, editing, and configuration in EvoHome CRM.

## Use dedicated form pages

When creating, editing, or configuring a business entity, navigate to a dedicated form page — not a right-side drawer, slide-over, or narrow sidebar form.

### Required layout

- Clear page title
- Large centered form container (`FocusedFormLayout`, max-width ~36rem)
- Close (X) button at the top that returns without saving
- Primary and secondary CTAs directly under the form (centered), not pinned to the viewport corner
- Full-page vertical scrolling on small screens
- No horizontal scrolling for standard forms

### Shared components

- `components/layout/focused-form-layout.tsx` — page shell
- `FocusedFormActions` — Cancel + Save/Created paired buttons

## When drawers are allowed

Drawers are appropriate only for:

- Quick previews (e.g. email preview)
- Read-only summaries (e.g. admin feedback detail)
- Notifications and lightweight utility actions

## Never use drawers for

- Entity creation
- Entity editing
- Configuration screens
- Workflow building
- Settings management

## Route conventions

| Action | Route pattern |
|--------|----------------|
| Create | `/w/{slug}/{module}/new` |
| Edit | `/w/{slug}/{module}/{id}/edit` |
| Nested create | `/w/{slug}/{module}/{id}/{child}/new` |
| Nested edit | `/w/{slug}/{module}/{id}/{child}/{childId}/edit` |

Examples:

- `/w/demo/dripping/new`
- `/w/demo/dripping/{campaignId}/edit`
- `/w/demo/dripping/{campaignId}/steps/new`
- `/w/demo/leads/new`
- `/w/demo/properties/{propertyId}/edit`

## Accessibility

- Forms must remain usable at 125%, 150%, and 200% browser zoom
- CTAs must not become unreachable below the viewport
- Long forms scroll within the page, not inside fixed-height panels
