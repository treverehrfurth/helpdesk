# Local Development Guide

- [Prerequisites](#prerequisites)
- [Dev commands](#dev-commands)
- [Role system](#role-system)
- [API Portal](#api-portal)
- [Connecting a real database](#connecting-a-real-database)
- [Environment variable reference](#environment-variable-reference)
- [Seed data](#seed-data)
- [Resetting state](#resetting-state)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node 22** — required for Azure Functions (`nvm use` if you have nvm; the repo includes `.nvmrc`)
- **Azure Functions Core Tools v4** — `npm install -g azure-functions-core-tools@4`

```bash
npm install    # install all workspace dependencies
```

`dev:mock` is the only command that needs nothing beyond `npm install`.

---

## Dev commands

Each command forces its own auth and data settings — your `.env` contents do not affect which mode runs.

### `npm run dev:mock` — browser only

```bash
npm run dev:mock
```

**Zero setup. Works on a fresh clone.** Starts Vite only — no API, no Azure credentials. All data lives in the browser and resets on page refresh.

- Web → `http://localhost:5173`
- Auth: Mock · Data: In-browser
- Signed in as Admin (Avery Morgan) by default; role-preview switcher available in the sidebar

### `npm run dev` — full stack, mock auth

```bash
npm run dev
```

Starts the full local stack. No Azure credentials needed.

- Web → `http://localhost:5173`
- API → `http://localhost:7071/api`
- Auth: Mock · Data: In-memory API (resets on restart)
- Azurite blob emulator auto-managed

Custom API port (the web proxy follows automatically):

```bash
API_DEV_PORT=7076 npm run dev
```

### `npm run dev:entra` — full stack, real Entra auth

```bash
npm run dev:entra
```

Same full stack as `npm run dev` but with real Microsoft Entra ID sign-in. Use this to test auth flows, token handling, and the **API Portal**.

- Web → `http://localhost:5173`
- API → `http://localhost:7071/api`
- API Portal → `http://localhost:5173/api/docs`
- Auth: Entra · Data: In-memory API (resets on restart)

Requires these values in `.env`:

```
VITE_ENTRA_CLIENT_ID=
ENTRA_TENANT_ID=
ENTRA_API_CLIENT_ID=
ENTRA_ADMIN_GROUP_ID=
ENTRA_TECH_GROUP_ID=
```

### `npm run dev:multi` — three roles, one API

```bash
npm run dev:multi
```

Starts one shared API and three frontend instances, each signed in as a different role. Use this to test cross-role workflows (user submits → tech picks up → admin monitors).

| URL | Role | User |
|---|---|---|
| `http://localhost:5180` | Admin | Avery Morgan |
| `http://localhost:5181` | Tech | Jordan Lee |
| `http://localhost:5182` | User | Maya Patel |

All three share the same in-memory API — changes in one tab appear immediately in the others. No credentials needed.

### Verbose output

All commands suppress routine Azure Functions startup noise by default. To see everything:

```bash
VERBOSE=1 npm run dev
```

---

## Role system

### The three roles

| Role | Permissions |
|---|---|
| **Admin** | Full access. Manage categories and statuses. Create tickets on behalf of others. Role preview. |
| **Tech** | View and update all tickets. Message any ticket. Create tickets on behalf of others. |
| **User** | Submit tickets, view own tickets, add messages. |

### Mock auth

`VITE_DEV_ROLE` sets the signed-in identity when running mock auth:

```
VITE_DEV_ROLE=admin      ← default
VITE_DEV_ROLE=tech
VITE_DEV_ROLE=end_user
```

`dev:multi` sets this per tab automatically.

### Preview mode (Admin only)

The sidebar shows a **Preview role** panel with User and Tech options. Selecting one enters a read-only view of that role. An amber banner shows `Previewing as Tech — read only`. Works in both mock and Entra modes.

### Entra auth role assignment

Role is determined by Entra group membership:

- `ENTRA_ADMIN_GROUP_ID` members → Admin
- `ENTRA_TECH_GROUP_ID` members → Tech
- All other authenticated users → User

### Sidebar dev indicators

In any local dev build the sidebar shows the current mode:

| Label | Meaning |
|---|---|
| Auth: Mock | Fake identity, role from `VITE_DEV_ROLE`, preview switcher available |
| Auth: Entra | Real Entra sign-in, role from group membership |
| Data: Mock | In-browser data only, no API calls |
| Data: Local API | Real Azure Functions API, in-memory or PostgreSQL |

These labels are stripped from production builds.

---

## API Portal

The API Portal (interactive Swagger UI) is at `/api/docs`.

**Requires `npm run dev:entra`** — it needs a real Bearer token, which mock auth does not provide. Sign in as an admin; the nav link automatically attaches your session token.

Not available in `dev:mock` (no API running) or `dev` / `dev:multi` (no real Bearer token).

---

## Teams SSO

The Teams personal tab uses Teams SSO — the app silently obtains a signed token from the Teams SDK and validates it server-side at `POST /api/auth/teams-token`.

**Testing Teams SSO locally is not supported** — it requires a real Azure deployment with a matching app registration and a domain accessible from Microsoft's servers. Use `npm run dev:entra` to test Entra auth flows and token handling; use `npm run dev:mock` or `npm run dev` for everything else.

For production setup (Azure app registrations, manifest, install steps), see **[docs/deployment.md](deployment.md#microsoft-teams-app)**.

The two extra environment variables required for Teams SSO in production:

| Variable | Description |
|---|---|
| `ENTRA_WEB_CLIENT_ID` | Client ID of the web app registration |
| `ENTRA_APP_ID_URI` | Application ID URI (e.g. `api://helpdesk.example.com/<client-id>`) |

These are only needed in Azure — they have no effect in local dev.

---

## Connecting a real database

Add `DATABASE_URL` to your `.env`:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
PGSSLMODE=require
```

The API switches from in-memory to PostgreSQL automatically. Apply migrations before starting:

```bash
psql $DATABASE_URL -f apps/api/sql/001_initial_schema.sql
psql $DATABASE_URL -f apps/api/sql/002_seed_categories.sql
# continue with remaining numbered migration files
```

Then run `npm run dev` or `npm run dev:entra` as normal.

---

## Environment variable reference

### Frontend (Vite)

| Variable | Default | Description |
|---|---|---|
| `VITE_AUTH_MODE` | `mock` | `mock` or `entra` — forced by dev commands, rarely set manually |
| `VITE_USE_MOCK_API` | `false` | `true` = in-browser mock only, `false` = real API |
| `VITE_DEV_ROLE` | `admin` | Role for mock auth: `admin`, `tech`, `end_user` |
| `VITE_ENTRA_CLIENT_ID` | — | Frontend Entra app registration client ID |
| `VITE_ENTRA_API_SCOPE` | auto | Overrides default `api://<client_id>/user_impersonation` |
| `VITE_ENTRA_REDIRECT_URI` | — | Redirect URI registered in Entra |

### Shared Entra (used by both web and API)

| Variable | Description |
|---|---|
| `ENTRA_TENANT_ID` | Microsoft 365 tenant ID |
| `ENTRA_API_CLIENT_ID` | API app registration client ID |
| `ENTRA_API_AUDIENCE` | Expected token audience (typically `api://<ENTRA_API_CLIENT_ID>`) |
| `ENTRA_TECH_GROUP_ID` | Entra group whose members receive the Tech role |
| `ENTRA_ADMIN_GROUP_ID` | Entra group whose members receive the Admin role |

### API

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string. Omit to use in-memory. |
| `PGSSLMODE` | — | Set to `require` for managed PostgreSQL |
| `ALLOW_DEV_HEADERS` | `false` | Allow `x-dev-*` identity headers for mock auth. Never `true` in production. |
| `AZURE_STORAGE_CONNECTION_STRING` | Azurite | Blob storage. **Do not set in your shell profile** — a real Azure value overrides Azurite and causes 403 errors. |
| `AZURE_STORAGE_CONTAINER_NAME` | `ticket-attachments` | Blob container name |

---

## Seed data

Both in-memory modes start with pre-loaded data.

### Tickets

| Title | Status | Requester | Assignee |
|---|---|---|---|
| Laptop docking station no longer detects monitors | In Progress | Maya Patel | Jordan Lee |
| Need access to the shared finance mailbox | In Progress | Maya Patel | Chris Brennan |
| Teams calls are dropping on office Wi-Fi | New | Nina Garcia | — |

### Users

| Name | Email | Role |
|---|---|---|
| Avery Morgan | avery.morgan@example.com | Admin |
| Jordan Lee | jordan.lee@example.com | Tech |
| Chris Brennan | chris.brennan@example.com | Tech |
| Maya Patel | maya.patel@example.com | User |
| Nina Garcia | nina.garcia@example.com | User |

---

## Resetting state

| Situation | Action |
|---|---|
| Browser mock data | Refresh the page |
| In-memory API data | Restart the dev command |
| PostgreSQL data | Re-run the SQL migration scripts |
| Multi-user session | Ctrl+C, then `npm run dev:multi` again |

Clean reinstall:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

---

## Troubleshooting

### `[dev] ERROR: Node.js vX detected — Azure Functions requires Node 22`

```bash
nvm use
npm run dev
```

Install nvm from [nvm-sh/nvm](https://github.com/nvm-sh/nvm) if needed.

---

### Azurite `403 AuthorizationFailure` / CORS errors

A shell environment variable is likely overriding the emulator:

```bash
echo $AZURE_STORAGE_CONNECTION_STRING
```

If it prints anything, unset it and restart:

```bash
unset AZURE_STORAGE_CONNECTION_STRING
npm run dev
```

Remove the export from `~/.zshrc` or `~/.bash_profile` to fix permanently.

---

### Timer trigger spam (`purgeDeletedTickets` errors every minute)

Same root cause as the Azurite 403 above — once `AZURE_STORAGE_CONNECTION_STRING` points at the local emulator, the timer trigger acquires its lock and the spam stops.
