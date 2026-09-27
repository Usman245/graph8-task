import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { completeDelivery } from "@/lib/promiseguard/delivery";
import { CompleteDeliveryBody } from "@/lib/promiseguard/delivery-schema";
import { currentMode } from "@/lib/promiseguard/mode";
export const PATCH = withSession(async (req, ctx: RouteContext<"/api/delivery/[taskId]">) => {
  const { taskId } = await ctx.params;
  const body = await parseBody(req, CompleteDeliveryBody);
  return ok(await completeDelivery(taskId, await currentMode(), body.evidence, body.expectedUpdatedAt));
});
