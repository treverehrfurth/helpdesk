import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} from "@azure/storage-blob";

import { HttpError } from "../../middleware/http";

type UploadTarget = {
  uploadUrl: string;
  blobUrl: string;
  expiresOn: string;
};

function parseConnectionString(connectionString: string) {
  const parts = Object.fromEntries(
    connectionString.split(";").filter(Boolean).map((segment) => {
      const [key, ...rest] = segment.split("=");
      return [key, rest.join("=")];
    })
  );

  const accountName = parts.AccountName;
  const accountKey = parts.AccountKey;

  if (!accountName || !accountKey) {
    throw new HttpError(
      500,
      "AZURE_STORAGE_CONNECTION_STRING must include AccountName and AccountKey.",
      "storage_configuration_error"
    );
  }

  return { accountName, accountKey };
}

function isAzuriteConnectionString(connectionString: string): boolean {
  return (
    connectionString.includes("127.0.0.1") ||
    connectionString.includes("localhost") ||
    connectionString.includes("UseDevelopmentStorage=true")
  );
}

/**
 * Upload file bytes to blob storage server-side, returning the blob URL.
 *
 * For local Azurite dev: bypasses Azurite entirely and returns a data URL so
 * that no HTTP auth or CORS setup is needed. The data URL is stored as the
 * storageUrl and returned directly as the download URL.
 *
 * For production: uploads via the Azure SDK (server-to-server, no CORS needed)
 * and returns the blob URL.
 */
export async function uploadBlobData(
  _ticketId: string,
  _fileName: string,
  contentType: string,
  data: Buffer
): Promise<string> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw new HttpError(503, "Azure Blob Storage is not configured.", "storage_not_configured");
  }

  if (isAzuriteConnectionString(connectionString)) {
    // Store as a data URL — works in-memory with zero external calls,
    // no Azurite auth/CORS issues. Resets on API restart (same as the
    // in-memory ticket store), which is fine for local dev.
    return `data:${contentType};base64,${data.toString("base64")}`;
  }

  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "ticket-attachments";
  const { accountName, accountKey } = parseConnectionString(connectionString);
  const safeFileName = sanitizeFileName(_fileName);
  const blobName = `tickets/${_ticketId}/${Date.now()}-${safeFileName}`;

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const blockBlobClient = blobServiceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType }
  });

  return blockBlobClient.url;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function isBlobStorageConfigured() {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

export async function createAttachmentUploadTarget(
  ticketId: string,
  fileName: string,
  contentType?: string
): Promise<UploadTarget> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "ticket-attachments";

  if (!connectionString) {
    throw new HttpError(
      503,
      "Azure Blob Storage is not configured.",
      "storage_not_configured"
    );
  }

  const { accountName, accountKey } = parseConnectionString(connectionString);
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);

  const safeFileName = sanitizeFileName(fileName);
  const blobName = `tickets/${ticketId}/${Date.now()}-${safeFileName}`;
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey
  );
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 15 * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      version: "2021-12-02",
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"),
      startsOn,
      expiresOn,
      contentType
    },
    sharedKeyCredential
  ).toString();

  return {
    uploadUrl: `${blobClient.url}?${sas}`,
    blobUrl: blobClient.url,
    expiresOn: expiresOn.toISOString()
  };
}

export async function generateDownloadUrl(storageUrl: string): Promise<string> {
  // Local dev: data URLs are already the final download URL
  if (storageUrl.startsWith("data:")) {
    return storageUrl;
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "ticket-attachments";

  if (!connectionString) {
    throw new HttpError(
      503,
      "Azure Blob Storage is not configured.",
      "storage_not_configured"
    );
  }

  const { accountName, accountKey } = parseConnectionString(connectionString);

  const url = new URL(storageUrl);
  // blobName is everything after /<containerName>/
  const blobName = url.pathname.split(`/${containerName}/`)[1];

  if (!blobName) {
    throw new HttpError(400, "Invalid storage URL.", "invalid_storage_url");
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const sas = generateBlobSASQueryParameters(
    {
      version: "2021-12-02",
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn
    },
    sharedKeyCredential
  ).toString();

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const blobClient = blobServiceClient.getContainerClient(containerName).getBlockBlobClient(blobName);

  return `${blobClient.url}?${sas}`;
}
