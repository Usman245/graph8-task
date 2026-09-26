import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { watchReview } from "@/lib/promiseguard/guard";
import { StartReviewBody } from "@/lib/promiseguard/requests";
import { startReview } from "@/lib/promiseguard/runs";

export const POST = withSession(async (req) => {
  const body = await parseBody(req, StartReviewBody);
  const result = await startReview(body);
  // Finalize on the server too, so the review completes even if the tab is closed.
  watchReview(result.reviewTaskId);
  return ok(result, { status: result.recovered ? 200 : 202 });
});
