"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SendDialog, gateKey } from "@/components/guard/send-dialog";
import { COVERAGE_LABEL, CoverageBadge, EmptyPanel, ErrorPanel, GateBadge, ModeBadge, RiskBadge, SampleBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/ui/format";
import { Notice, PageHeader, StatTile } from "@/components/ui/page-header";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { QuoteGateDetail } from "@/lib/promiseguard/guard";
import type { FinalizeResult, ReviewView } from "@/lib/promiseguard/runs";
import type { Finding } from "@/lib/promiseguard/schemas";
import { FindingDrawer } from "./finding-drawer";
import { PromiseHandoff } from "./promise-handoff";

const ACTIVE = new Set(["preparing", "running", "start_unknown"]);

export function ReviewWorkspace({ reviewTaskId }: { reviewTaskId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const polls = useRef(0);
  const [openFinding, setOpenFinding] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const recheckId = useRef<string | null>(null);
  const key = ["review", reviewTaskId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      polls.current += 1;
      return api<ReviewView>(`/api/reviews/${encodeURIComponent(reviewTaskId)}`);
    },
    // Poll every 3s at first, then back off. TanStack pauses interval polling in hidden tabs.
    refetchInterval: (q) => {
      const state = q.state.data?.manifest?.runState;
      if (!state || !ACTIVE.has(state)) return false;
      return polls.current < 10 ? 3000 : polls.current < 30 ? 6000 : 12000;
    },
  });

  const freshness = useQuery({
    queryKey: [...key, "freshness"],
    queryFn: () => api<ReviewView>(`/api/reviews/${encodeURIComponent(reviewTaskId)}?freshness=1`),
    enabled: query.data?.manifest?.runState === "completed",
    staleTime: 60_000,
  });

  const finalize = useMutation({
    mutationFn: () => api<FinalizeResult>(`/api/reviews/${encodeURIComponent(reviewTaskId)}/finalize`, { method: "POST" }),
    onSuccess: () => {
      setFinalizeError(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => setFinalizeError(err instanceof ApiError ? err.message : "Saving the result failed."),
  });

  const view = query.data;
  const m = view?.manifest;
  const executionDone = Boolean(view?.execution?.terminal);
  const { mutate: runFinalize, isPending: finalizing } = finalize;

  // When Graph8 reports the run finished (or the start is uncertain), ask the server to finalize.
  useEffect(() => {
    if (!m || finalizing || finalizeError) return;
    const needs = (m.runState === "running" && executionDone) || (m.runState === "preparing" && !m.executionId);
    if (needs) runFinalize();
  }, [m, executionDone, finalizing, finalizeError, runFinalize]);

  async function recheck() {
    recheckId.current ??= crypto.randomUUID();
    setRecheckError(null);
    try {
      const res = await api<{ reviewTaskId: string }>(`/api/reviews/${encodeURIComponent(reviewTaskId)}/recheck`, {
        method: "POST",
        body: JSON.stringify({ requestId: recheckId.current }),
      });
      router.push(`/reviews/${encodeURIComponent(res.reviewTaskId)}`);
    } catch (err) {
      setRecheckError(err instanceof ApiError ? err.message : "Could not start a new comparison.");
    }
  }

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-label="Loading review">
        <div className="h-20 w-2/3 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
      </div>
    );
  }
  if (query.isError) {
    return <ErrorPanel message={`Could not load this review from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;
  }
  if (!view || !m) {
    return (
      <div className="space-y-4">
        <PageHeader title={view?.taskTitle ?? "Review"} />
        <ErrorPanel message={view?.readOnlyReason ?? "This review cannot be displayed."} />
      </div>
    );
  }

  const isDemo = m.mode === "demo";
  const report = m.report ?? [];
  const selectedFinding = report.find((f) => f.id === openFinding) ?? null;
  const fresh = freshness.data?.freshness;

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: `/deals/${encodeURIComponent(m.dealId)}`, label: m.dealName }}
        eyebrow="Promise review"
        title={m.quoteLabel}
        badges={
          <>
            <ModeBadge mode={m.mode} />
            {isDemo && <SampleBadge />}
            {m.runState === "completed" &&
              (fresh === "current" ? (
                <Badge tone="covered">Current</Badge>
              ) : fresh === "changed" ? (
                <Badge tone="missing">Source changed</Badge>
              ) : fresh === "unknown" ? (
                <Badge>Freshness unknown</Badge>
              ) : null)}
            <Badge tone="neutral">Saved in Graph8</Badge>
          </>
        }
        description={
          <>
            <p>
              {m.completedAt ? `Compared ${formatDate(m.completedAt, true)}` : `Started ${formatDate(m.createdAt, true)}`} · {m.sourceRefs.length}{" "}
              source(s) · Graph8 review task {view.taskStatus ?? ""}
              {m.previousReviewTaskId && (
                <>
                  {" · "}
                  <Link className="pg-link" href={`/reviews/${encodeURIComponent(m.previousReviewTaskId)}`}>
                    previous review
                  </Link>
                </>
              )}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {m.sourceRefs.map((r) => (
                <li key={`${r.kind}:${r.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-foreground">
                  <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7Z" strokeLinejoin="round" />
                  </svg>
                  {m.sourceLabels[`${r.kind}:${r.id}`] ?? `${r.kind} ${r.id}`}
                </li>
              ))}
            </ul>
          </>
        }
      />

      {isDemo && (
        <Notice tone="missing">
          Sales evidence in this review is the labeled sample conversation (synthetic). The deal, quote, comparison run, and saved review
          are real Graph8 records.
        </Notice>
      )}

      <RunStatus
        view={view}
        finalizing={finalize.isPending}
        finalizeError={finalizeError}
        onFinalize={() => {
          setFinalizeError(null);
          finalize.mutate();
        }}
        onRecheck={recheck}
      />
      {recheckError && <ErrorPanel message={recheckError} />}

      {m.runState === "completed" && (
        <>
          <SendGateBar quoteId={m.quoteId} reviewTaskId={reviewTaskId} />
          <MainFinding view={view} onOpen={setOpenFinding} />
          <div className="space-y-2">
            <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["conflict", "conflict"],
                  ["missing", "missing"],
                  ["needs_review", "review"],
                  ["covered", "covered"],
                ] as const
              ).map(([k, tone]) => (
                <StatTile key={k} tone={tone} label={<CoverageBadge coverage={k} />} value={view.counts?.[k] ?? 0} />
              ))}
            </section>
            <p className="text-xs text-muted">
              Counts apply only to the selected evidence. {view.awaitingReview} finding(s) awaiting a human decision. Decision support only; not
              a determination of contractual liability.
            </p>
          </div>
          <CommercialRiskSummary findings={report} promptVersion={m.promptVersion} onOpen={setOpenFinding} />

          {(m.coverageNotes.length > 0 || m.rejected.length > 0) && (
            <div className="space-y-2 rounded-2xl border border-missing/25 bg-missing-soft p-5 text-sm text-missing">
              <p className="font-semibold">{m.coverageComplete ? "Notes" : "Coverage limitations"}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {m.coverageNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {m.rejected.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">Rejected model findings ({m.rejected.length})</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {m.rejected.map((r, i) => (
                      <li key={i}>
                        {r.commitment}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <section aria-labelledby="findings-h" className="space-y-4">
            <h2 id="findings-h" className="text-xl font-semibold tracking-tight">
              All findings
            </h2>
            {report.length === 0 ? (
              <EmptyPanel title="No explicit seller commitments were found in the selected evidence.">
                This is not a statement that the deal carries no risk; only the selected sources were checked.
              </EmptyPanel>
            ) : (
              <FindingsTable findings={report} view={view} onOpen={setOpenFinding} />
            )}
          </section>

          <PromiseHandoff reviewTaskId={reviewTaskId} />

          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border px-5 py-4">
            <Button variant="secondary" onClick={recheck}>
              Recheck against current versions
            </Button>
            <span className="text-xs text-muted">Starts a new Graph8 comparison (uses AI credits). This review is kept.</span>
          </div>
        </>
      )}

      <FindingDrawer
        reviewTaskId={reviewTaskId}
        view={view}
        finding={selectedFinding}
        onClose={() => setOpenFinding(null)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: key });
          qc.invalidateQueries({ queryKey: gateKey(m.quoteId) });
        }}
        onRecheck={recheck}
      />
    </div>
  );
}

