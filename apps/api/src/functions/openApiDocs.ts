import { app } from "@azure/functions";

import { handleError } from "../middleware/http";
import { getUserContext, requireRoles } from "../services/auth/userContext";
import { openApiSpec } from "../openApiSpec";

/**
 * Serves the Swagger UI HTML page. The page itself is open so direct navigation
 * and hard refresh work, but the spec endpoint (/api/openapi.json) requires admin
 * auth — unauthenticated users see an error and cannot read the docs.
 *
 * Token flow:
 *   1. Nav link passes ?token= → stored in sessionStorage, cleared from URL.
 *   2. Hard refresh in the same tab → token recovered from sessionStorage.
 *   3. New tab / fresh URL with no prior session → no token, spec returns 401.
 *
 * This mirrors session-based Swagger UIs (e.g. Kimai): authenticated sessions
 * persist across refreshes; unauthenticated users are blocked.
 */
app.http("getApiDocs", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "docs",
  handler: async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Help Desk — API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; padding: 0; }
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { font-size: 1.5rem; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      // Resolve token: prefer ?token= query param (from nav link), fall back to
      // sessionStorage so hard refresh in the same tab keeps the session alive.
      const STORAGE_KEY = "helpdesk_api_token";
      const queryToken = new URLSearchParams(window.location.search).get("token") || "";
      const token = queryToken || localStorage.getItem(STORAGE_KEY) || "";

      if (queryToken) {
        // Persist across tabs (mirrors cookie-based session behavior) and remove from URL.
        localStorage.setItem(STORAGE_KEY, queryToken);
        history.replaceState(null, "", window.location.pathname);
      }

      const ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        requestInterceptor: function(req) {
          if (token) req.headers["Authorization"] = "Bearer " + token;
          return req;
        },
        onComplete: function() {
          if (token) ui.preauthorizeApiKey("BearerAuth", token);
        }
      });
    </script>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
});

/**
 * Serves the OpenAPI 3.0 JSON spec. Requires admin role — this is what enforces
 * access control. Unauthenticated users get 401; Swagger UI surfaces this as
 * "Failed to load API definition", blocking access to the docs.
 */
app.http("getOpenApiSpec", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "openapi.json",
  handler: async (request) => {
    try {
      const user = await getUserContext(request);
      requireRoles(user, ["admin"]);

      return new Response(JSON.stringify(openApiSpec, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      return handleError(error);
    }
  }
});
