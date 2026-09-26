import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { IssueUpdateBody } from "@/lib/promiseguard/requests";
import { updateIssue } from "@/lib/promiseguard/runs";

export const PATCH = withSession(async (req, ctx: RouteContext<"/api/issues/[taskId]">) => {
  const { taskId } = await ctx.params;
  return ok(await updateIssue(taskId, await parseBody(req, IssueUpdateBody, 4_000)));
});
