# Schema

SQL migrations live in `apps/api/sql/` and are applied in order. The repository switches automatically from in-memory to PostgreSQL when `DATABASE_URL` is set.

---

## Tables

### `tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `requester_email` | `text` | Set from caller identity — never from the request body |
| `requester_name` | `text` | |
| `title` | `text` | |
| `category` | `text` | |
| `description` | `text` | |
| `status` | `text` | Must match a value in `ticket_statuses.name` |
| `assigned_to_email` | `text` | Nullable |
| `assigned_to_name` | `text` | Nullable |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | Nullable — set when soft-deleted; `NULL` means active |
| `ticket_number` | `integer` (SERIAL) | Auto-incrementing human-readable number; zero-padded to 4 digits in the UI (e.g. `0042`); unique index |

### `ticket_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets(id)` on delete cascade |
| `author_email` | `text` | |
| `author_name` | `text` | |
| `author_role` | `text` | `admin`, `tech`, or `end_user` |
| `body` | `text` | |
| `created_at` | `timestamptz` | |

### `ticket_attachments`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets(id)` |
| `file_name` | `text` | |
| `storage_url` | `text` | Nullable — set after blob upload completes |
| `created_at` | `timestamptz` | |

### `ticket_activity`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `ticket_id` | `uuid` | FK → `tickets(id)` |
| `action_type` | `text` | e.g. `ticket_created`, `status_changed`, `assigned` |
| `actor_email` | `text` | |
| `actor_name` | `text` | |
| `old_value_json` | `jsonb` | Nullable |
| `new_value_json` | `jsonb` | Nullable |
| `created_at` | `timestamptz` | |

### `ticket_statuses`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | Unique |
| `color` | `text` | UI color token (e.g. `amber`, `blue`, `green`, `gray`) |
| `sort_order` | `int` | Controls display order |
| `created_at` | `timestamptz` | |

Default statuses seeded by migrations:

| Name | Color | Sort order |
|---|---|---|
| New | amber | 1 |
| In Progress | blue | 2 |
| Resolved | green | 3 |
| Closed | gray | 4 |

Statuses are fully managed by admins at runtime — they can be created, renamed, recolored, reordered, and deleted via the Admin Panel.

### `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `name` | `text` | Unique |
| `is_active` | `boolean` | Inactive categories are hidden from the submit form |

### `staff`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `email` | `text` | Unique |
| `display_name` | `text` | |
| `role` | `text` | `admin` or `tech` |
| `created_at` | `timestamptz` | |

Used to populate the assignee picker on ticket detail and admin ticket views.

### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `user_email` | `text` | Recipient |
| `ticket_id` | `uuid` | FK → `tickets(id)` on delete cascade |
| `action_type` | `text` | `ticket_created`, `ticket_assigned`, `status_changed`, or `new_message` |
| `actor_email` | `text` | Who triggered the event |
| `actor_name` | `text` | |
| `title` | `text` | Display text shown in the bell panel |
| `message` | `text` | Nullable — additional context |
| `is_read` | `boolean` | `false` by default |
| `read_at` | `timestamptz` | Nullable — set when marked read |
| `created_at` | `timestamptz` | |

Rows are created automatically by the API on ticket events. Cascade-deletes when the parent ticket is permanently deleted. Indexed on `user_email` and `(user_email, is_read)` for fast unread queries.

---

## Migration history

| File | Description |
|---|---|
| `001_initial_schema.sql` | Core tables: `tickets`, `ticket_attachments`, `ticket_activity`, `categories` |
| `002_seed_categories.sql` | Default category seed data |
| `003_ticket_messages.sql` | Adds `ticket_messages` table |
| `004_remove_waiting_status.sql` | Migrates "Waiting on User" tickets to "In Progress" |
| `005_ticket_statuses.sql` | Adds `ticket_statuses` table; replaces hardcoded status enum |
| `006_status_color.sql` | Adds `color` column to `ticket_statuses` |
| `007_staff.sql` | Adds `staff` table for tech/admin directory |
| `008_soft_delete.sql` | Adds `deleted_at` column to `tickets`; adds index on `deleted_at` |
| `009_ticket_number.sql` | Adds `ticket_number SERIAL` column to `tickets`; unique index |
| `010_notifications.sql` | Adds `notifications` table with indexes on `user_email`, unread filter, and `created_at` |

---

## Authorization rules

**End users** — enforced in every handler:
- Can create tickets; `requester_email` is always set from their verified identity, never from the request body
- Can only read tickets where `requester_email` matches their identity
- `onBehalfOf*` and `assignedTo*` fields on create are silently ignored

**Technicians and admins:**
- Can read and update all tickets
- Can create tickets on behalf of any user and pre-assign to any tech or admin
- Can read and post messages on any ticket

**Admins only:**
- Can create, update, and delete categories and statuses
- Can permanently delete tickets from the recycle bin (`DELETE /manage/recycle-bin/:id`)

**Soft delete:**
- `DELETE /manage/tickets/:id` sets `deleted_at`; the row is retained
- All active-ticket queries filter `WHERE deleted_at IS NULL`
- Recycle bin queries filter `WHERE deleted_at IS NOT NULL`
- A daily timer trigger purges tickets where `deleted_at < now() - interval '90 days'`
