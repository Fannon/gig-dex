interface RequestContext {
  provider: string;
  url: string;
  method?: string;
  endpoint?: string;
  secrets?: readonly (string | undefined)[];
}

interface RequestDetails {
  endpoint: string;
  method: string;
  status?: number;
  statusText?: string;
  requestId?: string;
  apiDetails?: string;
}

class SyncRequestError extends Error {
  readonly details: RequestDetails;
  constructor(message: string, details: RequestDetails) {
    super(message);
    this.name = "SyncRequestError";
    this.details = details;
  }
}

function redact(value: string, secrets: RequestContext["secrets"] = []): string {
  let result = value;
  for (const secret of secrets) if (secret) result = result.split(secret).join("[redacted]");
  return result
    .replace(/(Bearer\s+)[^\s"',;]+/gi, "$1[redacted]")
    .replace(
      /((?:access_token|refresh_token|code_verifier|client_secret|authorization)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      "$1[redacted]",
    );
}

function requestDetails(context: RequestContext): RequestDetails {
  const url = new URL(context.url);
  return { endpoint: context.endpoint ?? `${url.origin}${url.pathname}`, method: context.method ?? "GET" };
}

/** Log request context and errors, never request bodies or authorization headers. */
export function logSyncError(
  provider: string,
  operation: string,
  error: unknown,
  record?: { type: string; id: string },
): void {
  console.error(`[Gig-Dex sync] ${provider}: ${operation}`, {
    provider,
    operation,
    ...(record ? { recordType: record.type, recordId: record.id } : {}),
    errorType: error instanceof Error ? error.name : typeof error,
    message: redact(error instanceof Error ? error.message : "Unknown error"),
    ...(error instanceof SyncRequestError ? error.details : {}),
    stack: error instanceof Error ? redact(error.stack ?? "").slice(0, 8000) : undefined,
  });
}

export async function fetchSyncResponse(context: RequestContext, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(context.url, init);
  } catch (error) {
    const reason = redact(error instanceof Error ? error.message : "Unknown network error", context.secrets).slice(
      0,
      350,
    );
    const failure = new SyncRequestError(
      `${context.provider} network request failed: ${reason}`,
      requestDetails(context),
    );
    logSyncError(context.provider, "Network request failed", failure);
    throw failure;
  }
}

export async function syncHttpError(context: RequestContext, response: Response, fallback?: string): Promise<Error> {
  const raw = await response.text().catch(() => "Could not read the error response.");
  let summary = raw;
  try {
    const result = JSON.parse(raw);
    summary = result.error_summary ?? result.error_description ?? result.error?.message ?? result.error ?? "";
    if (typeof summary !== "string") summary = "";
  } catch {
    // Some providers return plain text for invalid requests.
  }
  const reason = redact(summary, context.secrets).trim().replace(/\s+/g, " ").slice(0, 350);
  const operation = new URL(context.url).pathname.replace(/^\/(?:2|v1\.0|drive\/v3|upload\/drive\/v3)\//, "");
  const message = `${fallback ?? `${context.provider} ${operation} failed`} (${response.status})${reason ? `: ${reason}` : "."}`;
  const error = new SyncRequestError(message, {
    ...requestDetails(context),
    status: response.status,
    statusText: response.statusText,
    requestId:
      response.headers.get("x-dropbox-request-id") ??
      response.headers.get("request-id") ??
      response.headers.get("x-guploader-uploadid") ??
      undefined,
    apiDetails: redact(raw, context.secrets).slice(0, 4000),
  });
  logSyncError(context.provider, "HTTP request failed", error);
  return error;
}
