import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { reviewQuote } from "@/lib/promiseguard/fixes";

// Current terms of the review's quote, for the "Fix in quote" editor.
export const GET = withSession(async (_req, ctx: RouteContext<"/api/reviews/[reviewId]/quote">) => {
  const { reviewId } = await ctx.params;
  return ok(await reviewQuote(reviewId));
});
