import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { RecheckBody } from "@/lib/promiseguard/requests";
import { recheckReview } from "@/lib/promiseguard/runs";

export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/recheck">) => {
  const { reviewId } = await ctx.params;
  const { requestId } = await parseBody(req, RecheckBody, 500);
  return ok(await recheckReview(reviewId, requestId), { status: 202 });
});
