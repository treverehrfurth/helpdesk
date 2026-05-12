import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";

import App from "./app/App";
import { authMode } from "./lib/auth/config";
import { msalInstance } from "./lib/auth/entra";
import "./styles/global.css";

// createBrowserRouter provides the data router context required by useBlocker.
// App's internal <Routes> still handles all route matching as normal.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

const appTree = <RouterProvider router={router} />;

async function init() {
  // MSAL v3 requires initialize() to complete before any API call
  // (including getActiveAccount). Do this before the first render.
  if (authMode === "entra" && msalInstance) {
    await msalInstance.initialize();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {authMode === "entra" && msalInstance ? (
        <MsalProvider instance={msalInstance}>{appTree}</MsalProvider>
      ) : (
        appTree
      )}
    </React.StrictMode>
  );
}

void init();
