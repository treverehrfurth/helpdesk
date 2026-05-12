# API

All routes are served under `/api/` by the Azure Functions host. Auth is enforced server-side on every handler — the `authLevel` is `anonymous` only because Azure Static Web Apps handles the token forwarding; actual identity and role checks happen inside each handler.

---

## Auth

The API resolves the caller's identity from one of three sources (checked in order):

1. `x-ms-client-principal` — base64-encoded JWT forwarded by Azure Static Web Apps / Entra ID
2. Entra bearer token in the `Authorization` header (MSAL-acquired)
3. Dev headers `x-dev-email`, `x-dev-name`, `x-dev-role` — only accepted when `ALLOW_DEV_HEADERS=true`; defaults to off when unset; never enable in production

Role is derived from Entra group membership (`ENTRA_ADMIN_GROUP_ID`, `ENTRA_TECH_GROUP_ID`). All other authenticated users are `end_user`.

---

## Endpoints

### All authenticated users

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/me` | Returns the signed-in user's identity and role |
| `GET` | `/api/categories` | Lists active categories (used by the submit form) |
| `GET` | `/api/me/tickets` | Lists tickets where the caller is the requester |
| `GET` | `/api/me/tickets/:id` | Gets a single ticket owned by the caller |
| `POST` | `/api/tickets` | Creates a ticket |
| `GET` | `/api/me/tickets/:id/messages` | Lists messages on a ticket owned by the caller |
| `POST` | `/api/me/tickets/:id/messages` | Posts a message on a ticket owned by the caller |
| `POST` | `/api/tickets/:id/attachments/upload-url` | Requests a SAS upload URL for an attachment |
| `POST` | `/api/tickets/:id/attachments/upload` | Uploads an attachment blob |
| `GET` | `/api/tickets/:ticketId/attachments/:attachmentId/download-url` | Gets a short-lived download URL for an attachment |
| `GET` | `/api/me/notifications` | Lists the caller's notifications (last 50, newest first) with unread count |
| `PATCH` | `/api/me/notifications/:id` | Marks a single notification as read |
| `PATCH` | `/api/me/notifications/read-all` | Marks all unread notifications as read |
| `DELETE` | `/api/me/notifications/read` | Clears (deletes) all already-read notifications |

### Technicians and admins

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/manage/tickets` | Lists all active tickets across the org, with filter support |
| `GET` | `/api/manage/tickets/:id` | Gets any ticket by ID (including deleted) |
| `GET` | `/api/manage/tickets/by-number/:number` | Gets a ticket by its human-readable ticket number (e.g. `42`) |
| `PATCH` | `/api/manage/tickets/:id` | Updates status, category, or assignment |
| `DELETE` | `/api/manage/tickets/:id` | Soft-deletes a ticket (moves to recycle bin) |
| `GET` | `/api/manage/tickets/:id/messages` | Lists messages on any ticket |
| `POST` | `/api/manage/tickets/:id/messages` | Posts a message on any ticket |
| `GET` | `/api/manage/recycle-bin` | Lists all soft-deleted tickets |
| `POST` | `/api/manage/recycle-bin/:id/restore` | Restores a deleted ticket to active |
| `GET` | `/api/manage/categories` | Lists all categories including inactive |

### Admins only

| Method | Route | Description |
|---|---|---|
| `DELETE` | `/api/manage/recycle-bin/:id` | Permanently deletes a ticket (irreversible) |
| `POST` | `/api/manage/categories` | Creates a category |
| `PATCH` | `/api/manage/categories/:id` | Updates a category |
| `DELETE` | `/api/manage/categories/:id` | Deletes a category |
| `GET` | `/api/manage/admin/statuses` | Lists all ticket statuses |
| `POST` | `/api/manage/admin/statuses` | Creates a status |
| `PATCH` | `/api/manage/admin/statuses/:id` | Updates a status (name, color, sort order) |
| `DELETE` | `/api/manage/admin/statuses/:id` | Deletes a status |
| `GET` | `/api/manage/staff` | Lists staff members (active only by default; `?active=false` for all) |
| `POST` | `/api/manage/staff` | Adds a user to the staff directory |
| `PATCH` | `/api/manage/staff/:id` | Updates a staff member (name, role, active status) |
| `DELETE` | `/api/manage/staff/:id` | Removes a staff member |
| `GET` | `/api/manage/entra/users` | Lists all users from the Entra ID directory |

---

## Request shapes

### Create ticket — `POST /api/tickets`

```json
{
  "title": "Need access to the shared finance mailbox",
  "category": "Access",
  "description": "Please add me to the finance shared mailbox before month-end close.",
  "attachments": [{ "fileName": "screenshot.png" }],
  "onBehalfOfEmail": "maya.patel@example.com",
  "onBehalfOfName": "Maya Patel",
  "assignedToEmail": "jordan.lee@example.com",
  "assignedToName": "Jordan Lee"
}
```

`onBehalfOf*` and `assignedTo*` fields are silently ignored for `end_user` callers — only admins and techs may delegate or pre-assign.

### Update ticket — `PATCH /api/manage/tickets/:id`

```json
{
  "status": "In Progress",
  "category": "Hardware",
  "assignedToEmail": "jordan.lee@example.com",
  "assignedToName": "Jordan Lee"
}
```

All fields are optional. Passing `assignedToEmail: null` unassigns the ticket.

### Post message — `POST /api/.../messages`

```json
{
  "body": "I've requested access from the finance team lead — expecting a response by EOD."
}
```

---

## Soft delete and recycle bin

Deleting a ticket sets `deleted_at` on the row rather than removing it. Deleted tickets:

- Are excluded from all active-ticket list and filter queries
- Are accessible via `GET /api/manage/tickets/:id` so the detail page can still load
- Appear in `GET /api/manage/recycle-bin` with their `deletedAt` timestamp
- Are permanently removed by a daily timer trigger after 90 days

The `deletedAt` field is included in all `Ticket` and `TicketSummary` responses. The recycle bin UI shows days remaining before auto-purge.

---

## Ticket numbers

Every ticket has a `ticketNumber` field — a sequential integer auto-assigned on creation (backed by a `SERIAL` column). The UI displays it zero-padded to 4 digits (`#0042`), but the raw integer is returned in all `Ticket` and `TicketSummary` responses.

Use `GET /api/manage/tickets/by-number/:number` to look up a ticket by number — useful for reporting pipelines, Snowflake ingestion, and support references where a UUID is inconvenient.

---

## Ticket filters — `GET /api/manage/tickets`

Supported query parameters:

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by status name (exact match) |
| `category` | string | Filter by category name (exact match) |
| `assignee` | string | Filter by assigned email (comma-separated for multiple) |
| `requester` | string | Filter by requester email (comma-separated for multiple) |
| `search` | string | Full-text search across title and description |
