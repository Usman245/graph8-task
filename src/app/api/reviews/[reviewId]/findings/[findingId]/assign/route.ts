import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { AssignBody } from "@/lib/promiseguard/requests";
import { assignIssue } from "@/lib/promiseguard/runs";

export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/findings/[findingId]/assign">) => {
  const { reviewId, findingId } = await ctx.params;
  return ok(await assignIssue(reviewId, findingId, await parseBody(req, AssignBody, 4_000)));
});
