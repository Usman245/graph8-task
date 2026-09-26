import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { finalizeReview } from "@/lib/promiseguard/runs";

// Safe to repeat: serialized per review, returns stored results, never starts another AI run.
export const POST = withSession(async (_req, ctx: RouteContext<"/api/reviews/[reviewId]/finalize">) => {
  const { reviewId } = await ctx.params;
  return ok(await finalizeReview(reviewId));
});
