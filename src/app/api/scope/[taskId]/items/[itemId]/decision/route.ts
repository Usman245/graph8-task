import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { ScopeDecisionBody } from "@/lib/promiseguard/requests";
import { decideScopeItem } from "@/lib/promiseguard/scope";

export const POST = withSession(async (req, ctx: RouteContext<"/api/scope/[taskId]/items/[itemId]/decision">) => {
  const { taskId, itemId } = await ctx.params;
  return ok(await decideScopeItem(taskId, itemId, await parseBody(req, ScopeDecisionBody, 4_000)));
});
