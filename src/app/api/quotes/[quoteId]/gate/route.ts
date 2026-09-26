import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { quoteGateDetail } from "@/lib/promiseguard/guard";

// Read-only send-gate state for one quote, based on its latest PromiseGuard review.
export const GET = withSession(async (_req, ctx: RouteContext<"/api/quotes/[quoteId]/gate">) => {
  const { quoteId } = await ctx.params;
  return ok(await quoteGateDetail(quoteId));
});
