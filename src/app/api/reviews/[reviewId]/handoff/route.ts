import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { createDelivery, handoffContext } from "@/lib/promiseguard/delivery";
import { CreateDeliveryBody } from "@/lib/promiseguard/delivery-schema";
import { currentMode } from "@/lib/promiseguard/mode";

export const GET = withSession(async (_req, ctx: RouteContext<"/api/reviews/[reviewId]/handoff">) => {
  const { reviewId } = await ctx.params;
  const { manifest: _manifest, ...result } = await handoffContext(reviewId, await currentMode());
  void _manifest;
  return ok(result);
});
export const POST = withSession(async (req, ctx: RouteContext<"/api/reviews/[reviewId]/handoff">) => {
  const { reviewId } = await ctx.params;
  return ok(await createDelivery(reviewId, await currentMode(), await parseBody(req, CreateDeliveryBody)));
});
