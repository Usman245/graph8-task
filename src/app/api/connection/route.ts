import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { getConnectionStatus } from "@/lib/promiseguard/capabilities";

export const GET = withSession(async (req) => {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  return ok(await getConnectionStatus(force));
});
