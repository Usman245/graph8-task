import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { dealContext } from "@/lib/promiseguard/context";
import { currentMode } from "@/lib/promiseguard/mode";

export const GET = withSession(async (_req, ctx: RouteContext<"/api/deals/[dealId]/context">) => {
  const { dealId } = await ctx.params;
  return ok(await dealContext(dealId, await currentMode()));
});
