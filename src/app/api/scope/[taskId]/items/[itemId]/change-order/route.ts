import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { ChangeOrderBody } from "@/lib/promiseguard/requests";
import { draftChangeOrder } from "@/lib/promiseguard/scope";

export const POST = withSession(async (req, ctx: RouteContext<"/api/scope/[taskId]/items/[itemId]/change-order">) => {
  const { taskId, itemId } = await ctx.params;
  return ok(await draftChangeOrder(taskId, itemId, await parseBody(req, ChangeOrderBody, 4_000)));
});
