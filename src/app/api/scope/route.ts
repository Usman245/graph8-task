import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { ScopeStartBody } from "@/lib/promiseguard/requests";
import { finalizeScope, startScopeCheck } from "@/lib/promiseguard/scope";
import { after } from "next/server";

export const maxDuration = 60;

export const POST = withSession(async (req) => {
  const result = await startScopeCheck(await parseBody(req, ScopeStartBody));
  // Finish in the background too, so the result is saved even if nobody keeps the page open.
  after(async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const r = await finalizeScope(result.taskId).catch(() => null);
      if (r && r.state !== "running" && r.state !== "start_unknown") return;
    }
  });
  return ok(result, { status: result.recovered ? 200 : 202 });
});
