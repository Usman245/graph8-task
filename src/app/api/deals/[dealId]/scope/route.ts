import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { currentMode } from "@/lib/promiseguard/mode";
import { scopeContext } from "@/lib/promiseguard/scope";

export const GET = withSession(async (_req, ctx: RouteContext<"/api/deals/[dealId]/scope">) => {
  const { dealId } = await ctx.params;
  return ok(await scopeContext(dealId, await currentMode()));
});
