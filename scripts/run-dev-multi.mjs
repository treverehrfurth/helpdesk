/**
 * Multi-user dev mode
 *
 * Starts one shared API (in-memory, no database) and three frontend instances,
 * each pre-authenticated as a different role so you can simulate real interactions
 * across Admin, Technician, and End User in the same session.
 *
 *   Admin    → http://localhost:5180  (Avery Morgan)
 *   Tech     → http://localhost:5181  (Jordan Lee)
 *   End User → http://localhost:5182  (Maya Patel)
 *
 * All three share the same in-memory API, so messages and ticket updates
 * created in one window appear immediately in the others.
 *
 * Usage:
 *   npm run dev:multi
 */

import { spawn, execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startAzurite, AZURITE_CONNECTION_STRING } from "./start-azurite.mjs";
import { shouldPrint, isApiReady, printBanner, ok, working } from "./dev-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const webDir = resolve(rootDir, "apps/web");
const apiPort = process.env.API_DEV_PORT || "7071";

const viteBin = resolve(rootDir, "node_modules/.bin/vite");

// Ensure shared package is built before the API starts, so any new exports
// are available in dist/index.cjs (the API resolves shared via its built output).
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

function startProcess(name, args, extraEnv = {}, cwd = rootDir) {
  const child = spawn(args[0], args.slice(1), {
    cwd,
    env: { ...process.env, ...extraEnv },
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
        process.stdout.write(`${prefix} ${line}\n`);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) continue;
      if (shouldPrint(line, name)) {
        process.stderr.write(`${prefix} ${line}\n`);
      }
    }
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    // Only tear everything down on a clean exit or fatal signal,
    // not on a non-zero exit code from a single process (e.g. port conflict)
    if (signal || code === 0) {
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
    }
  });

  children.push(child);
  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill("SIGKILL");
    }
  }, 2_000).unref();

  process.kill(process.pid, signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Shared env for all three frontend instances:
// - mock auth so each window sends x-dev-* identity headers
// - real local API so all three share the same in-memory state
const sharedWebEnv = {
  VITE_AUTH_MODE: "mock",
  VITE_USE_MOCK_API: "false",
  VITE_DEV_API_PORT: apiPort
};

await startAzurite(children);

printBanner({
  title: "Help Desk  ·  Multi-user  ·  Mock auth",
  rows: [
    ["Admin (Avery Morgan)", "http://localhost:5180"],
    ["Tech  (Jordan Lee)", "http://localhost:5181"],
    ["User  (Maya Patel)", "http://localhost:5182"],
    ["API", `http://localhost:${apiPort}/api`]
  ],
  notes: [
    "All tabs share the same in-memory API state",
    "API Portal unavailable in mock auth — use npm run dev:entra",
    "Set VERBOSE=1 for full API log output"
  ]
});

startProcess("api", ["npm", "run", "dev:api", "--", "--port", apiPort], {
  AZURE_STORAGE_CONNECTION_STRING: AZURITE_CONNECTION_STRING
});

startProcess(
  "admin",
  [viteBin, "--port", "5180", "--strictPort"],
  { ...sharedWebEnv, VITE_DEV_ROLE: "admin" },
  webDir
);

startProcess(
  "tech",
  [viteBin, "--port", "5181", "--strictPort"],
  { ...sharedWebEnv, VITE_DEV_ROLE: "tech" },
  webDir
);

startProcess(
  "user",
  [viteBin, "--port", "5182", "--strictPort"],
  { ...sharedWebEnv, VITE_DEV_ROLE: "end_user" },
  webDir
);
