import type { EntraUser } from "@it-helpdesk/shared";

type GraphUserLookup = {
  value: Array<{ id: string }>;
};

type GraphCatalogApp = { id: string };
type GraphCatalogResponse = { value: GraphCatalogApp[] };

// Cached internal Teams catalog ID (resolved once per process lifetime).
// undefined = not yet fetched; null = lookup failed or app not found.
let _teamsInternalId: string | null | undefined = undefined;

async function resolveTeamsCatalogId(token: string, externalId: string): Promise<string | null> {
  if (_teamsInternalId !== undefined) return _teamsInternalId;

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps?$filter=externalId eq '${externalId}'&$select=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.warn(`Teams catalog ID lookup failed (${resp.status}): ${body}`);
    _teamsInternalId = null;
    return null;
  }

  const data = (await resp.json()) as GraphCatalogResponse;
  _teamsInternalId = data.value[0]?.id ?? null;
  if (!_teamsInternalId) {
    console.warn(`Teams catalog ID not found for externalId ${externalId}`);
  }
  return _teamsInternalId;
}

type GraphTokenResponse = {
  access_token: string;
};

type GraphMember = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
};

type GraphPagedResponse = {
  value: GraphMember[];
  "@odata.nextLink"?: string;
};

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_API_CLIENT_ID;
  const clientSecret = process.env.ENTRA_API_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("ENTRA_TENANT_ID, ENTRA_API_CLIENT_ID, and ENTRA_API_CLIENT_SECRET must all be set to query Entra users.");
  }

  return fetchGraphToken(tenantId, clientId, clientSecret);
}

// Teams Activity Feed notifications must be sent from the same Azure AD app
// that is registered as webApplicationInfo.id in the Teams manifest (the web
// client app), not the API app. Use ENTRA_WEB_CLIENT_ID + ENTRA_WEB_CLIENT_SECRET.
async function getTeamsGraphToken(): Promise<string> {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const clientId = process.env.ENTRA_WEB_CLIENT_ID;
  const clientSecret = process.env.ENTRA_WEB_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("ENTRA_TENANT_ID, ENTRA_WEB_CLIENT_ID, and ENTRA_WEB_CLIENT_SECRET must all be set to send Teams activity notifications.");
  }

  return fetchGraphToken(tenantId, clientId, clientSecret);
}

async function fetchGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default"
      })
    }
  );

  if (!resp.ok) {
    throw new Error(`Failed to obtain Graph API token (${resp.status}).`);
  }

  const data = (await resp.json()) as GraphTokenResponse;
  return data.access_token;
}

