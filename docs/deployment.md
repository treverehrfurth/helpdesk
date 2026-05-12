# Deployment

## Intended Azure shape

- **Azure Static Web Apps** — frontend
- **Azure Functions** — API
- **Azure Database for PostgreSQL Flexible Server** — persistent storage
- **Azure Blob Storage** — file attachments
- **Application Insights** — telemetry

---

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file and fill in values:

```bash
cp .env.example .env
```

3. Start the full local stack:

```bash
npm run dev
```

This starts the web app, the Azure Functions API, and Azurite (local blob storage) together. See [local-dev.md](local-dev.md) for all dev modes and configuration options.

`apps/api/local.settings.json` is generated automatically from the root `.env` — you don't manage it manually.

---

## CI

The workflow at `.github/workflows/ci.yml` installs dependencies, typechecks, and builds the full workspace on every push.

---

## Deployment steps

1. Create Azure resources from `infra/bicep/main.bicep`.
2. Register the frontend and API as separate app registrations in Entra ID.
3. Assign app roles or Entra groups for Admin and Tech access (everyone else is a User).
4. Set environment variables in Azure for Entra IDs, API scope/audience, PostgreSQL connection string, and Blob Storage. `ALLOW_DEV_HEADERS` defaults to off and does not need to be set in production — omit it or set it to `false` explicitly for auditability.
5. Apply SQL migration scripts to PostgreSQL in order (`apps/api/sql/001_*.sql` through `010_*.sql`). The deploy workflow runs these automatically via `scripts/migrate.mjs` on every push to `main`.
6. Add GitHub repository secrets for Azure deployment credentials.

---

## Microsoft Teams app

The `teams/` folder contains everything needed to install the help desk as a Teams personal tab with automatic SSO.

### How it works

When opened inside Teams, the app silently obtains a signed JWT from the Teams SDK, validates it server-side at `POST /api/auth/teams-token`, and uses that token for all subsequent API calls. Users are signed in automatically — no login prompt on either Teams desktop or Teams web.

### Azure configuration required

**1. Web app registration** (separate from the API registration)

- Set the **Application ID URI** to `api://<your-domain>/<web-client-id>` (e.g. `api://helpdesk.example.com/00000000-...`)
- Under **Token configuration**, add a Groups claim → Security groups → check **Access token**
- Under **API permissions**, grant `User.Read` (Microsoft Graph, delegated)

**2. API app registration**

- Under **Expose an API**, add a scope `access_as_user` and authorize the web app client ID as an allowed client application

**3. Function App environment variables**

Add these to your Azure Function App application settings:

| Variable | Value |
|---|---|
| `ENTRA_WEB_CLIENT_ID` | Client ID of the web app registration |
| `ENTRA_APP_ID_URI` | Application ID URI from the web app registration (e.g. `api://helpdesk.example.com/<client-id>`) |

**4. Function App CORS**

In the Function App → API → CORS, add your web app's domain (e.g. `https://helpdesk.example.com`) to the allowed origins list.

**5. Role mapping**

The API resolves roles by matching the `groups` claim in the token against these Function App environment variables:

| Variable | Description |
|---|---|
| `ENTRA_ADMIN_GROUP_ID` | Object ID of the Entra security group that grants Admin access |
| `ENTRA_TECH_GROUP_ID` | Object ID of the Entra security group that grants Tech access |

Everyone else gets the `end_user` role.

### Package and install

A pre-packaged zip is published automatically to **[GitHub Releases → Teams App — Latest](../../releases/tag/teams-app-latest)** whenever the `teams/` folder changes on `main`. Download it from there — no manual zipping needed.

To install:

1. In Microsoft Teams → Apps → Manage your apps → Upload an app → Upload a custom app, select the downloaded zip
2. The app appears as a personal tab for the installing user; publish to your org's app catalog to roll it out to everyone

**Updating the manifest manually:** If you need to edit `teams/manifest.json` (e.g. `contentUrl`, `webApplicationInfo.id`) before packaging, update the file, re-zip `manifest.json` + `color.png` + `outline.png`, and upload that zip instead. Bump the `"version"` field in the manifest so Teams detects the update and prompts users to refresh.

---

## Notifications

The app supports in-app notifications (bell icon, 30-second polling) and optional **Teams Activity Feed** push notifications that appear in the Teams bell and trigger OS-level alerts.

### In-app notifications

No additional setup required — runs automatically once the `notifications` table exists (migration `010`). Events fire for:

- New ticket submitted → all active staff notified
- Ticket assigned → assignee notified
- Ticket status changed → requester notified
- New message → other party on the ticket notified

### Teams Activity Feed push (optional)

Requires one Azure step and one environment variable:

**1. API app registration — add permission**

In Azure Portal → your API app registration → **API permissions** → Add a permission → Microsoft Graph → Application permissions → search `TeamsActivity.Send` → Add → **Grant admin consent**.

**2. Function App environment variable**

| Variable | Value |
|---|---|
| `TEAMS_APP_ID` | The `id` field from `teams/manifest.json` |

If `TEAMS_APP_ID` is absent, Teams push notifications are silently skipped — in-app notifications are unaffected.

**3. Update the Teams app**

After merging changes to `teams/manifest.json`, download the new zip from GitHub Releases and update the app in the Teams Admin Center so the new `activityTypes` manifest entries take effect.
