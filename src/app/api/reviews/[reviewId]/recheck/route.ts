import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { watchReview } from "@/lib/promiseguard/guard";
import { RecheckBody } from "@/lib/promiseguard/requests";
import { recheckReview } from "@/lib/promiseguard/runs";

// Allows the background finalize watcher (next/server after()) to finish on serverless hosts.
export const maxDuration = 60;

export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/recheck">) => {
  const { reviewId } = await ctx.params;
  const { requestId } = await parseBody(req, RecheckBody, 500);
  const result = await recheckReview(reviewId, requestId);
  watchReview(result.reviewTaskId);
  return ok(result, { status: 202 });
});
