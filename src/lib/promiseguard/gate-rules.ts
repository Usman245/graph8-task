// Send-gate rules shared by the server and the UI. Pure: no Graph8 calls.

import type { Coverage, Finding, ReviewManifest } from "./schemas";

export const BLOCKING_COVERAGE: Coverage[] = ["conflict", "missing", "needs_review"];

/** Open = a blocking gap or high-risk promise whose latest decision is not dismissed or resolved ("confirmed" does not clear it). */
export function openFindings(m: Pick<ReviewManifest, "report" | "humanDecisions">): Finding[] {
  const last = new Map<string, string>();
  for (const d of m.humanDecisions) last.set(d.findingId, d.decision);
  return (m.report ?? []).filter((f) => {
    if (!BLOCKING_COVERAGE.includes(f.coverage) && !f.commercialRisk?.requiresApproval) return false;
    const decision = last.get(f.id);
    return decision !== "dismissed" && decision !== "resolved";
  });
}

export type GateState =
  | "clear"
  | "at_risk"
  | "no_review"
  | "reviewing"
  | "changed"
  | "failed"
  | "incomplete"
  | "not_linked"
  | "closed";

export const GATE_LABEL: Record<GateState, string> = {
  clear: "Clear to send",
  at_risk: "Promise risks open",
  no_review: "Not reviewed",
  reviewing: "Reviewing",
  changed: "Review out of date",
  failed: "Review failed",
  incomplete: "Review incomplete",
  not_linked: "Not linked to a deal",
  closed: "Closed",
};
