# Architecture

## Repository layout

```
apps/
  web/          React + TypeScript frontend (Vite)
  api/          Azure Functions API (Node.js)
packages/
  shared/       Domain types, Zod validation schemas, constants
  ui/           Shared UI component stubs
infra/
  bicep/        Azure infrastructure definitions
docs/
scripts/
```

---

## Frontend (`apps/web`)

Built with React 18, TypeScript, and Vite. Single-page application, no UI framework — styles are hand-written CSS with CSS custom properties for theming.

### Auth

Two modes controlled by `VITE_AUTH_MODE`:

- **`mock`** — no Azure sign-in. Identity is injected via `x-dev-role` / `x-dev-user-*` headers. A role preview switcher appears in the sidebar for admins.
- **`entra`** — real Microsoft Entra ID sign-in via MSAL (`@azure/msal-browser`). The access token is attached as a Bearer token on every API request. Role is derived from Entra group membership at sign-in.

The `AuthProvider` (`features/auth/AuthProvider.tsx`) exposes a `useSession()` hook that returns the current user and a `requestHeaders` object. All API calls thread these headers through unchanged.

### Data

Two modes controlled by `VITE_USE_MOCK_API`:

- **`false` (default)** — all data goes through the Azure Functions API at `http://localhost:7071`. The API uses in-memory storage unless `DATABASE_URL` is set.
- **`true`** — all data lives in-browser in `lib/api/mockApi.ts`. No API process needed. Resets on page refresh.

### Role system

Three roles: `admin`, `tech`, `end_user`. Role is determined at sign-in (Entra group membership) or set via `VITE_DEV_ROLE` in mock mode.

Admins have a **preview mode** that lets them view the UI as a Tech or User without switching accounts. Preview is read-only — all write actions are disabled while active.

### Pages

| Page | Roles |
|---|---|
| Dashboard | Admin, Tech |
| All Tickets / Queue | Admin, Tech |
| New Ticket | Admin, Tech, User |
| My Tickets | All |
| Ticket Detail | All |
| Admin Panel | Admin |
| Recycle Bin | Admin, Tech |
| API Portal | Admin |

My Tickets shows inline-editable dropdowns (status, category, assignee) for admins and techs; end users see a read-only view.

Ticket Detail shows a **Restore** button and delete-permanently action when viewing a deleted ticket from the recycle bin. Editing is suppressed for deleted tickets.

API Portal renders an interactive Swagger UI (OpenAPI 3.0) for all Help Desk endpoints. Admins can browse, test, and copy `curl` examples directly from the page. The current session Bearer token is automatically pre-populated. Intended for building reporting pipelines and Snowflake ingestion flows.

### Components

- `AppShell` — sidebar navigation, identity panel, theme toggle, role preview switcher, mobile hamburger, notification bell with unread badge and dropdown panel (30-second polling)
- `TicketTable` — ticket list with inline-editable status/category/assignee dropdowns, bulk-select checkboxes, and status badges
- `StatusBadge` — color-coded status pill driven by server-defined status colors
- `MultiSelectCombobox` — inline-search multi-select with chip display (used for assignee, requester, category, status filters)
- `SingleSelectCombobox` — inline-search single-select (used on New Ticket for requester and assignee delegation fields)

---

## API (`apps/api`)

Azure Functions v4 (Node.js) running on HTTP triggers. Each function file exports one route handler.

### Auth

User identity is derived in `services/auth/userContext.ts`:

1. If `x-ms-client-principal` is present (Static Web Apps / real Entra), decode the JWT claims.
2. If `ALLOW_DEV_HEADERS=true` (default in dev), fall back to `x-dev-role` / `x-dev-user-*` headers.
3. Role is determined by Entra group membership (`ENTRA_ADMIN_GROUP_ID`, `ENTRA_TECH_GROUP_ID`). All other authenticated users are `end_user`.

### Endpoints

