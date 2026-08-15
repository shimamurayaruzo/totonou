import "server-only";

import { z } from "zod";

import { log } from "@/lib/logger";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ExternalServiceError extends ApiError {
  readonly service: string;

  constructor(
    service: string,
    message = `${service} integration failed`,
    status = 502,
  ) {
    super(status, "EXTERNAL_SERVICE_ERROR", message);
    this.name = "ExternalServiceError";
    this.service = service;
  }
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Request body validation failed",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    );
  }
  return parsed.data;
}

export async function parseOptionalJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const text = await request.text();
  if (!text.trim()) {
    const parsed = schema.safeParse({});
    if (parsed.success) {
      return parsed.data;
    }
    throw new ApiError(422, "VALIDATION_ERROR", "Request body is required");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Request body validation failed",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      })),
    );
  }
  return parsed.data;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

export async function errorResponse(
  error: unknown,
  options: {
    operation?: string;
    correlationId?: string;
    userId?: string;
    service?: string;
  } = {},
): Promise<Response> {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  const service =
    error instanceof ExternalServiceError
      ? error.service
      : (options.service ?? "application");

  await log.error(options.operation ?? "api_error", "API request failed", {
    correlationId: options.correlationId,
    userId: options.userId,
    context: {
      service,
      status: apiError.status,
      retry: apiError.status >= 500,
      error: {
        name: error instanceof Error ? error.name : "UnknownError",
        code: apiError.code,
      },
    },
    humanNote: "The request was stopped safely and returned a structured error.",
    aiTodo:
      apiError.status >= 500
        ? "Inspect the correlated operations and verify integration availability."
        : undefined,
  });

  return Response.json(
    {
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
    },
    { status: apiError.status },
  );
}

export function clampLimit(value: number | undefined, fallback = 100): number {
  return Math.min(100, Math.max(1, Math.trunc(value ?? fallback)));
}

export function createCorrelationId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
