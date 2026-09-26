import { Badge } from "@/components/ui/badge";
import { GATE_LABEL, type GateState } from "@/lib/promiseguard/gate-rules";
import type { Coverage } from "@/lib/promiseguard/schemas";

export const COVERAGE_LABEL: Record<Coverage, string> = {
  covered: "Covered",
  missing: "Missing",
  conflict: "Conflict",
  needs_review: "Needs review",
};

const COVERAGE_TONE = { covered: "covered", missing: "missing", conflict: "conflict", needs_review: "review" } as const;

export function CoverageBadge({ coverage }: { coverage: Coverage }) {
  return <Badge tone={COVERAGE_TONE[coverage]}>{COVERAGE_LABEL[coverage]}</Badge>;
}

const GATE_TONE: Record<GateState, "covered" | "missing" | "conflict" | "review" | "primary" | "neutral"> = {
  clear: "covered",
  at_risk: "conflict",
  no_review: "missing",
  reviewing: "primary",
  changed: "missing",
  failed: "conflict",
  not_linked: "neutral",
  closed: "neutral",
};

export function GateBadge({ state }: { state: GateState }) {
  return <Badge tone={GATE_TONE[state]}>{GATE_LABEL[state]}</Badge>;
}

/** Shown on every surface that displays synthetic evidence. */
export function SampleBadge() {
  return <Badge tone="missing">Sample data</Badge>;
}

export function ModeBadge({ mode }: { mode: "demo" | "live" }) {
  return mode === "demo" ? <Badge tone="missing">Demo mode</Badge> : <Badge tone="primary">Live mode</Badge>;
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-conflict/30 bg-conflict-soft p-4 text-sm text-conflict">
      {message}
      {onRetry && (
        <>
          {" "}
          <button className="font-medium underline" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}

export function EmptyPanel({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-sm">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}
