# Feature Changelog

Chronological record of major releases.

---

## Contents

- [Initial Build](#initial-build) — 2026-03-24
- [Production Deployment](#production-deployment) — 2026-03-30
- [Staff Directory & Entra Roles](#staff-directory--entra-roles) — 2026-03-31 · PR #2
- [Inline Editing & UX](#inline-editing--ux) — 2026-04-01 · PR #3
- [Soft-delete & Recycle Bin](#soft-delete--recycle-bin) — 2026-04-01 · PR #4
- [Ticket Numbers & Table Enhancements](#ticket-numbers--table-enhancements) — 2026-04-01 · PR #5
- [API Portal](#api-portal) — 2026-04-01 · PR #6
- [UI Polish](#ui-polish) — 2026-04-01 · PR #7 / PR #8
- [Teams SSO](#teams-sso) — 2026-04-01
- [Dev Script Overhaul](#dev-script-overhaul) — 2026-04-01
- [Dashboard & Form Improvements](#dashboard--form-improvements) — 2026-04-02 · PR #10
- [Notification System](#notification-system) — 2026-04-03
- [Activity Timeline Polish](#activity-timeline-polish) — 2026-04-04

---

## Initial Build

*2026-03-24 → 2026-03-27*

Core help desk functionality from scratch: ticket submission, queue views, status and category management, messaging threads, file attachments, and role-based access (Admin / Tech / User). Entra ID integration (MSAL) for real sign-in; mock auth for local development. In-memory data store by default; PostgreSQL when `DATABASE_URL` is set.

---

## Production Deployment

*2026-03-30 · PR #1*

First production deployment to Azure — Static Web Apps (frontend) + Azure Functions (API) + PostgreSQL + Blob Storage. Resolved a series of Azure Functions v4 Node.js deployment issues: Linux consumption plan required, correct tsup bundling so all dependencies are included in the output, `@azure/functions` kept external, `use strict` stripping, and Node 22 version pinning.

---

## Staff Directory & Entra Roles

*2026-03-31 · PR #2*

Added a staff directory — a managed roster of tech and admin users that drives the assignee picker on tickets. Role assignment moved from hardcoded logic to Entra security groups: `ENTRA_ADMIN_GROUP_ID` and `ENTRA_TECH_GROUP_ID` are matched against the `groups` claim in the token, with all other authenticated users defaulting to `end_user`.

---

## Inline Editing & UX

*2026-04-01 · PR #3*

Status, category, and assignee are now editable directly in ticket list views without opening the detail page. Changes are staged as pending edits and committed together with a single **Save** click. Added a **Discard** button to revert all pending changes, and a navigation-leave confirmation modal when there are unsaved edits.

---

## Soft-delete & Recycle Bin

*2026-04-01 · PR #4*

Tickets deleted by techs or admins are soft-deleted rather than permanently removed. Deleted tickets land in a **Recycle Bin** page accessible to both roles. Techs and admins can restore tickets; admins can permanently delete. A daily timer trigger auto-purges tickets older than 90 days — the Recycle Bin UI shows days remaining for each ticket. All delete and restore actions are recorded in the activity log. Bulk deletion is available from any ticket list view.

---

## Ticket Numbers & Table Enhancements

*2026-04-01 · PR #5*

Tickets now have a sequential display number (e.g. `#1042`) in addition to their UUID, making them easy to reference in conversation. Added bulk-select checkboxes to ticket list views — selecting rows reveals a bulk edit bar with inline field dropdowns and a **Delete selected** action.

---

## API Portal

*2026-04-01 · PR #6*

Interactive Swagger UI at `/api/docs`, admin-only, available under `npm run dev:entra` and in production. The current session Bearer token is pre-populated automatically — useful for testing endpoints, building reporting pipelines, and integration work without writing any code.

---

## UI Polish

*2026-04-01 · PR #7 / PR #8*

Branding pass: removed "IT" prefix from all page titles; added favicon. Fixed assignee and category column selects expanding with page width. API session token persistence across hard refreshes. Misc layout and compaction edge case fixes.

---

## Teams SSO

*2026-04-01*

The help desk is installable as a Microsoft Teams personal tab with automatic SSO — no login prompt on Teams desktop or web. The app silently obtains a signed JWT from the Teams SDK, validates it server-side, and uses that token for all subsequent API calls. Role is resolved from the `groups` claim, same as regular Entra sign-in. Required resolving iFrame embedding restrictions and sessionStorage access policies inside the Teams client.

See [deployment.md](deployment.md#microsoft-teams-app) for Azure app registration setup and Teams manifest packaging.

---

## Dev Script Overhaul

*2026-04-01*

All dev commands (`dev`, `dev:entra`, `dev:multi`) now produce clean, Vite-style terminal output with colored status indicators and clickable `localhost` URLs. Azure Functions startup noise is suppressed by default. `VERBOSE=1` restores full output.

---

## Dashboard & Form Improvements

*2026-04-02 · PR #10*

**Bulk edit:** Pending changes now persist independently of row selection — deselecting rows no longer reverts staged edits. Only an explicit Discard clears them. The bulk edit bar shows an unsaved change count when no rows are selected.

**Ticket detail pickers:** Category and assignee pickers on the detail page were invisible and non-functional; fixed. All three pickers (Status, Category, Assignee) now share a uniform width.

**New Ticket form:** Replaced native `<select>` dropdowns with the standard custom pickers for Category, Requester, and Assign To. Requester and Assign To show email as a sublabel to reduce assignment errors.

**Dashboard — Team tile:** Moved from Admin Panel to the Dashboard, replacing the old Team Coverage tile. Now shows Techs/Admins tabs, avatar initials, and clickable Queue and Resolved stat links that navigate to All Tickets pre-filtered for that staff member.

**Dashboard — Categories tile:** Added to the tech dashboard. Both tech and admin dashboard tiles now use a consistent clickable row pattern: category name links to all tickets for that category; the open count badge links with all open statuses pre-selected; the total count links to all tickets for that category.

**CI:** Added a release workflow that automatically publishes the Teams app zip to GitHub Releases whenever `teams/` changes are pushed to `main`.

---

## Notification System

*2026-04-03*

In-app notification bell with unread badge count, 30-second background polling, and a panel that opens to the right of the sidebar (portal-rendered, not clipped by sidebar overflow). On mobile the bell moves to the topbar. Clicking a notification navigates to the relevant ticket and marks it read. "Mark all read" clears the badge in one click.

Four trigger events: new ticket submitted (all active staff notified), ticket assigned (assignee notified), status changed (requester notified), new message (the other party notified — assignee if user replied, requester if staff replied; falls back to all active staff for unassigned tickets).

Optional **Teams Activity Feed** push notifications fire alongside every in-app notification when `TEAMS_APP_ID` is configured and the `TeamsActivity.Send` Graph API permission is granted. Push notifications appear in the Teams bell and trigger OS-level alerts with the full desktop/mobile Teams notification experience. Gracefully no-ops if unconfigured — in-app notifications are unaffected.

Access gating via `ENTRA_ALL_USERS_GROUP_ID` now also drives the requester dropdown on the New Ticket form — only users in that group appear as selectable requesters.

See [deployment.md](deployment.md#notifications) for Azure setup.

---

## Activity Timeline Polish

*2026-04-04*

Rewrote the ticket detail activity feed to use a polished vertical timeline. Each event has a centered dot connected by a segmented thread line with real gaps at the dot position rather than a continuous border. Grouped/collapsed events (e.g. multiple assignment changes) expand via a chevron into a tree-view connector pattern (├── / └──) with a vertical rail and horizontal branches pointing to sub-item dots.

Hovering a row highlights the full-width row and swaps the relative time ("1h ago") to the full datetime inline — no popup, no layout shift. The section toggle bar spans the full width with a pointer cursor. The trailing line below the last item and the orphan line above the first are suppressed. Teams deep-link URLs auto-mark the linked notification as read on arrival.
