import { Badge } from "@/components/ui/badge";
import { GATE_LABEL, type GateState } from "@/lib/promiseguard/gate-rules";
import type { Coverage, RiskLevel } from "@/lib/promiseguard/schemas";

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

const RISK_LABEL: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", unknown: "Risk unknown" };
const RISK_TONE: Record<RiskLevel, "covered" | "missing" | "conflict" | "review"> = {
  low: "covered",
  medium: "missing",
  high: "conflict",
  unknown: "review",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge tone={RISK_TONE[level]}>{RISK_LABEL[level]}</Badge>;
}

const GATE_TONE: Record<GateState, "covered" | "missing" | "conflict" | "review" | "primary" | "neutral"> = {
  clear: "covered",
  at_risk: "conflict",
  no_review: "missing",
  reviewing: "primary",
  changed: "missing",
  failed: "conflict",
  incomplete: "review",
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
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-conflict/25 bg-conflict-soft p-4 text-sm text-conflict">
      <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 1.8 15 14H1L8 1.8Z" strokeLinejoin="round" />
        <path d="M8 6.5v3.2M8 11.6v.1" strokeLinecap="round" />
      </svg>
      <div className="min-w-0 flex-1">
        {message}
        {onRetry && (
          <>
            {" "}
            <button className="font-semibold underline underline-offset-4" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function EmptyPanel({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface/70 px-6 py-10 text-center text-sm">
      <span aria-hidden className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-muted">
        <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="10" rx="2" />
          <path d="M2 9h3l1 1.5h4L11 9h3" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-lg text-muted">{children}</div>}
    </div>
  );
}
