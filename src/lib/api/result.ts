export type AppError = {
  code: string;
  message: string;
  retryable: boolean;
  operation?: string;
};

export type AppResult<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data } satisfies AppResult<T>, withNoStore(init));
}

export function fail(error: AppError, status: number): Response {
  return Response.json({ ok: false, error } satisfies AppResult<never>, withNoStore({ status }));
}

function withNoStore(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return { ...init, headers };
}