function CommercialRiskSummary({ findings, promptVersion, onOpen }: { findings: Finding[]; promptVersion: string; onOpen: (id: string) => void }) {
  const assessed = findings.filter((f) => f.commercialRisk);
  if (assessed.length === 0) {
    return (
      <section aria-labelledby="risk-h" className="pg-card p-5">
        <h2 id="risk-h" className="text-lg font-semibold tracking-tight">Promise feasibility</h2>
        <p className="mt-1 text-sm text-muted">
          {promptVersion === "pg-v4"
            ? "No commitments were available for a feasibility assessment."
            : "This older review has no commercial-risk assessment. Recheck it after installing the pg-v4 Graph8 skill."}
        </p>
      </section>
    );
  }
  const order = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
  const ranked = [...assessed].sort((a, b) => order[a.commercialRisk!.level] - order[b.commercialRisk!.level]);
  const attention = ranked.filter((f) => f.commercialRisk!.level === "high" || f.commercialRisk!.level === "medium");
  const high = ranked.filter((f) => f.commercialRisk!.level === "high").length;
  const medium = ranked.filter((f) => f.commercialRisk!.level === "medium").length;
  return (
    <section aria-labelledby="risk-h" className="pg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="risk-h" className="text-lg font-semibold tracking-tight">Promise feasibility</h2>
          <p className="mt-1 text-sm text-muted">Graph8 AI checks guarantees, vague success metrics, open-ended scope, dependencies, timing, and unpriced work.</p>
        </div>
        <div className="flex gap-2"><Badge tone={high ? "conflict" : "neutral"}>{high} high</Badge><Badge tone={medium ? "missing" : "neutral"}>{medium} medium</Badge></div>
      </div>
      {attention.length === 0 ? (
        <Notice tone="covered" className="mt-4">No high- or medium-risk promise was found in the selected evidence.</Notice>
      ) : (
        <ul className="mt-4 space-y-2">
          {attention.map((f) => (
            <li
              key={f.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 bg-background p-4 text-sm ${
                f.commercialRisk!.level === "high" ? "border-l-conflict" : "border-l-missing"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold"><RiskBadge level={f.commercialRisk!.level} /> {f.commitment}</p>
                <p className="mt-1 text-muted">{f.commercialRisk!.reason}</p>
              </div>
              <Button variant="secondary" className="px-3 py-1.5" onClick={() => onOpen(f.id)}>Review risk</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Grounded in the selected evidence and quote only. It does not know your internal capacity or actual margin unless those facts are present.</p>
    </section>
  );
}

/** Send-gate state for this review's quote (based on the quote's latest review, which may be newer than this one). */
function SendGateBar({ quoteId, reviewTaskId }: { quoteId: string; reviewTaskId: string }) {
  const [open, setOpen] = useState(false);
  const gate = useQuery({
    queryKey: gateKey(quoteId),
    queryFn: () => api<QuoteGateDetail>(`/api/quotes/${encodeURIComponent(quoteId)}/gate`),
  });
  const d = gate.data;
  const newer = d?.gate.reviewTaskId && d.gate.reviewTaskId !== reviewTaskId ? d.gate.reviewTaskId : null;
  return (
    <section
      aria-label="Send gate"
      className={`pg-card flex flex-wrap items-center justify-between gap-4 border-l-4 px-5 py-4 ${
        d?.gate.state === "clear" ? "border-l-covered" : d?.gate.state === "at_risk" ? "border-l-conflict" : "border-l-border"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3 text-sm">
        <span aria-hidden className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-surface-muted text-foreground">
          <svg viewBox="0 0 16 16" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 1.8 3 3.6v3.7c0 3 2.1 5.4 5 6.5 2.9-1.1 5-3.5 5-6.5V3.6L8 1.8Z" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">Quote Guard</span>
          {d ? <GateBadge state={d.gate.state} /> : gate.isError ? <Badge>Unavailable</Badge> : <Badge>Checking…</Badge>}
        </p>
        {d?.gate.reasons[0] && <p className="text-muted">{d.gate.reasons[0]}</p>}
        {newer && (
          <p className="text-muted">
            Based on a newer review:{" "}
            <Link className="pg-link" href={`/reviews/${encodeURIComponent(newer)}`}>
              open it
            </Link>
          </p>
        )}
        </div>
      </div>
      <Button variant={d?.gate.state === "clear" ? "primary" : "secondary"} disabled={!d || d.gate.state === "closed"} onClick={() => setOpen(true)}>
        Send quote…
      </Button>
      {open && <SendDialog quoteId={quoteId} open onClose={() => setOpen(false)} />}
    </section>
  );
}

function MainFinding({ view, onOpen }: { view: ReviewView; onOpen: (id: string) => void }) {
  const m = view.manifest!;
  const report = m.report ?? [];
  const main = report.find((f) => f.coverage === "conflict") ?? report.find((f) => f.coverage === "missing");
  if (!main) return null;
  const isConflict = main.coverage === "conflict";
  const sales = main.salesEvidence[0];
  const doc = sales ? m.documents[sales.documentId] : undefined;
  const quote = main.quoteEvidence[0];
  const others = report.filter((f) => f.coverage === main.coverage).length - 1;

  return (
    <section
      aria-labelledby="main-finding-h"
      className={`pg-rise relative overflow-hidden rounded-2xl border p-5 sm:p-7 ${isConflict ? "border-conflict/30 bg-conflict-soft" : "border-missing/30 bg-missing-soft"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CoverageBadge coverage={main.coverage} />
        <h2 id="main-finding-h" className="text-xl font-semibold tracking-tight">
          {isConflict ? "Main conflict" : "Main gap"}: {main.commitment}
        </h2>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <figure className="rounded-xl border-l-4 border-l-primary bg-surface p-4 shadow-sm">
          <figcaption className="pg-eyebrow flex flex-wrap items-center gap-2">
            Sales promised
            {doc?.synthetic && <SampleBadge />}
          </figcaption>
          <blockquote className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">&ldquo;{sales?.excerpt}&rdquo;</blockquote>
          <p className="mt-2 text-xs text-muted">
            {doc?.speaker ?? "Unknown speaker"} · {doc?.source ?? "Unknown source"}
            {doc?.synthetic ? " (synthetic sample, not a Graph8 record)" : ""}
          </p>
        </figure>
        <figure className={`rounded-xl border-l-4 bg-surface p-4 shadow-sm ${isConflict ? "border-l-conflict" : "border-l-missing"}`}>
          <figcaption className="pg-eyebrow">
            {isConflict ? "But the quote says" : "The quote says"}
          </figcaption>
          <blockquote className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">
            {quote ? <>&ldquo;{quote.excerpt}&rdquo;</> : <span className="text-muted">Nothing. No clause in the quote covers this.</span>}
          </blockquote>
          <p className="mt-2 text-xs text-muted">{m.quoteLabel}</p>
        </figure>
      </div>

      <div className="mt-3 rounded-xl bg-surface/70 p-4">
        <p className="pg-eyebrow">Suggested action</p>
        <p className="mt-1">{main.suggestedAction}</p>
        {main.conditions.length > 0 && <p className="mt-1 text-sm text-muted">Condition: {main.conditions.join("; ")}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => onOpen(main.id)}>View evidence and assign →</Button>
        {others > 0 && (
          <span className="text-sm text-muted">
            {others} more {isConflict ? "conflict" : "missing item"}
            {others === 1 ? "" : "s"} in the table below.
          </span>
        )}
      </div>
    </section>
  );
}

function RunStatus({
  view,
  finalizing,
  finalizeError,
  onFinalize,
  onRecheck,
}: {
  view: ReviewView;
  finalizing: boolean;
  finalizeError: string | null;
  onFinalize: () => void;
  onRecheck: () => void;
}) {
  const m = view.manifest!;
  if (m.runState === "completed") return null;

  if (m.runState === "failed" || m.runState === "stale") {
    return (
      <div role="alert" className="space-y-3 rounded-2xl border border-conflict/25 bg-conflict-soft p-5 text-sm text-conflict">
        <p className="text-base font-semibold">{m.runState === "stale" ? "Evidence changed during the comparison" : "The comparison did not complete"}</p>
        <p>{m.runError?.message ?? "No findings are shown."}</p>
        <Button variant="secondary" onClick={onRecheck}>
          Run a new comparison
        </Button>
        <p className="text-xs">Starts a new Graph8 workflow run and uses AI credits.</p>
      </div>
    );
  }

  const stages = ["Preparing", "Comparing in Graph8", "Validating evidence", "Saving to Graph8"];
  const current =
    m.runState === "preparing" ? 0 : finalizing ? 2 : view.execution?.terminal ? 3 : 1;

  return (
    <div className="pg-card space-y-5 p-5 sm:p-6" aria-live="polite">
      <ol className="grid gap-3 text-sm sm:grid-cols-4">
        {stages.map((s, i) => (
          <li key={s} className="space-y-2">
            <span
              aria-hidden
              className={`block h-1.5 overflow-hidden rounded-full ${i < current ? "bg-covered" : i === current ? "bg-primary-soft" : "bg-surface-muted"}`}
            >
              {i === current && <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />}
            </span>
            <span className={`flex items-center gap-2 ${i < current ? "text-covered" : i === current ? "font-semibold text-primary" : "text-muted"}`}>
              <span className="font-mono text-xs">{i < current ? "✓" : `0${i + 1}`}</span>
              {s}
            </span>
          </li>
        ))}
      </ol>
      {m.runState === "start_unknown" ? (
        <div className="space-y-2 text-sm">
          <p className="text-missing">{m.runError?.message}</p>
          <Button variant="secondary" onClick={onFinalize} disabled={finalizing}>
            Check Graph8 execution history
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Graph8 is running the comparison ({view.execution?.status ?? "starting"}). You can leave this page; the run and its result are
          stored in Graph8 and this page resumes when you return.
        </p>
      )}
      {finalizeError && (
        <div className="space-y-2 text-sm text-conflict">
          <p>AI completed, but the report was not saved: {finalizeError}</p>
          <Button variant="secondary" onClick={onFinalize} disabled={finalizing}>
            Retry saving (no new AI run)
          </Button>
        </div>
      )}
    </div>
  );
}

function actionState(f: Finding, view: ReviewView): { label: string; tone: "neutral" | "covered" | "missing" | "review" | "primary" } {
  const issue = view.issues[f.id];
  if (issue) return issue.status === "completed" ? { label: "Issue completed", tone: "covered" } : { label: "Issue assigned", tone: "primary" };
  const last = [...(view.manifest?.humanDecisions ?? [])].reverse().find((d) => d.findingId === f.id);
  if (!last) return { label: "Awaiting review", tone: "review" };
  return { label: last.decision === "confirmed" ? "Confirmed" : last.decision === "dismissed" ? "Dismissed" : "Resolved", tone: "neutral" };
}

function FindingsTable({ findings, view, onOpen }: { findings: Finding[]; view: ReviewView; onOpen: (id: string) => void }) {
  const docs = view.manifest!.documents;
  const order = { conflict: 0, missing: 1, needs_review: 2, covered: 3 };
  const sorted = [...findings].sort((a, b) => order[a.coverage] - order[b.coverage]);
  return (
    <div className="pg-card overflow-x-auto">
      <table className="pg-table min-w-[760px]">
        <caption className="sr-only">Findings</caption>
        <thead>
          <tr>
            <th>Commitment</th>
            <th>Category</th>
            <th>Coverage</th>
            <th>Feasibility</th>
            <th>Source date</th>
            <th>Action</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const state = actionState(f, view);
            const at = docs[f.salesEvidence[0]?.documentId]?.at ?? null;
            return (
              <tr key={f.id} className="cursor-pointer" onClick={() => onOpen(f.id)}>
                <td className="max-w-xs">
                  <p className="font-semibold leading-snug">{f.commitment}</p>
                  {f.adjustment && <p className="text-xs text-muted">Adjusted: {f.adjustment}</p>}
                </td>
                <td className="capitalize text-muted">{f.category}</td>
                <td>
                  <CoverageBadge coverage={f.coverage} />
                </td>
                <td>{f.commercialRisk ? <RiskBadge level={f.commercialRisk.level} /> : <span className="text-muted">Not assessed</span>}</td>
                <td className="whitespace-nowrap text-muted">{formatDate(at)}</td>
                <td>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </td>
                <td className="text-right">
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(f.id);
                    }} aria-label={`View evidence for ${f.commitment} (${COVERAGE_LABEL[f.coverage]})`}>
                    View evidence
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
