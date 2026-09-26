import { Badge } from "@/components/ui/badge";
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
