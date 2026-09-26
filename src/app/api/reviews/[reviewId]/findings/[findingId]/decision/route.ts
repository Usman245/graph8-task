import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { DecisionBody } from "@/lib/promiseguard/requests";
import { recordDecision } from "@/lib/promiseguard/runs";

export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/findings/[findingId]/decision">) => {
  const { reviewId, findingId } = await ctx.params;
  return ok(await recordDecision(reviewId, findingId, await parseBody(req, DecisionBody, 4_000)));
});
