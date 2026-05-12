import { useEffect } from "react";

import { authentication, app } from "@microsoft/teams-js";
import { useMsal } from "@azure/msal-react";

/**
 * Redirect target for the Teams auth popup.
 * MSAL (via MsalProvider) processes the token from the URL hash automatically.
 * Once MSAL is done, we notify Teams so it closes the popup and resolves the
 * authenticate() promise in the parent iFrame.
 */
export function TeamsAuthEnd() {
  const { inProgress } = useMsal();

  useEffect(() => {
    if (inProgress !== "none") return;

    async function notify() {
      try {
        await app.initialize();
        authentication.notifySuccess("authenticated");
      } catch {
        // If Teams SDK fails to init we can't do much — popup will time out
      }
    }

    void notify();
  }, [inProgress]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <p>Completing sign in…</p>
    </div>
  );
}
