import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { getReviewView } from "@/lib/promiseguard/runs";

// Read-only: reports stored review state plus live workflow status. Never mutates tasks.
export const GET = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]">) => {
  const { reviewId } = await ctx.params;
  const checkFreshness = new URL(req.url).searchParams.get("freshness") === "1";
  return ok(await getReviewView(reviewId, { checkFreshness }));
});