| Method | Path | Access |
|---|---|---|
| `GET` | `/api/me` | All |
| `GET` | `/api/categories` | All |
| `GET` | `/api/me/tickets` | All (own tickets) |
| `GET` | `/api/me/tickets/:id` | All (own tickets) |
| `POST` | `/api/tickets` | All |
| `GET` | `/api/me/tickets/:id/messages` | All (own tickets) |
| `POST` | `/api/me/tickets/:id/messages` | All (own tickets) |
| `POST` | `/api/tickets/:id/attachments/upload-url` | All (own tickets) |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId/download-url` | All (own tickets) |
| `GET` | `/api/manage/tickets` | Admin, Tech |
| `GET` | `/api/manage/tickets/:id` | Admin, Tech |
| `GET` | `/api/manage/tickets/by-number/:number` | Admin, Tech |
| `PATCH` | `/api/manage/tickets/:id` | Admin, Tech |
| `DELETE` | `/api/manage/tickets/:id` | Admin, Tech (soft delete → recycle bin) |
| `GET` | `/api/manage/tickets/:id/messages` | Admin, Tech |
| `POST` | `/api/manage/tickets/:id/messages` | Admin, Tech |
| `GET` | `/api/manage/recycle-bin` | Admin, Tech |
| `POST` | `/api/manage/recycle-bin/:id/restore` | Admin, Tech |
| `DELETE` | `/api/manage/recycle-bin/:id` | Admin only (permanent delete) |
| `GET` | `/api/manage/categories` | Admin, Tech |
| `POST/PATCH/DELETE` | `/api/manage/categories/:id` | Admin |
| `GET` | `/api/manage/admin/statuses` | Admin, Tech |
| `POST/PATCH/DELETE` | `/api/manage/admin/statuses/:id` | Admin |
| `GET/POST` | `/api/manage/staff` | Admin |
| `PATCH/DELETE` | `/api/manage/staff/:id` | Admin |
| `GET` | `/api/manage/entra/users` | Admin |
| `GET` | `/api/me/notifications` | All |
| `PATCH` | `/api/me/notifications/:id` | All |
| `PATCH` | `/api/me/notifications/read-all` | All |
| `DELETE` | `/api/me/notifications/read` | All |

### Storage

The repository abstraction (`services/tickets/repository.ts`) has two implementations:

- **In-memory** — default. Seeded with sample tickets and users on startup. Resets when the process restarts.
- **PostgreSQL** — active when `DATABASE_URL` is set. Uses the `pg` client directly against the schema defined in `apps/api/sql/`.

Tickets are **soft-deleted**: `DELETE /manage/tickets/:id` sets a `deleted_at` timestamp rather than removing the row. Deleted tickets are excluded from all active-ticket queries and accessible only through the recycle bin endpoints. A daily timer trigger (`purgeDeletedTickets`) permanently removes tickets whose `deleted_at` is older than 90 days.

### File attachments

Handled via Azure Blob Storage. In dev, Azurite provides a local emulator (started automatically by `npm run dev`). The upload flow issues a short-lived SAS URL for direct client upload rather than streaming through the Function.

---

## Shared package (`packages/shared`)

TypeScript types, Zod validation schemas, and constants shared by both the frontend and API. Neither app imports types directly from the other — all cross-boundary types come through here.

Key exports:

- `types/tickets.ts` — `Ticket`, `TicketSummary`, `TicketMessage`, `TicketStatus`, `TicketStatusRecord`, `CategoryRecord`, `TicketFilters`, `DashboardMetrics`, `NotificationRecord`, `NotificationsResponse`
- `validation/tickets.ts` — Zod schemas for request body validation
- `constants/tickets.ts` — default status values and other shared constants

---

## Database (`apps/api/sql`)

Migrations are plain SQL files applied in order:

| File | Description |
|---|---|
| `001_initial_schema.sql` | Core tables: `tickets`, `ticket_attachments`, `ticket_activity`, `categories` |
| `002_seed_categories.sql` | Default category seed data |
| `003_ticket_messages.sql` | `ticket_messages` table |
| `004_remove_waiting_status.sql` | Schema cleanup |
| `005_ticket_statuses.sql` | `ticket_statuses` table (replaces hardcoded status enum) |
| `006_status_color.sql` | Adds `color` column to `ticket_statuses` |
| `007_staff.sql` | `staff` table for tech/admin directory (used by assignee pickers) |
| `008_soft_delete.sql` | Adds `deleted_at` column to `tickets` for recycle bin support |
| `009_ticket_number.sql` | Adds `ticket_number SERIAL` column to `tickets`; unique index |
| `010_notifications.sql` | Adds `notifications` table with indexes on `user_email`, unread filter, and `created_at` |

---

## Infrastructure (`infra/bicep`)

Azure resource definitions for the intended production shape:

- Azure Static Web Apps (frontend)
- Azure Functions (API)
- Azure Database for PostgreSQL Flexible Server
- Azure Blob Storage (attachments)
- Application Insights (telemetry)

See [deployment.md](deployment.md) for provisioning and deployment steps.
