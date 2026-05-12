import { useEffect } from "react";

import { app } from "@microsoft/teams-js";
import { useMsal } from "@azure/msal-react";

import { loginRequest } from "../../lib/auth/entra";

/**
 * Loaded inside the Teams-managed auth popup.
 * Initialises Teams, then kicks off the MSAL redirect so Microsoft's login
 * page can run in a real browser window (not an iFrame).
 */
export function TeamsAuthStart() {
  const { instance, inProgress } = useMsal();

  useEffect(() => {
    if (inProgress !== "none") return;

    async function start() {
      await app.initialize();
      await instance.loginRedirect({
        scopes: loginRequest.scopes.length
          ? loginRequest.scopes
          : ["openid", "profile", "email"],
        redirectUri: `${window.location.origin}/auth-end`,
      });
    }
    void start();
  }, [instance, inProgress]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <p>Signing in…</p>
    </div>
  );
}
