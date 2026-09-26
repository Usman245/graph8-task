/* eslint-disable @typescript-eslint/no-explicit-any -- setup scripts read untyped Graph8 JSON */
// Minimal Graph8 HTTP helper for setup/check scripts. Never logs credentials or bodies.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

export const BASE = (process.env.GRAPH8_BASE_URL || "https://be.graph8.com/api/v1").replace(/\/$/, "");
const KEY = process.env.GRAPH8_API_KEY;

export class G8Error extends Error {
  readonly operation: string;
  readonly status: number;
  readonly body: unknown;

  constructor(operation: string, status: number, body: unknown) {
    super(`${operation} failed with HTTP ${status}`);
    this.operation = operation;
    this.status = status;
    this.body = body;
  }
}

export async function g8<T = any>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  opts: { operation: string; query?: Record<string, string | number | boolean>; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  if (!KEY) throw new Error("GRAPH8_API_KEY is not set");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new G8Error(opts.operation, res.status, json);
  return json as T;
}

export function describeError(err: unknown): string {
  if (err instanceof G8Error) {
    const body = typeof err.body === "string" ? err.body.slice(0, 800) : JSON.stringify(err.body).slice(0, 1500);
    return `${err.message}: ${body}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
