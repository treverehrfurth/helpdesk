import {
  EventType,
  type IPublicClientApplication,
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration
} from "@azure/msal-browser";
import type { UserProfile, UserRole } from "@it-helpdesk/shared";

import { authMode, entraConfig, isEntraConfigured } from "./config";

const authority = entraConfig.tenantId
  ? `https://login.microsoftonline.com/${entraConfig.tenantId}`
  : "";

/** True when the app is embedded in a Teams (or any) iFrame. */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent — definitely in an iFrame
  }
}

const msalConfiguration: Configuration = {
  auth: {
    clientId: entraConfig.clientId,
    authority,
    redirectUri: entraConfig.redirectUri
  },
  cache: {
    cacheLocation: "localStorage"
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: () => undefined
    }
  }
};

export const msalInstance =
  authMode === "entra" && isEntraConfigured
    ? new PublicClientApplication(msalConfiguration)
    : null;

if (msalInstance) {
  msalInstance.addEventCallback((event) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as AuthenticationResult;

      if (payload.account) {
        msalInstance.setActiveAccount(payload.account);
      }
    }
  });
}

export const loginRequest = {
  scopes: entraConfig.apiScope ? [entraConfig.apiScope] : []
};

function matchesConfiguredClaim(value: string, configured: string) {
  return Boolean(configured) && value.toLowerCase() === configured.toLowerCase();
}

function deriveRole(values: string[]): UserRole {
  const normalized = values.map((value) => value.toLowerCase());

  if (
    normalized.some(
      (value) =>
        value.includes("admin") ||
        matchesConfiguredClaim(value, entraConfig.adminGroupId) ||
        matchesConfiguredClaim(value, entraConfig.adminRole)
    )
  ) {
    return "admin";
  }

  if (
    normalized.some(
      (value) =>
        value.includes("tech") ||
        matchesConfiguredClaim(value, entraConfig.techGroupId) ||
        matchesConfiguredClaim(value, entraConfig.techRole)
    )
  ) {
    return "tech";
  }

  return "end_user";
}

export function deriveUserProfile(account: AccountInfo): UserProfile {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  const email =
    (claims.preferred_username as string | undefined) ??
    (claims.email as string | undefined) ??
    account.username;
  const name =
    (claims.name as string | undefined) ??
    account.name ??
    email;
  const roleValues = [
    ...(((claims.roles as string[] | undefined) ?? []).map(String)),
    ...(((claims.groups as string[] | undefined) ?? []).map(String))
  ];

  return {
    email,
    name,
    role: deriveRole(roleValues)
  };
}

export async function acquireApiAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
  options?: { forceRefresh?: boolean }
) {
  if (!loginRequest.scopes.length) {
    throw new Error("VITE_ENTRA_API_SCOPE is not configured.");
  }

  try {
    const result = await instance.acquireTokenSilent({
      account,
      scopes: loginRequest.scopes,
      forceRefresh: options?.forceRefresh ?? false
    });

    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({
        account,
        scopes: loginRequest.scopes
      });

      return result.accessToken;
    }

    throw error;
  }
}
