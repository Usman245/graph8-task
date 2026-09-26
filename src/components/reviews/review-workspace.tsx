"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { COVERAGE_LABEL, CoverageBadge, EmptyPanel, ErrorPanel, ModeBadge, SampleBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/ui/format";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { FinalizeResult, ReviewView } from "@/lib/promiseguard/runs";
import type { Finding } from "@/lib/promiseguard/schemas";
import { FindingDrawer } from "./finding-drawer";

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

  if (query.isPending) return <div className="h-64 animate-pulse rounded-lg bg-surface-muted" aria-label="Loading review" />;
  if (query.isError) {
    return <ErrorPanel message={`Could not load this review from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;
  }
  if (!view || !m) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{view?.taskTitle ?? "Review"}</h1>
        <ErrorPanel message={view?.readOnlyReason ?? "This review cannot be displayed."} />
      </div>
    );
  }

  const isDemo = m.mode === "demo";
  const report = m.report ?? [];
  const selectedFinding = report.find((f) => f.id === openFinding) ?? null;
  const fresh = freshness.data?.freshness;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/deals/${encodeURIComponent(m.dealId)}`} className="text-sm text-muted hover:text-foreground">
          ← {m.dealName}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">Review of {m.quoteLabel}</h1>
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
        </div>
        <p className="mt-1 text-sm text-muted">
          {m.completedAt ? `Compared ${formatDate(m.completedAt, true)}` : `Started ${formatDate(m.createdAt, true)}`} · {m.sourceRefs.length}{" "}
          source(s) · Graph8 review task {view.taskStatus ?? ""}
          {m.previousReviewTaskId && (
            <>
              {" · "}
              <Link className="text-primary hover:underline" href={`/reviews/${encodeURIComponent(m.previousReviewTaskId)}`}>
                previous review
              </Link>
            </>
          )}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
          {m.sourceRefs.map((r) => (
            <li key={`${r.kind}:${r.id}`} className="rounded bg-surface-muted px-2 py-1">
              {m.sourceLabels[`${r.kind}:${r.id}`] ?? `${r.kind} ${r.id}`}
            </li>
          ))}
        </ul>
      </div>

      {isDemo && (
        <p className="rounded-md bg-missing-soft p-3 text-sm text-missing">
          Sales evidence in this review is the labeled sample conversation (synthetic). The deal, quote, comparison run, and saved review
          are real Graph8 records.
        </p>
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
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["conflict", "missing", "needs_review", "covered"] as const).map((k) => (
              <div key={k} className="rounded-lg border border-border bg-surface p-4">
                <CoverageBadge coverage={k} />
                <p className="mt-2 text-2xl font-semibold">{view.counts?.[k] ?? 0}</p>
              </div>
            ))}
          </section>
          <p className="text-xs text-muted">
            Counts apply only to the selected evidence. {view.awaitingReview} finding(s) awaiting a human decision. Decision support only; not
            a determination of contractual liability.
          </p>

          {(m.coverageNotes.length > 0 || m.rejected.length > 0) && (
            <div className="space-y-2 rounded-lg border border-missing/30 bg-missing-soft p-4 text-sm text-missing">
              <p className="font-medium">{m.coverageComplete ? "Notes" : "Coverage limitations"}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {m.coverageNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              {m.rejected.length > 0 && (
                <details>
                  <summary className="cursor-pointer">Rejected model findings ({m.rejected.length})</summary>
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

          {report.length === 0 ? (
            <EmptyPanel title="No explicit seller commitments were found in the selected evidence.">
              This is not a statement that the deal carries no risk; only the selected sources were checked.
            </EmptyPanel>
          ) : (
            <FindingsTable findings={report} view={view} onOpen={setOpenFinding} />
          )}
          <div className="flex flex-wrap items-center gap-3">
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
        onChanged={() => qc.invalidateQueries({ queryKey: key })}
      />
    </div>
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
      <div role="alert" className="space-y-3 rounded-lg border border-conflict/30 bg-conflict-soft p-4 text-sm text-conflict">
        <p className="font-medium">{m.runState === "stale" ? "Evidence changed during the comparison" : "The comparison did not complete"}</p>
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
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4" aria-live="polite">
      <ol className="flex flex-wrap gap-2 text-sm">
        {stages.map((s, i) => (
          <li key={s} className={`rounded px-2 py-1 ${i < current ? "bg-covered-soft text-covered" : i === current ? "bg-primary-soft font-medium text-primary" : "bg-surface-muted text-muted"}`}>
            {i + 1}. {s}
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
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">Findings</caption>
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Commitment</th>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Coverage</th>
            <th className="px-4 py-2 font-medium">Source date</th>
            <th className="px-4 py-2 font-medium">Action</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((f) => {
            const state = actionState(f, view);
            const at = docs[f.salesEvidence[0]?.documentId]?.at ?? null;
            return (
              <tr key={f.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{f.commitment}</p>
                  {f.adjustment && <p className="text-xs text-muted">Adjusted: {f.adjustment}</p>}
                </td>
                <td className="px-4 py-3 capitalize text-muted">{f.category}</td>
                <td className="px-4 py-3">
                  <CoverageBadge coverage={f.coverage} />
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(at)}</td>
                <td className="px-4 py-3">
                  <Badge tone={state.tone}>{state.label}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" className="px-3 py-1" onClick={() => onOpen(f.id)} aria-label={`View evidence for ${f.commitment} (${COVERAGE_LABEL[f.coverage]})`}>
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
