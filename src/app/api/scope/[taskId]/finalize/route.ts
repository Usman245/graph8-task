import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { finalizeScope } from "@/lib/promiseguard/scope";

export const POST = withSession(async (_req, ctx: RouteContext<"/api/scope/[taskId]/finalize">) => {
  const { taskId } = await ctx.params;
  return ok(await finalizeScope(taskId));
});
