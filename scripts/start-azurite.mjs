/**
 * Starts Azurite (local Azure Blob Storage emulator) with in-memory persistence
 * so it always resets cleanly alongside the in-memory ticket store.
 *
 * CORS configuration and container creation use the @azure/storage-blob SDK
 * so auth is handled automatically — no manual SharedKey HMAC needed.
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verbose, ok, working } from "./dev-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

// Well-known Azurite dev account credentials — these are public test values,
// hardcoded in Azurite itself, safe to commit. See:
// https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite#well-known-storage-account-and-key
export const AZURITE_CONNECTION_STRING =
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OgqEGExEQdIqlR/jOtdMnQolTCZKkVgcq3AkleQm7kP4gQwIJb+RKqw==;" +
  "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;";

const CONTAINER_NAME = "ticket-attachments";

function waitForPort(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    function attempt() {
      const socket = createConnection(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Azurite did not start on port ${port} within ${timeout}ms`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    }

    attempt();
  });
}

async function configureCors(blobServiceClient) {
  await blobServiceClient.setProperties({
    cors: [
      {
        allowedOrigins: "*",
        allowedMethods: "DELETE,GET,HEAD,MERGE,POST,OPTIONS,PUT",
        allowedHeaders: "*",
        exposedHeaders: "*",
        maxAgeInSeconds: 86400
      }
    ]
  });
}

async function createContainer(blobServiceClient) {
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists();
}

/**
 * Starts the Azurite blob emulator, waits until it is ready, then configures
 * CORS and creates the blob container so browser uploads work.
 *
 * @param {import("node:child_process").ChildProcess[]} [children]
 */
export async function startAzurite(children) {
  const azuriteBin = resolve(rootDir, "node_modules/.bin/azurite-blob");

  const child = spawn(azuriteBin, ["--inMemoryPersistence", "--silent", "--skipApiVersionCheck"], {
    cwd: rootDir,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    if (!verbose) return;
    process.stdout.write(`[azurite] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    if (verbose || /error|Error/i.test(text)) {
      process.stderr.write(`[azurite] ${text}`);
    }
  });

  if (children) {
    children.push(child);
  }

  process.stdout.write(working("Blob emulator starting…"));
  await waitForPort(10000);

  const blobServiceClient = BlobServiceClient.fromConnectionString(AZURITE_CONNECTION_STRING);

  let corsOk = false;
  let containerOk = false;

  try {
    await configureCors(blobServiceClient);
    corsOk = true;
  } catch {
    // Azurite 3.35 / SDK v12.26 auth mismatch — non-fatal. Browser-direct uploads
    // use data URLs in local dev anyway (see blob.ts: isAzuriteConnectionString).
  }

  try {
    await createContainer(blobServiceClient);
    containerOk = true;
  } catch {
    // Same root cause as CORS — non-fatal for local dev.
  }

  process.stdout.write(ok("Blob emulator ready"));

  return child;
}
