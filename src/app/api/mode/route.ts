import { cookies } from "next/headers";
import { ok } from "@/lib/api/result";
import { AppRequestError, parseBody, withSession } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { MODE_COOKIE } from "@/lib/promiseguard/mode";
import { ModeBody } from "@/lib/promiseguard/requests";

export const POST = withSession(async (req) => {
  const { mode } = await parseBody(req, ModeBody, 200);
  if (mode === "demo" && !env().PROMISEGUARD_DEMO_ENABLED) {
    throw new AppRequestError("demo_disabled", "Demo mode is disabled on this server.", 403);
  }
  (await cookies()).set(MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return ok({ mode });
});
