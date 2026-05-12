import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_error",
    public details?: unknown
  ) {
    super(message);
  }
}

export function json<T>(status: number, data: T): HttpResponseInit {
  return {
    status,
    jsonBody: {
      data
    }
  };
}

export function noContent(): HttpResponseInit {
  return {
    status: 204
  };
}

export async function readJsonBody<T>(request: HttpRequest) {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "The request body must contain valid JSON.");
  }
}

export function handleError(error: unknown): HttpResponseInit {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      jsonBody: {
        error: error.code,
        message: error.message,
        details: error.details
      }
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      jsonBody: {
        error: "validation_error",
        message: "Request validation failed.",
        details: error.flatten()
      }
    };
  }

  console.error(error);

  return {
    status: 500,
    jsonBody: {
      error: "internal_error",
      message: "Unexpected server error."
    }
  };
}
