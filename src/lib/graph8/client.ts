import "server-only";
import type { z } from "zod";
import { env } from "@/lib/env";
import { Graph8Error, codeForStatus } from "./errors";

type Query = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  operation: string;
  query?: Query;
  body?: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_GET_ATTEMPTS = 3;

/** Builds a path with URL-encoded IDs, so a record ID can never change the path or origin. */
export function path(strings: TemplateStringsArray, ...ids: Array<string | number>): string {
  return strings.reduce(
    (acc, part, i) => acc + part + (i < ids.length ? encodeURIComponent(String(ids[i])) : ""),
    "",
  );
}

export const graph8 = {
  get: (p: string, opts: RequestOptions) => request("GET", p, opts),
  post: (p: string, opts: RequestOptions) => request("POST", p, opts),
  patch: (p: string, opts: RequestOptions) => request("PATCH", p, opts),
};

export function parseResponse<S extends z.ZodType>(schema: S, json: unknown, operation: string): z.infer<S> {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[graph8] unexpected response shape for ${operation}:`, parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.code));
    throw new Graph8Error({ code: "bad_response", operation });
  }
  return parsed.data;
}

async function request(method: "GET" | "POST" | "PATCH", p: string, opts: RequestOptions): Promise<unknown> {
  const { GRAPH8_API_KEY, GRAPH8_BASE_URL } = env();
  if (!GRAPH8_API_KEY) {
    throw new Graph8Error({ code: "not_configured", operation: opts.operation });
  }
  if (!p.startsWith("/") || p.includes("://") || p.includes("..")) {
    throw new Error(`Refusing unsafe Graph8 path for ${opts.operation}`);
  }

  const base = new URL(GRAPH8_BASE_URL);
  const url = new URL(base.pathname.replace(/\/$/, "") + p, base.origin);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  // Only GETs are retried. A POST/PATCH with an uncertain outcome must be reconciled, not replayed.
  const attempts = method === "GET" ? MAX_GET_ATTEMPTS : 1;
  let lastError: Graph8Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await once(method, url, GRAPH8_API_KEY, opts);
    } catch (err) {
      if (!(err instanceof Graph8Error)) throw err;
      lastError = err;
      if (!err.retryable || attempt === attempts) break;
      const retryAfter = (err.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
      await sleep(retryAfter ?? backoff(attempt));
    }
  }
  throw lastError!;
}

async function once(method: string, url: URL, apiKey: string, opts: RequestOptions): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new Graph8Error({ code: timedOut ? "timeout" : "network", operation: opts.operation });
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      if (res.ok) throw new Graph8Error({ code: "bad_response", operation: opts.operation, status: res.status });
    }
  }

  if (!res.ok) {
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Math.min(Number(retryAfterHeader) * 1000, 10_000) : undefined;
    const code = codeForStatus(res.status);
    throw new Graph8Error({
      code,
      operation: opts.operation,
      status: res.status,
      // Graph8's own validation text (e.g. "Billing email is required.") tells the user what to fix in Graph8.
      message: code === "validation" ? validationMessage(json, opts.operation) : undefined,
      details: { retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined, body: res.status === 422 ? json : undefined },
    });
  }
  return json;
}

/** Field-level messages from a Graph8 validation error body; never echoes submitted values. */
function validationMessage(json: unknown, operation: string): string | undefined {
  const body = (json && typeof json === "object" ? json : {}) as { detail?: unknown; message?: unknown };
  const detail = (body.detail && typeof body.detail === "object" ? body.detail : {}) as { message?: unknown; fields?: unknown };
  const fields = Array.isArray(detail.fields)
    ? detail.fields.map((f) => (f && typeof f === "object" ? (f as { message?: unknown }).message : null)).filter((m): m is string => typeof m === "string")
    : [];
  const main = typeof detail.message === "string" ? detail.message : typeof body.message === "string" && body.message !== "validation error" ? body.message : null;
  const text = [main, ...fields].filter(Boolean).join(" ").slice(0, 400);
  return text ? `Graph8 rejected the request (${operation}): ${text}` : undefined;
}

function backoff(attempt: number): number {
  const base = 400 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * base);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
