// Send-gate rules shared by the server and the UI. Pure: no Graph8 calls.

import type { Coverage, Finding, ReviewManifest } from "./schemas";

/** Coverage verdicts that must be dealt with before a quote goes out. */
export const BLOCKING_COVERAGE: Coverage[] = ["conflict", "missing", "needs_review"];

/**
 * Blocking findings that no reviewer has cleared. A finding is cleared when its latest human decision
 * is "dismissed" or "resolved" (completing an assigned issue records "resolved"). "confirmed" does not clear it.
 */
export function openFindings(m: Pick<ReviewManifest, "report" | "humanDecisions">): Finding[] {
  const last = new Map<string, string>();
  for (const d of m.humanDecisions) last.set(d.findingId, d.decision);
  return (m.report ?? []).filter((f) => {
    if (!BLOCKING_COVERAGE.includes(f.coverage)) return false;
    const decision = last.get(f.id);
    return decision !== "dismissed" && decision !== "resolved";
  });
}

export type GateState =
  /** Latest review is current and every blocking finding is cleared. */
  | "clear"
  /** Latest current review has open conflict / missing / needs-review findings. */
  | "at_risk"
  /** No review for this quote yet. */
  | "no_review"
  /** A review is running in Graph8. */
  | "reviewing"
  /** The quote text changed after the latest review. */
  | "changed"
  /** The latest review failed or went stale. */
  | "failed"
  /** The quote is not linked to a deal, so it cannot be matched to conversations. */
  | "not_linked"
  /** Accepted, declined, voided, expired, or archived: nothing left to guard. */
  | "closed";

export const GATE_LABEL: Record<GateState, string> = {
  clear: "Clear to send",
  at_risk: "Promise gaps open",
  no_review: "Not reviewed",
  reviewing: "Reviewing",
  changed: "Quote changed",
  failed: "Review failed",
  not_linked: "Not linked to a deal",
  closed: "Closed",
};