async function fetchGroupMembers(token: string, groupId: string): Promise<EntraUser[]> {
  const users: EntraUser[] = [];
  let url: string | undefined =
    `https://graph.microsoft.com/v1.0/groups/${groupId}/transitiveMembers/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName&$top=999`;

  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Graph API error ${resp.status}: ${body}`);
    }

    const data = (await resp.json()) as GraphPagedResponse;

    for (const member of data.value) {
      const email = member.mail ?? member.userPrincipalName;
      if (email && member.displayName) {
        users.push({ id: member.id, displayName: member.displayName, email });
      }
    }

    url = data["@odata.nextLink"];
  }

  return users;
}

export async function getStaffCandidates(): Promise<EntraUser[]> {
  const allUsersGroupId = process.env.ENTRA_ALL_USERS_GROUP_ID;
  const techGroupId = process.env.ENTRA_TECH_GROUP_ID;
  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;

  // Prefer the dedicated all-users group; fall back to tech+admin groups
  const groupIds = allUsersGroupId
    ? [allUsersGroupId]
    : [techGroupId, adminGroupId].filter(Boolean) as string[];

  if (groupIds.length === 0) {
    return [];
  }

  const token = await getGraphToken();
  const pages = await Promise.all(groupIds.map((id) => fetchGroupMembers(token, id)));

  const seen = new Set<string>();
  const result: EntraUser[] = [];

  for (const members of pages) {
    for (const member of members) {
      const key = member.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(member);
      }
    }
  }

  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

type EntraStaffEntry = { email: string; displayName: string; role: "tech" | "admin" };

/**
 * Fetches members of the tech and admin security groups and returns them with
 * their appropriate role. Admin role takes precedence if a user is in both.
 * Returns [] if the required env vars or Graph credentials are not configured.
 */
export async function getEntraGroupStaff(): Promise<EntraStaffEntry[]> {
  const techGroupId = process.env.ENTRA_TECH_GROUP_ID;
  const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;

  if (!techGroupId && !adminGroupId) return [];

  const token = await getGraphToken();
  const seen = new Map<string, EntraStaffEntry>();

  if (techGroupId) {
    for (const m of await fetchGroupMembers(token, techGroupId)) {
      seen.set(m.email.toLowerCase(), { email: m.email, displayName: m.displayName, role: "tech" });
    }
  }

  if (adminGroupId) {
    for (const m of await fetchGroupMembers(token, adminGroupId)) {
      const key = m.email.toLowerCase();
      const existing = seen.get(key);
      if (existing) {
        existing.role = "admin"; // admin takes precedence over tech
      } else {
        seen.set(key, { email: m.email, displayName: m.displayName, role: "admin" });
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Sends a Teams Activity Feed notification to a user.
 * Silently no-ops if TEAMS_APP_ID is not configured or if the user is not
 * found in Entra / does not have the Teams app installed.
 * Never throws — notification failure must not break the primary operation.
 */
export async function sendTeamsActivityNotification(opts: {
  recipientEmail: string;
  activityType: string;
  topic: { title: string; ticketPath?: string };
  templateParams: Record<string, string>;
}): Promise<void> {
  const teamsAppId = process.env.TEAMS_APP_ID;
  if (!teamsAppId) {
    console.info("Teams activity notification skipped: TEAMS_APP_ID not set");
    return;
  }

  console.info(`Teams notification starting: ${opts.activityType} → ${opts.recipientEmail}`);

  try {
    // User lookup uses the API app token (has User.Read.All).
    // The notification POST uses the web app token (matches webApplicationInfo.id in the manifest).
    // resolveTeamsCatalogId also uses the API token (requires AppCatalog.Read.All application permission).
    const [apiToken, teamsToken] = await Promise.all([getGraphToken(), getTeamsGraphToken()]);

    // Resolve the internal Teams catalog ID (differs from the manifest external ID).
    // Passing this as teamsAppId disambiguates when multiple apps share the same
    // webApplicationInfo.id in the tenant (avoids 409) and works for org-wide installs
    // (avoids 400 from looking in personal installs).
    const teamsCatalogId = await resolveTeamsCatalogId(apiToken, teamsAppId);

    // Look up the user's Entra object ID by email.
    // Try mail first, then userPrincipalName — internal staff accounts sometimes
    // have mail unset and are only addressable via UPN.
    const userResp = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${encodeURIComponent(opts.recipientEmail)}' or userPrincipalName eq '${encodeURIComponent(opts.recipientEmail)}'&$select=id`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    if (!userResp.ok) {
      const errBody = await userResp.text().catch(() => "");
      console.warn(`Teams notification: user lookup failed (${userResp.status}):`, errBody);
      return;
    }

    const userData = (await userResp.json()) as GraphUserLookup;
    const userId = userData.value[0]?.id;
    if (!userId) {
      console.warn(`Teams notification: no Entra user found for ${opts.recipientEmail}`);
      return;
    }

    // webUrl must be a teams.microsoft.com/l/ URL — the Graph API rejects direct URLs.
    // The full l/entity deep link with subEntityId context navigates desktop Teams to the
    // specific ticket. Mobile Teams shows "use desktop" on click but the notification
    // still appears in the activity feed.
    const frontendUrl = process.env.FRONTEND_URL;
    const contentUrl =
      opts.topic.ticketPath && frontendUrl
        ? `${frontendUrl}${opts.topic.ticketPath}`
        : undefined;
    const teamsDeepLink = contentUrl && opts.topic.ticketPath
      ? `https://teams.microsoft.com/l/entity/${teamsAppId}/helpdesk-home?webUrl=${encodeURIComponent(contentUrl)}&label=${encodeURIComponent(opts.topic.title)}&context=${encodeURIComponent(JSON.stringify({ subEntityId: opts.topic.ticketPath }))}`
      : `https://teams.microsoft.com/l/entity/${teamsAppId}/helpdesk-home`;
    const topic: Record<string, string> = {
      source: "text",
      value: opts.topic.title,
      webUrl: teamsDeepLink
    };

    // Use the internal catalog ID (not the manifest external ID) to disambiguate.
    // The catalog ID resolves correctly for org-wide installed apps, whereas the
    // manifest external ID causes 400 (Graph searches personal installs, not the catalog).
    const body: Record<string, unknown> = {
      ...(teamsCatalogId ? { teamsAppId: teamsCatalogId } : {}),
      topic,
      activityType: opts.activityType,
      previewText: { content: opts.topic.title },
      templateParameters: Object.entries(opts.templateParams).map(([name, value]) => ({
        name,
        value
      }))
    };

    const notifResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/teamwork/sendActivityNotification`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${teamsToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!notifResp.ok) {
      const errBody = await notifResp.text().catch(() => "");
      console.warn(`Teams activity notification failed (${notifResp.status}):`, errBody);
    } else {
      console.info(`Teams activity notification sent (${notifResp.status}) to ${opts.recipientEmail} — type: ${opts.activityType}`);
    }
  } catch (err) {
    console.warn("Teams activity notification failed (non-fatal):", err);
  }
}
