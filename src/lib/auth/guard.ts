import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { fail } from "@/lib/api/result";
import { Graph8Error } from "@/lib/graph8/errors";
import { SESSION_COOKIE, verifySessionToken, type Session } from "./session";

/** For server components/pages: redirect to /login when there is no valid session. */
export async function requirePageSession(): Promise<Session> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return session;
}

type Handler<C> = (req: Request, ctx: C, session: Session) => Promise<Response>;

/**
 * Wraps an internal API route: verifies the session, checks Origin on
 * mutations, and converts thrown errors into the app envelope.
 */
export function withSession<C>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const store = await cookies();
    const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
    if (!session) {
      return fail({ code: "unauthenticated", message: "Sign in to continue.", retryable: false }, 401);
    }
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
      return fail({ code: "bad_origin", message: "Request origin was rejected.", retryable: false }, 403);
    }
    try {
      return await handler(req, ctx, session);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof Graph8Error) {
    const status =
      err.code === "not_configured" ? 503 :
      err.code === "unauthorized" ? 502 :
      err.code === "forbidden" ? 403 :
      err.code === "payment_required" ? 402 :
      err.code === "not_found" ? 404 :
      err.code === "conflict" ? 409 :
      err.code === "validation" ? 422 :
      err.code === "rate_limited" ? 429 : 502;
    return fail({ code: `graph8_${err.code}`, message: err.message, retryable: err.retryable, operation: err.operation }, status);
  }
  if (err instanceof AppRequestError) {
    return fail({ code: err.code, message: err.message, retryable: false }, err.status);
  }
  console.error("[promiseguard] unhandled route error", err instanceof Error ? err.name : typeof err);
  return fail({ code: "internal", message: "Something went wrong on the server.", retryable: true }, 500);
}

export class AppRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Parse and validate a JSON body. Unknown fields and oversized payloads are rejected. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S, maxBytes = 16_000): Promise<z.infer<S>> {
  const parsed = schema.safeParse(await readJson(req, maxBytes));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppRequestError("invalid_request", `Invalid request${issue ? `: ${issue.path.join(".") || "body"} ${issue.message}` : "."}`, 422);
  }
  return parsed.data;
}

/** Parse a JSON body with a hard size cap. */
export async function readJson(req: Request, maxBytes = 16_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppRequestError("payload_too_large", "Request body is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppRequestError("invalid_json", "Request body must be JSON.");
  }
}
