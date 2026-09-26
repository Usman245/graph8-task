import type { AppError, AppResult } from "./result";

export class ApiError extends Error {
  constructor(readonly error: AppError, readonly status: number) {
    super(error.message);
  }
}

/** Browser-side call to our own internal API. Unwraps the AppResult envelope. */
export async function api<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError({ code: "network", message: "Could not reach the PromiseGuard server.", retryable: true }, 0);
  }
  if (res.status === 401 && typeof window !== "undefined" && !input.startsWith("/api/auth")) {
    // Hard navigation on session expiry: this helper runs outside React, so the router is unavailable.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
  const body = (await res.json().catch(() => null)) as AppResult<T> | null;
  if (!body) {
    throw new ApiError({ code: "bad_response", message: "The server returned an unreadable response.", retryable: true }, res.status);
  }
  if (!body.ok) throw new ApiError(body.error, res.status);
  return body.data;
}
