import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { addClarificationNote, applyQuoteTerms } from "@/lib/promiseguard/fixes";
import { FixBody } from "@/lib/promiseguard/requests";

export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/findings/[findingId]/fix">) => {
  const { reviewId, findingId } = await ctx.params;
  const body = await parseBody(req, FixBody, 30_000);
  if (body.kind === "quote_terms") {
    return ok(await applyQuoteTerms(reviewId, findingId, body));
  }
  return ok(await addClarificationNote(reviewId, findingId, body));
});
