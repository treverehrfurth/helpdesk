import { app } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { handleError, HttpError } from "../middleware/http";

let teamsJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const tenantId = process.env.ENTRA_TENANT_ID;
  if (!tenantId) {
    throw new HttpError(500, "ENTRA_TENANT_ID is not configured.", "config_error");
  }
  if (!teamsJwks) {
    teamsJwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }
  return teamsJwks;
}

/**
 * POST /api/auth/teams-token
 *
 * Receives a Teams SSO token (from microsoftTeams.authentication.getAuthToken),
 * validates its signature and claims, then returns it directly as the Bearer
 * token for all subsequent API calls. The API's getUserContext accepts the web
 * client ID as a valid audience, so no OBO exchange is needed.
 *
 * Required env vars:
 *   ENTRA_TENANT_ID     — Azure AD tenant ID
 *   ENTRA_WEB_CLIENT_ID — Client ID of the web app registration
 *   ENTRA_APP_ID_URI    — Application ID URI (e.g. api://helpdesk.example.com/<client-id>)
 */
app.http("exchangeTeamsToken", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/teams-token",
  handler: async (request) => {
    try {
      const body = await request.json() as { teamsToken?: unknown };
      const teamsToken = body?.teamsToken;

      if (!teamsToken || typeof teamsToken !== "string") {
        throw new HttpError(400, "teamsToken is required.", "bad_request");
      }

      const tenantId = process.env.ENTRA_TENANT_ID;
      const webClientId = process.env.ENTRA_WEB_CLIENT_ID;
      const appIdUri = process.env.ENTRA_APP_ID_URI;

      if (!tenantId || !webClientId || !appIdUri) {
        throw new HttpError(500, "Teams SSO is not fully configured.", "config_error");
      }

      // Step 1: Validate the Teams SSO token before doing anything with it.
      // The audience is the Application ID URI registered for this app.
      const issuers = [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://login.microsoftonline.com/${tenantId}/`,
        `https://sts.windows.net/${tenantId}/`
      ];

      await jwtVerify(teamsToken, getJwks(), {
        issuer: issuers,
        audience: [appIdUri, webClientId]
      });

      // The validated Teams SSO token is a signed Azure AD JWT — return it
      // directly as the API Bearer token. The API validates audience + signature
      // the same way it validates MSAL-acquired tokens.
      // Note: intentionally NOT using json() here since the frontend fetches this
      // endpoint directly and expects { accessToken } at the top level, not wrapped in { data }.
      return {
        status: 200,
        jsonBody: { accessToken: teamsToken }
      };
    } catch (error) {
      return handleError(error);
    }
  }
});
