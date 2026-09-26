import { cookies } from "next/headers";
import { fail, ok } from "@/lib/api/result";
import { sameOrigin } from "@/lib/auth/guard";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return fail({ code: "bad_origin", message: "Request origin was rejected.", retryable: false }, 403);
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return ok({ signedOut: true });
}
