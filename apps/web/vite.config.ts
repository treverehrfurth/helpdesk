import { fileURLToPath, URL } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL("../../", import.meta.url));
  const rootEnv = loadEnv(mode, envDir, "");
  const apiDevPort = rootEnv.VITE_DEV_API_PORT || process.env.VITE_DEV_API_PORT || "7071";

  const getSharedEntraEnv = (viteKey: string, sharedKey: string) =>
    rootEnv[viteKey] || rootEnv[sharedKey] || "";

  return {
    envDir,
    define: {
      "import.meta.env.VITE_ENTRA_TENANT_ID": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_TENANT_ID", "ENTRA_TENANT_ID")
      ),
      "import.meta.env.VITE_ENTRA_API_CLIENT_ID": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_API_CLIENT_ID", "ENTRA_API_CLIENT_ID")
      ),
      "import.meta.env.VITE_ENTRA_TECH_GROUP_ID": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_TECH_GROUP_ID", "ENTRA_TECH_GROUP_ID")
      ),
      "import.meta.env.VITE_ENTRA_ADMIN_GROUP_ID": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_ADMIN_GROUP_ID", "ENTRA_ADMIN_GROUP_ID")
      ),
      "import.meta.env.VITE_ENTRA_TECH_ROLE": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_TECH_ROLE", "ENTRA_TECH_ROLE")
      ),
      "import.meta.env.VITE_ENTRA_ADMIN_ROLE": JSON.stringify(
        getSharedEntraEnv("VITE_ENTRA_ADMIN_ROLE", "ENTRA_ADMIN_ROLE")
      )
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@it-helpdesk/shared": fileURLToPath(
          new URL("../../packages/shared/src/index.ts", import.meta.url)
        ),
        "@it-helpdesk/ui": fileURLToPath(
          new URL("../../packages/ui/src/index.ts", import.meta.url)
        )
      }
    },
    server: {
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiDevPort}`
      }
    }
  };
});
