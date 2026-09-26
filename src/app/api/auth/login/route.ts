import { cookies } from "next/headers";
import { z } from "zod";
import { fail, ok } from "@/lib/api/result";
import { readJson, sameOrigin } from "@/lib/auth/guard";
import { checkLoginAllowed, clearLoginAttempts, recordFailedLogin } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isSessionConfigured,
  passwordMatches,
} from "@/lib/auth/session";

const Body = z.object({ password: z.string().min(1).max(200) }).strict();

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return fail({ code: "bad_origin", message: "Request origin was rejected.", retryable: false }, 403);
  }
  if (!isSessionConfigured()) {
    return fail(
      {
        code: "auth_not_configured",
        message: "Set PROMISEGUARD_APP_PASSWORD and a 32+ character PROMISEGUARD_SESSION_SECRET on the server.",
        retryable: false,
      },
      503,
    );
  }

  const clientKey = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const gate = checkLoginAllowed(clientKey);
  if (!gate.allowed) {
    return fail(
      { code: "rate_limited", message: `Too many attempts. Try again in ${gate.retryAfterSeconds} seconds.`, retryable: true },
      429,
    );
  }

  const parsed = Body.safeParse(await readJson(req, 1_000).catch(() => null));
  if (!parsed.success || !(await passwordMatches(parsed.data.password))) {
    recordFailedLogin(clientKey);
    return fail({ code: "invalid_credentials", message: "Incorrect password.", retryable: false }, 401);
  }

  clearLoginAttempts(clientKey);
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return ok({ signedIn: true });
}
