type Graph8ErrorCode =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "payment_required"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network"
  | "bad_response";

/** Normalized Graph8 failure. `message` is safe to show users; it never contains credentials or record bodies. */
export class Graph8Error extends Error {
  readonly code: Graph8ErrorCode;
  readonly operation: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(opts: {
    code: Graph8ErrorCode;
    operation: string;
    status?: number | null;
    message?: string;
    details?: unknown;
  }) {
    super(opts.message ?? defaultMessage(opts.code, opts.operation));
    this.name = "Graph8Error";
    this.code = opts.code;
    this.operation = opts.operation;
    this.status = opts.status ?? null;
    this.retryable = ["rate_limited", "server_error", "timeout", "network"].includes(opts.code);
    this.details = opts.details;
  }
}

export function codeForStatus(status: number): Graph8ErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 402) return "payment_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 429) return "rate_limited";
  return "server_error";
}

function defaultMessage(code: Graph8ErrorCode, operation: string): string {
  switch (code) {
    case "not_configured":
      return "Graph8 is not configured. Add GRAPH8_API_KEY to the server environment.";
    case "unauthorized":
      return "The Graph8 connection needs a valid API key.";
    case "forbidden":
      return `The Graph8 key cannot access this capability (${operation}). This does not mean the data is absent.`;
    case "payment_required":
      return "Graph8 AI credits or subscription are unavailable. Your review state was preserved.";
    case "not_found":
      return `The Graph8 record is missing or inaccessible (${operation}).`;
    case "conflict":
      return `The Graph8 record changed since it was read (${operation}). Reload and try again.`;
    case "validation":
      return `Graph8 rejected the request (${operation}).`;
    case "rate_limited":
      return "Graph8 is rate limiting requests. Try again shortly.";
    case "timeout":
      return `Graph8 did not respond in time (${operation}).`;
    case "network":
      return `Could not reach Graph8 (${operation}).`;
    case "bad_response":
      return `Graph8 returned an unexpected response (${operation}).`;
    default:
      return `Graph8 failed while running ${operation}.`;
  }
}
