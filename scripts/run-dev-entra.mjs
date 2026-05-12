/**
 * Entra dev mode
 *
 * Same full stack as `npm run dev` (web + API + Azurite) but forces real
 * Microsoft Entra ID sign-in. Use this to test auth flows, role resolution,
 * and token handling locally without deploying.
 *
 * Requires these values in your root .env:
 *   VITE_ENTRA_CLIENT_ID, ENTRA_TENANT_ID, ENTRA_API_CLIENT_ID,
 *   ENTRA_ADMIN_GROUP_ID, ENTRA_TECH_GROUP_ID
 *
 * Data is still in-memory unless DATABASE_URL is also set.
 *
 * Usage:
 *   npm run dev:entra
 */

import { spawn, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startAzurite, AZURITE_CONNECTION_STRING } from "./start-azurite.mjs";
import { shouldPrint, isApiReady, printBanner, ok, working } from "./dev-utils.mjs";

const REQUIRED_NODE_MAJOR = 22;
const actualNodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (actualNodeMajor !== REQUIRED_NODE_MAJOR) {
  process.stderr.write(
    `\n[dev] ERROR: Node.js v${process.versions.node} detected — Azure Functions requires Node ${REQUIRED_NODE_MAJOR}.\n` +
    `[dev]        Run 'nvm use' to switch (the repo pins to Node ${REQUIRED_NODE_MAJOR} via .nvmrc), then re-run npm run dev:entra.\n\n`
  );
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const apiPort = process.env.API_DEV_PORT || "7071";

process.stdout.write(working("Building shared types…"));
try {
  execSync("npm run build --workspace @it-helpdesk/shared", {
    cwd: rootDir,
    stdio: "pipe"
  });
  process.stdout.write(ok("Shared types built"));
} catch (e) {
  process.stderr.write("[shared] Build failed — API may use stale types.\n");
  if (e.stdout) process.stderr.write(e.stdout.toString());
  if (e.stderr) process.stderr.write(e.stderr.toString());
}

const children = [];
let shuttingDown = false;

function startProcess(name, args, extraEnv = {}) {
  const child = spawn(args[0], args.slice(1), {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: ["inherit", "pipe", "pipe"]
  });

  const prefix = `[${name}]`;

  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) continue;
      if (name === "api" && isApiReady(line)) {
        process.stdout.write(ok("API ready"));
        continue;
      }
      if (shouldPrint(line, name)) {
        const out = name === "web" ? `${line}\n` : `${prefix} ${line}\n`;
        process.stdout.write(out);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) continue;
      if (shouldPrint(line, name)) {
        const out = name === "web" ? `${line}\n` : `${prefix} ${line}\n`;
        process.stderr.write(out);
      }
    }
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    shuttingDown = true;

    for (const current of children) {
      if (current !== child && !current.killed) {
        current.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  children.push(child);
  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 2_000).unref();

  process.kill(process.pid, signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await startAzurite(children);

printBanner({
  title: "Help Desk  ·  Full Stack  ·  Entra auth",
  rows: [
    ["Web", "http://localhost:5173"],
    ["API", `http://localhost:${apiPort}/api`],
    ["API Portal", "http://localhost:5173/api/docs"]
  ],
  notes: [
    "Signed in via real Microsoft Entra ID",
    "Set VERBOSE=1 for full API log output"
  ]
});

startProcess("api", ["npm", "run", "dev:api", "--", "--port", apiPort], {
  AZURE_STORAGE_CONNECTION_STRING: AZURITE_CONNECTION_STRING,
  // Dev headers are disabled in Entra mode — all auth goes through real tokens.
  ALLOW_DEV_HEADERS: "false",
  NODE_NO_WARNINGS: "1"
});

startProcess(
  "web",
  ["npm", "run", "dev", "--workspace", "@it-helpdesk/web", "--"],
  {
    VITE_DEV_API_PORT: apiPort,
    VITE_AUTH_MODE: "entra",
    VITE_USE_MOCK_API: "false"
  }
);
