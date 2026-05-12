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
    `[dev]        Run 'nvm use' to switch (the repo pins to Node ${REQUIRED_NODE_MAJOR} via .nvmrc), then re-run npm run dev.\n\n`
  );
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const apiPort = process.env.API_DEV_PORT || "7071";

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
    if (shuttingDown) {
      return;
    }

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
  if (shuttingDown) {
    return;
  }

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
  title: "Help Desk  ·  Full Stack  ·  Mock auth",
  rows: [
    ["Web", "http://localhost:5173"],
    ["API", `http://localhost:${apiPort}/api`]
  ],
  notes: [
    "API Portal unavailable in mock auth — use npm run dev:entra",
    "Set VERBOSE=1 for full API log output"
  ]
});

startProcess("api", ["npm", "run", "dev:api", "--", "--port", apiPort], {
  AZURE_STORAGE_CONNECTION_STRING: AZURITE_CONNECTION_STRING,
  // Suppress pg-connection-string SSL-mode deprecation warning — it's a library
  // warning about a future breaking change, not an actual problem in this version.
  NODE_NO_WARNINGS: "1"
});

startProcess(
  "web",
  ["npm", "run", "dev", "--workspace", "@it-helpdesk/web", "--"],
  {
    VITE_DEV_API_PORT: apiPort,
    VITE_AUTH_MODE: "mock",
    VITE_USE_MOCK_API: "false",
    VITE_DEV_ROLE: "admin"
  }
);
