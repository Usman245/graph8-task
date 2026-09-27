import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { getScopeView } from "@/lib/promiseguard/scope";

export const GET = withSession(async (_req, ctx: RouteContext<"/api/scope/[taskId]">) => {
  const { taskId } = await ctx.params;
  return ok(await getScopeView(taskId));
});
