import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const apiDir = resolve(rootDir, "apps/api");
const funcHomeDir = resolve(rootDir, ".func-home");

function parseEnvFile(filePath) {
  try {
    const source = readFileSync(filePath, "utf8");
    const entries = {};

    for (const rawLine of source.split(/\r?\n/u)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");

      if (separatorIndex < 1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      entries[key] = value;
    }

    return entries;
  } catch {
    return {};
  }
}

function loadRootEnv() {
  return {
    ...parseEnvFile(resolve(rootDir, ".env")),
    ...parseEnvFile(resolve(rootDir, ".env.local"))
  };
}

function ensureLocalSettings(env) {
  const localSettingsPath = resolve(apiDir, "local.settings.json");
  // AzureWebJobsStorage is the Functions host's own infrastructure storage (timer
  // locks, ScheduleMonitor, etc.).  The .NET host requires either the legacy
  // "UseDevelopmentStorage=true" shorthand or a full connection string that
  // includes both BlobEndpoint AND QueueEndpoint.  Our Azurite only runs the
  // blob service, so the shorthand is the safest default for local dev.
  const azureWebJobsStorage =
    env.AzureWebJobsStorage ||
    "UseDevelopmentStorage=true";

  const values = {
    AzureWebJobsStorage: azureWebJobsStorage,
    FUNCTIONS_WORKER_RUNTIME: env.FUNCTIONS_WORKER_RUNTIME || "node"
  };

  // Forward app-level env vars into local.settings.json so the Functions
  // worker process receives them (func start loads settings from here).
  for (const key of [
    "DATABASE_URL",
    "AZURE_STORAGE_CONNECTION_STRING",
    "AZURE_STORAGE_CONTAINER_NAME"
  ]) {
    if (env[key] !== undefined && env[key] !== "") {
      values[key] = env[key];
    }
  }

  writeFileSync(
    localSettingsPath,
    JSON.stringify({ IsEncrypted: false, Values: values }, null, 2)
  );
}

const args = process.argv.slice(2);
const rootEnv = loadRootEnv();
const env = {
  ...rootEnv,
  ...process.env,
  HOME: funcHomeDir
};

mkdirSync(funcHomeDir, { recursive: true });
ensureLocalSettings(env);

const child = spawn("func", ["start", ...args], {
  cwd: apiDir,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
