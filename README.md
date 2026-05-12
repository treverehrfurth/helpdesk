# Help Desk

**[Live demo → helpdesk.trever.cloud](https://helpdesk.trever.cloud)**

Internal help desk for Microsoft 365 environments, available as a web app and as a **Microsoft Teams personal tab** with automatic Teams SSO sign-in.

| Package | Description |
|---|---|
| `apps/web` | React + TypeScript frontend |
| `apps/api` | Azure Functions API |
| `packages/shared` | Domain types, constants, Zod validation |
| `packages/ui` | Shared UI component library |

---

## Demo

A public demo is deployed at **[helpdesk.trever.cloud](https://helpdesk.trever.cloud)** via Cloudflare Pages. It runs entirely in the browser with no Azure backend and no login required. Signed in as Admin by default; use **Preview role** in the sidebar to switch to Tech or User views.

Demo state is scoped to your browser session. Changes you make (tickets, messages, assignments) persist through page refreshes but reset when the tab is closed or storage is cleared. Each visitor's session is fully isolated.

The **API Portal** nav link in the demo opens a static [Swagger UI reference](https://helpdesk.trever.cloud/swagger.html) documenting all endpoints, request shapes, and role requirements.

---

## Quick start

```bash
npm install
npm run dev:mock    # instant start, no setup needed
```

`dev:mock` is browser-only (no API, no Azure credentials). Session state persists through refreshes and resets on tab close. Signed in as Admin.

---

## Dev commands

| Command | What runs | Auth | Data |
|---|---|---|---|
| `npm run dev:mock` | Vite only | Mock | In-browser |
| `npm run dev` | Web + API + Azurite | Mock | In-memory API |
| `npm run dev:entra` | Web + API + Azurite | Real Entra | In-memory API |
| `npm run dev:multi` | Web x3 + API + Azurite | Mock | In-memory API |

Each command prints a startup summary with clickable localhost URLs.

`dev:mock` and `dev` require no `.env`. `dev:entra` requires Entra credentials in `.env`.

**Custom API port:**
```bash
API_DEV_PORT=7076 npm run dev
```

See **[docs/local-dev.md](docs/local-dev.md)** for full details.

---

## Environment

Copy `.env.example` to `.env` and fill in as needed:

```bash
cp .env.example .env
```

Only needed for `dev:entra` or connecting a real database. `dev:mock` and `dev` work without any `.env`.

| Variable | Purpose |
|---|---|
| `VITE_AUTH_MODE` | `mock` or `entra` (forced by dev commands, usually not needed) |
| `VITE_ENTRA_CLIENT_ID` | Frontend Entra app registration |
| `ENTRA_TENANT_ID` | Shared Entra tenant |
| `ENTRA_API_CLIENT_ID` | API Entra app registration |
| `ENTRA_WEB_CLIENT_ID` | Web app registration (Teams SSO only) |
| `ENTRA_APP_ID_URI` | Application ID URI for Teams token validation (Teams SSO only) |
| `ENTRA_ADMIN_GROUP_ID` | Entra group that grants the Admin role |
| `ENTRA_TECH_GROUP_ID` | Entra group that grants the Tech role |
| `ENTRA_ALL_USERS_GROUP_ID` | Entra group required for app access; also populates the requester picker |
| `TEAMS_APP_ID` | Teams app external ID; enables Teams Activity Feed push notifications (optional) |
| `DATABASE_URL` | PostgreSQL connection string (omit for in-memory) |
| `ALLOW_DEV_HEADERS` | `true` locally for mock auth identity headers |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage (Azurite used automatically in dev) |

---

## Features

- **Ticket management**: submit, update, assign, and track tickets through their lifecycle
- **Inline editing**: status, category, and assignee editable directly from queue and list views
- **Bulk actions**: select multiple tickets to update or delete in one step
- **Messaging**: internal conversation thread per ticket
- **File attachments**: direct upload to Azure Blob Storage via short-lived SAS URLs
- **Recycle bin**: soft-delete with 90-day auto-purge; techs and admins can restore; admins can permanently delete
- **Notifications**: in-app bell with unread badge; 30-second polling; events for new tickets, assignments, status changes, and replies; optional Teams Activity Feed push notifications
- **Admin Panel**: manage ticket statuses (name, color, order) and categories
- **Staff directory**: manage the tech/admin roster used for assignee pickers
- **API Portal**: interactive Swagger UI at `/api/docs` on the live deployment; admin-only; the demo serves a static reference at `/swagger.html`
- **Role preview**: admins can preview the UI as a Tech or end user without switching accounts
- **Microsoft Teams app**: installable as a personal tab; users are signed in automatically via Teams SSO (no login prompt on desktop or web)

---

## Further reading

- [docs/local-dev.md](docs/local-dev.md): All dev modes, roles, multi-user testing, environment variables
- [docs/architecture.md](docs/architecture.md): System design and data flow
- [docs/api.md](docs/api.md): API endpoints and request shapes
- [docs/schema.md](docs/schema.md): Database schema and migrations
- [docs/deployment.md](docs/deployment.md): Azure deployment, Teams SSO setup, and Teams Activity Feed push notifications
- [docs/changelog.md](docs/changelog.md): Feature history
