import type { HttpRequest } from "@azure/functions";
import {
  createRemoteJWKSet,
  decodeJwt,
  errors as JoseErrors,
  jwtVerify,
  type JWTPayload
} from "jose";

import type { UserProfile, UserRole } from "@it-helpdesk/shared";

import { HttpError } from "../../middleware/http";

type StaticWebAppPrincipal = {
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
  claims?: Array<{
    typ: string;
    val: string;
  }>;
};

function isAllowedAccess(normalized: string[]): boolean {
  const allUsersGroupId = (process.env.ENTRA_ALL_USERS_GROUP_ID ?? "").toLowerCase();

  // If no group restriction is configured, allow everyone through
  if (!allUsersGroupId) return true;

  const adminGroupId = (process.env.ENTRA_ADMIN_GROUP_ID ?? "").toLowerCase();
  const techGroupId = (process.env.ENTRA_TECH_GROUP_ID ?? "").toLowerCase();

  // Allow if in the all-users, tech, or admin group
  return normalized.some(
    (value) =>
      value === allUsersGroupId ||
      (adminGroupId && value === adminGroupId) ||
      (techGroupId && value === techGroupId)
  );
}

function deriveRole(values: string[]): UserRole {
  const normalized = values.map((value) => value.toLowerCase());
  const adminGroupId = (process.env.ENTRA_ADMIN_GROUP_ID ?? "").toLowerCase();
  const techGroupId = (process.env.ENTRA_TECH_GROUP_ID ?? "").toLowerCase();
  const adminRole = (process.env.ENTRA_ADMIN_ROLE ?? "HelpDesk.Admin").toLowerCase();
  const techRole = (process.env.ENTRA_TECH_ROLE ?? "HelpDesk.Tech").toLowerCase();

  if (
    normalized.some(
      (value) =>
        value.includes("admin") ||
        value.includes("sg-app-helpdesk-admin") ||
        value === adminGroupId ||
        value === adminRole
    )
  ) {
    return "admin";
  }

  if (
    normalized.some(
      (value) =>
        value.includes("tech") ||
        value.includes("sg-app-helpdesk-tech") ||
        value === techGroupId ||
        value === techRole
    )
  ) {
    return "tech";
  }

  return "end_user";
}

let jwks:
  | ReturnType<typeof createRemoteJWKSet>
  | null = null;

function getAcceptedAudiences() {
  const explicitAudience = process.env.ENTRA_API_AUDIENCE;
  const clientId = process.env.ENTRA_API_CLIENT_ID;
  const webClientId = process.env.ENTRA_WEB_CLIENT_ID;

  return [
    explicitAudience,
    clientId,
    clientId ? `api://${clientId}` : null,
    webClientId
  ].filter(Boolean) as string[];
}

function getJwks() {
  const tenantId = process.env.ENTRA_TENANT_ID;

  if (!tenantId) {
    throw new HttpError(
      500,
      "ENTRA_TENANT_ID is not configured for bearer token validation.",
      "entra_configuration_error"
    );
  }

  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }

  return jwks;
}

function mapJwtPayloadToUser(payload: JWTPayload): UserProfile | null {
  const email =
    (payload.preferred_username as string | undefined) ??
    (payload.upn as string | undefined) ??
    (payload.unique_name as string | undefined) ??
    (payload.email as string | undefined) ??
    (Array.isArray(payload.emails) ? String(payload.emails[0] ?? "") : undefined);

  if (!email) {
    return null;
  }

  const name =
    (payload.name as string | undefined) ??
    (payload.given_name as string | undefined) ??
    email;
  const roleValues = [
    ...((payload.roles as string[] | undefined) ?? []),
    ...((payload.groups as string[] | undefined) ?? [])
  ].map(String);

  if (!isAllowedAccess(roleValues.map((v) => v.toLowerCase()))) {
    throw new HttpError(403, "You do not have access to this application.", "forbidden");
  }

  return {
    email,
    name,
    role: deriveRole(roleValues)
  };
}

async function parseBearerToken(authorizationHeader: string) {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const audiences = getAcceptedAudiences();

  if (!tenantId || audiences.length === 0) {
    throw new HttpError(
      500,
      "ENTRA token validation is not fully configured.",
      "entra_configuration_error"
    );
  }

  const token = authorizationHeader.replace(/^Bearer\s+/i, "");
  const issuers = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://login.microsoftonline.com/${tenantId}/`,
    `https://sts.windows.net/${tenantId}/`
  ];

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: issuers,
      audience: audiences.length === 1 ? audiences[0] : audiences
    });

    return mapJwtPayloadToUser(payload);
  } catch (error) {
    if (
      error instanceof JoseErrors.JWTClaimValidationFailed ||
      error instanceof JoseErrors.JWSSignatureVerificationFailed ||
      error instanceof JoseErrors.JWTExpired
    ) {
      const decoded = decodeJwt(token);

      throw new HttpError(
        401,
        "Bearer token validation failed.",
        "invalid_token",
        {
          issuer: decoded.iss ?? null,
          audience: decoded.aud ?? null
        }
      );
    }

    throw error;
  }
}

function parseStaticWebAppPrincipal(
  encodedPrincipal: string
): UserProfile | null {
  const decoded = Buffer.from(encodedPrincipal, "base64").toString("utf8");
  const principal = JSON.parse(decoded) as StaticWebAppPrincipal;
  const claims = principal.claims ?? [];

  const email =
    claims.find((claim) =>
      [
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "emails"
      ].includes(claim.typ)
    )?.val ?? principal.userDetails;

  if (!email) {
    return null;
  }

  const name =
    claims.find((claim) =>
      [
        "name",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
      ].includes(claim.typ)
    )?.val ?? principal.userDetails ?? email;

  const roleValues = [...(principal.userRoles ?? []), ...claims.map((claim) => claim.val)];

  if (!isAllowedAccess(roleValues.map((v) => v.toLowerCase()))) {
    throw new HttpError(403, "You do not have access to this application.", "forbidden");
  }

  return {
    email,
    name,
    role: deriveRole(roleValues)
  };
}

/**
 * Validates a raw Bearer token string and returns the user profile.
 * Used by endpoints that receive the token via a mechanism other than the
 * Authorization header (e.g. the /api/docs query-param handoff).
 */
export async function getUserContextFromToken(token: string): Promise<UserProfile> {
  const principal = await parseBearerToken(`Bearer ${token}`);
  if (principal) return principal;
  throw new HttpError(401, "Authentication is required.", "unauthorized");
}

export async function getUserContext(request: HttpRequest): Promise<UserProfile> {
  const allowDevHeaders = process.env.ALLOW_DEV_HEADERS === "true";

  if (allowDevHeaders) {
    const role = request.headers.get("x-dev-role");
    const email = request.headers.get("x-dev-email");
    const name = request.headers.get("x-dev-name");

    if (role && email && name) {
      return {
        role: role as UserRole,
        email,
        name
      };
    }
  }

  const principalHeader = request.headers.get("x-ms-client-principal");

  if (principalHeader) {
    const principal = parseStaticWebAppPrincipal(principalHeader);

    if (principal) {
      return principal;
    }
  }

  const authorizationHeader = request.headers.get("authorization");

  if (authorizationHeader?.startsWith("Bearer ")) {
    const principal = await parseBearerToken(authorizationHeader);

    if (principal) {
      return principal;
    }
  }

  throw new HttpError(401, "Authentication is required.", "unauthorized");
}

export function requireRoles(user: UserProfile, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(
      403,
      "You do not have permission to perform this action.",
      "forbidden"
    );
  }
}
