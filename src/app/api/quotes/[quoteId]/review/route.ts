import { ok } from "@/lib/api/result";
import { AppRequestError, withSession } from "@/lib/auth/guard";
import { getQuote } from "@/lib/graph8/adapters/quotes";
import { getDeal } from "@/lib/graph8/adapters/deals";
import { modeForDeal, runAutoReview } from "@/lib/promiseguard/guard";
import { currentMode } from "@/lib/promiseguard/mode";

// "Review now": automatic source selection for one quote. Retries a failed review; reuses an up-to-date one.
export const POST = withSession(async (_req, ctx: RouteContext<"/api/quotes/[quoteId]/review">) => {
  const { quoteId } = await ctx.params;
  const quote = await getQuote(quoteId);
  if (!quote.dealId) throw new AppRequestError("quote_not_linked", "Link the quote to a deal in Graph8 first.", 409);
  if (modeForDeal(await getDeal(quote.dealId)) !== (await currentMode())) {
    throw new AppRequestError("mode_mismatch", "This quote belongs to the other mode. Switch modes to review it.", 409);
  }
  return ok(await runAutoReview(quoteId, "manual", "review now"), { status: 202 });
});
