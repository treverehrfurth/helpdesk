import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import type { UserProfile, UserRole } from "@it-helpdesk/shared";

import { authMode, entraConfig, isEntraConfigured } from "../../lib/auth/config";
import { apiClient } from "../../lib/api/http";
import {
  acquireApiAccessToken,
  deriveUserProfile,
  isInIframe,
  loginRequest
} from "../../lib/auth/entra";
import { directoryUsers, mockUsersByRole } from "../../lib/auth/mockDirectory";

type SessionContextValue = {
  authMode: "mock" | "entra";
  user: UserProfile;
  directory: UserProfile[];
  requestHeaders: Record<string, string>;
  canSwitchRole: boolean;
  isPreviewingRole: boolean;
  isReady: boolean;
  isAuthenticated: boolean;
  isHydratingUser: boolean;
  isAccessDenied: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setMockRole: (role: UserRole) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  if (authMode === "entra" && isEntraConfigured) {
    return <EntraAuthProvider>{children}</EntraAuthProvider>;
  }

  if (authMode === "entra") {
    return <MissingEntraConfigProvider>{children}</MissingEntraConfigProvider>;
  }

  return <MockAuthProvider>{children}</MockAuthProvider>;
}

function MockAuthProvider({ children }: PropsWithChildren) {
  const baseRole = ((): UserRole => {
    const devRole = import.meta.env.VITE_DEV_ROLE;
    if (devRole === "tech" || devRole === "admin") return devRole;
    return "end_user";
  })();

  const [mockRole, setMockRole] = useState<UserRole>(baseRole);

  const user = mockUsersByRole[mockRole];

  return (
    <SessionContext.Provider
      value={{
        authMode,
        user,
        directory: directoryUsers,
        requestHeaders: {
          "x-dev-email": user.email,
          "x-dev-name": user.name,
          "x-dev-role": user.role
        },
        canSwitchRole: baseRole === "admin",
        isPreviewingRole: mockRole !== baseRole,
        isReady: true,
        isAuthenticated: true,
        isHydratingUser: false,
        isAccessDenied: false,
        signIn: async () => undefined,
        signOut: async () => undefined,
        setMockRole
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

function EntraAuthProvider({ children }: PropsWithChildren) {
  const { accounts, inProgress, instance } = useMsal();
  const isSignedIn = useIsAuthenticated();
  const [accessToken, setAccessToken] = useState("");
  const [teamsAccessToken, setTeamsAccessToken] = useState("");
  const [teamsSsoPending, setTeamsSsoPending] = useState(true);
  const [resolvedUser, setResolvedUser] = useState<UserProfile | null>(null);
  const [isResolvingUser, setIsResolvingUser] = useState(false);
  const [hasResolvedUserAttempt, setHasResolvedUserAttempt] = useState(false);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const hasForcedRefreshRef = useRef(false);
  const teamsSsoAttemptedRef = useRef(false);
  const navigate = useNavigate(); // used to handle Teams deep link subEntityId on notification click

  const activeAccount = instance.getActiveAccount() ?? accounts[0] ?? null;
  const fallbackUser = activeAccount ? deriveUserProfile(activeAccount) : null;
  const baseUser = resolvedUser ?? fallbackUser;
  const effectiveToken = teamsAccessToken || accessToken;
  const user =
    baseUser && previewRole && baseUser.role === "admin"
      ? { ...baseUser, role: previewRole }
      : baseUser;

  useEffect(() => {
    if (accounts[0] && !instance.getActiveAccount()) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  useEffect(() => {
    hasForcedRefreshRef.current = false;
    setResolvedUser(null);
    setHasResolvedUserAttempt(false);
  }, [activeAccount?.homeAccountId]);

  // Attempt Teams SSO silently on first render.
  // Works in both Teams desktop (WebView2, not an iframe) and Teams browser (iframe).
  // app.initialize() rejects after 2s when not in Teams, failing gracefully.
  useEffect(() => {
    if (teamsSsoAttemptedRef.current) return;
    teamsSsoAttemptedRef.current = true;

    async function tryTeamsSSO() {
      try {
        const { app, authentication } = await import("@microsoft/teams-js");
        await Promise.race([
          app.initialize(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Not in Teams context")), 2000)
          ),
        ]);

        // Read subEntityId from context — set by Teams deep links from notifications.
        // Navigate to the specified path after auth so the user lands on the right ticket.
        const context = await app.getContext().catch(() => null);
        const subEntityId = context?.page?.subPageId;

        const teamsToken = await authentication.getAuthToken();

        const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";
        const response = await fetch(`${apiBase}/auth/teams-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamsToken }),
        });

        if (response.ok) {
          const data = await response.json() as { accessToken: string };
          setTeamsAccessToken(data.accessToken);
          if (subEntityId) {
            navigate(subEntityId, { replace: true });
          }
        }
      } catch (err) {
        console.warn("Teams SSO silent auth failed, falling back to interactive:", err);
      } finally {
        setTeamsSsoPending(false);
      }
    }

    void tryTeamsSSO();
  }, []);

  useEffect(() => {
    let active = true;

    async function resolveAccessToken() {
      if (!activeAccount || inProgress !== "none") {
        return;
      }

      try {
        const token = await acquireApiAccessToken(instance, activeAccount);

        if (active) {
          setAccessToken(token);
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setAccessToken("");
        }
      }
    }

    if (activeAccount) {
      void resolveAccessToken();
    } else {
      setAccessToken("");
    }

    return () => {
      active = false;
    };
  }, [activeAccount, inProgress, instance]);

  useEffect(() => {
    let active = true;

    async function resolveUser() {
      if (!effectiveToken) {
        if (active) {
          setResolvedUser(null);
          setIsResolvingUser(false);
          setHasResolvedUserAttempt(false);
        }

        return;
      }

      if (active) {
        setIsResolvingUser(true);
      }

      try {
        const currentUser = await apiClient.getCurrentUser({
          Authorization: `Bearer ${effectiveToken}`
        });

        // When using Teams SSO the token already has the right claims — skip MSAL force-refresh.
        if (
          active &&
          currentUser.role === "end_user" &&
          activeAccount &&
          !teamsAccessToken &&
          !hasForcedRefreshRef.current
        ) {
          hasForcedRefreshRef.current = true;
          const refreshedToken = await acquireApiAccessToken(instance, activeAccount, {
            forceRefresh: true
          });

          if (active) {
            setAccessToken(refreshedToken);
          }

          return;
        }

        if (active) {
          setResolvedUser(currentUser);
          setIsResolvingUser(false);
          setHasResolvedUserAttempt(true);
        }
      } catch (error) {
        console.error(error);

        if (active) {
          setResolvedUser(null);
          setIsResolvingUser(false);
          setHasResolvedUserAttempt(true);
        }
      }
    }

    void resolveUser();

    return () => {
      active = false;
    };
  }, [effectiveToken]);

  return (
    <SessionContext.Provider
      value={{
        authMode,
        user: user ?? {
          email: "",
          name: "Not signed in",
          role: "end_user"
        },
        directory: user ? [user] : [],
        requestHeaders: effectiveToken
          ? {
              Authorization: `Bearer ${effectiveToken}`
            }
          : {},
        canSwitchRole: baseUser?.role === "admin",
        isPreviewingRole: previewRole !== null,
        isReady: inProgress === "none" && !isResolvingUser && !teamsSsoPending,
        isAuthenticated: Boolean(
          isEntraConfigured && (isSignedIn || teamsAccessToken) && effectiveToken
        ),
        isHydratingUser: Boolean(
          isEntraConfigured &&
            (isSignedIn || teamsAccessToken) &&
            effectiveToken &&
            !resolvedUser &&
            !hasResolvedUserAttempt
        ),
        isAccessDenied: Boolean(
          isEntraConfigured &&
            (isSignedIn || teamsAccessToken) &&
            effectiveToken &&
            !resolvedUser &&
            hasResolvedUserAttempt
        ),
        signIn: async () => {
          const scopes = loginRequest.scopes.length
            ? loginRequest.scopes
            : ["openid", "profile", "email"];
          if (isInIframe()) {
            // Teams blocks raw window.open — use the Teams SDK managed popup instead
            const { app, authentication } = await import("@microsoft/teams-js");
            await app.initialize();
            await authentication.authenticate({
              url: `${window.location.origin}/auth-start`,
              width: 600,
              height: 535,
            });
            // Tokens are now in localStorage from the popup; reload to pick them up
            window.location.reload();
          } else {
            await instance.loginRedirect({ scopes });
          }
        },
        signOut: async () => {
          if (isInIframe()) {
            await instance.logoutPopup({ postLogoutRedirectUri: entraConfig.redirectUri });
          } else {
            await instance.logoutRedirect({ postLogoutRedirectUri: entraConfig.redirectUri });
          }
        },
        setMockRole: (role) => {
          if (baseUser?.role === "admin") {
            setPreviewRole(role === baseUser.role ? null : role);
          }
        }
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

function MissingEntraConfigProvider({ children }: PropsWithChildren) {
  return (
    <SessionContext.Provider
      value={{
        authMode,
        user: {
          email: "",
          name: "Entra not configured",
          role: "end_user"
        },
        directory: [],
        requestHeaders: {},
        canSwitchRole: false,
        isPreviewingRole: false,
        isReady: true,
        isAuthenticated: false,
        isHydratingUser: false,
        isAccessDenied: false,
        signIn: async () => undefined,
        signOut: async () => undefined,
        setMockRole: () => undefined
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within an AuthProvider.");
  }

  return context;
}
