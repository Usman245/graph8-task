import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { StartReviewBody } from "@/lib/promiseguard/requests";
import { startReview } from "@/lib/promiseguard/runs";

export const POST = withSession(async (req) => {
  const body = await parseBody(req, StartReviewBody);
  const result = await startReview(body);
  return ok(result, { status: result.recovered ? 200 : 202 });
});
