import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { guardedSend } from "@/lib/promiseguard/guard";
import { currentMode } from "@/lib/promiseguard/mode";
import { SendBody } from "@/lib/promiseguard/requests";

// Guarded send. Live: Graph8 e-signature send. Demo: Graph8 send-preview only (nothing is sent).
// Refused (409) while the gate is not clear, unless an override reason is given; overrides are logged as a deal note.
export const POST = withSession(async (req, ctx: RouteContext<"/api/quotes/[quoteId]/send">) => {
  const { quoteId } = await ctx.params;
  return ok(await guardedSend(quoteId, await currentMode(), await parseBody(req, SendBody, 4_000)));
});
