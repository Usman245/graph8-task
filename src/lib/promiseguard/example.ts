import "server-only";
import { env } from "@/lib/env";
import { listDeals } from "@/lib/graph8/adapters/deals";
import { listReviewSummaries } from "./repository";
import { DEMO_SCENARIOS } from "./sample-data";

/**
 * The most recent completed review of the headline demo deal (the first demo scenario) saved in Graph8,
 * preferring one whose findings all passed evidence checks. Returns null (and the page hides the button) if none exists or Graph8 fails.
 */
export async function findExampleReview(): Promise<string | null> {
  if (!env().PROMISEGUARD_DEMO_ENABLED || !env().GRAPH8_API_KEY) return null;
  const exampleName = DEMO_SCENARIOS[0]?.deal.name;
  if (!exampleName) return null;
  try {
    const deals = await listDeals({ page: 1, limit: 10, search: exampleName });
    const deal = deals.items.find((d) => d.name === exampleName);
    if (!deal) return null;
    const { items } = await listReviewSummaries(deal.id);
    const completed = items.filter((r) => r.runState === "completed" && r.mode === "demo");
    return (completed.find((r) => r.coverageComplete) ?? completed[0])?.taskId ?? null;
  } catch {
    return null;
  }
}
