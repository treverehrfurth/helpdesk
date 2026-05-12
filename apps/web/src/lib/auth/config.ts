export type AuthMode = "mock" | "entra";

export const authMode: AuthMode =
  import.meta.env.VITE_AUTH_MODE === "entra" ? "entra" : "mock";

export const useMockApi = import.meta.env.VITE_USE_MOCK_API !== "false";
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

const fallbackOrigin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

const entraApiClientId = import.meta.env.VITE_ENTRA_API_CLIENT_ID ?? "";

export const entraConfig = {
  clientId: import.meta.env.VITE_ENTRA_CLIENT_ID ?? "",
  tenantId: import.meta.env.VITE_ENTRA_TENANT_ID ?? "",
  redirectUri: import.meta.env.VITE_ENTRA_REDIRECT_URI ?? fallbackOrigin,
  apiClientId: entraApiClientId,
  apiScope:
    import.meta.env.VITE_ENTRA_API_SCOPE ??
    (entraApiClientId ? `api://${entraApiClientId}/user_impersonation` : ""),
  techGroupId: import.meta.env.VITE_ENTRA_TECH_GROUP_ID ?? "",
  adminGroupId: import.meta.env.VITE_ENTRA_ADMIN_GROUP_ID ?? "",
  techRole: import.meta.env.VITE_ENTRA_TECH_ROLE ?? "HelpDesk.Tech",
  adminRole: import.meta.env.VITE_ENTRA_ADMIN_ROLE ?? "HelpDesk.Admin"
};

export const isEntraConfigured = Boolean(
  entraConfig.clientId && entraConfig.tenantId && entraConfig.apiScope
);
