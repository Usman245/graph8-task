import { ok } from "@/lib/api/result";
import { parseBody, withSession } from "@/lib/auth/guard";
import { guardBoard, needsReview, runAutoReview } from "@/lib/promiseguard/guard";
import { currentMode } from "@/lib/promiseguard/mode";
import { ScanBody } from "@/lib/promiseguard/requests";

// Allows the background finalize watcher (next/server after()) to finish on serverless hosts.
export const maxDuration = 60;

const MAX_PER_SCAN = 5;

// Manual stand-in for the webhook: reviews quotes that are unreviewed or changed. Uses AI credits per started review.
export const POST = withSession(async (req) => {
  const { quoteIds } = await parseBody(req, ScanBody, 2_000);
  const board = await guardBoard(await currentMode());
  // Only quotes on the current mode's board can be scanned, so a demo scan never touches live quotes.
  const eligible = board.rows.filter(needsReview).map((r) => r.quoteId);
  const targets = (quoteIds ? eligible.filter((id) => quoteIds.includes(id)) : eligible).slice(0, MAX_PER_SCAN);
  const results = [];
  for (const id of targets) results.push(await runAutoReview(id, "scan", "scan"));
  return ok({ results, remaining: Math.max(0, eligible.length - targets.length) });
});
