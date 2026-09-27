"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client-fetch";
import { EmptyPanel, ErrorPanel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice, StatTile } from "@/components/ui/page-header";
import type { deliveryBoard, DeliveryRow } from "@/lib/promiseguard/delivery";
import type { DeliveryState } from "@/lib/promiseguard/delivery-schema";

const LABEL: Record<DeliveryState, string> = { overdue: "Overdue", open: "Scheduled", completed: "Completion recorded", needs_evidence: "Completion needs evidence" };
const TONE: Record<DeliveryState, "conflict" | "primary" | "covered" | "missing"> = { overdue: "conflict", open: "primary", completed: "covered", needs_evidence: "missing" };
const ACCENT: Record<DeliveryState, string> = { overdue: "border-l-conflict", open: "border-l-primary", completed: "border-l-covered", needs_evidence: "border-l-missing" };

export function DeliveryBoard() {
  const q = useQuery({ queryKey: ["delivery"], queryFn: () => api<Awaited<ReturnType<typeof deliveryBoard>>>("/api/delivery"), refetchInterval: 30000 });
  if (q.isPending) {
    return (
      <div className="space-y-4" aria-label="Loading delivery obligations from Graph8">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    );
  }
  if (q.isError) return <ErrorPanel message={q.error.message} onRetry={() => q.refetch()} />;
  const count = (s: DeliveryState) => q.data.rows.filter((r) => r.state === s).length;
  return (
    <div className="space-y-6">
      {q.data.mode === "demo" && (
        <Notice tone="missing">Demo delivery rehearsal. These are real Graph8 tasks attached to demo deals, not accepted customer contracts.</Notice>
      )}
      <section aria-label="Delivery summary" className="pg-rise grid grid-cols-3 gap-3">
        <StatTile tone="conflict" label="Overdue" value={count("overdue")} />
        <StatTile tone="primary" label="Scheduled" value={count("open")} />
        <StatTile tone="covered" label="Completions recorded" value={count("completed")} />
      </section>
      <p className="text-xs text-muted">Dates use UTC.</p>
      {q.data.partial && <Notice tone="missing">Showing the first 200 matching Graph8 tasks. More may exist.</Notice>}
      {!q.data.rows.length ? (
        <EmptyPanel title="No promises handed to delivery yet.">
          Open a completed quote review, resolve its gaps, then use Promise Handoff to choose an owner and date. Live quotes must be accepted in Graph8.{" "}
          <Link href="/guard" className="pg-link">
            Open Quote Guard
          </Link>
        </EmptyPanel>
      ) : (
        <div className="space-y-3">
          {q.data.rows.map((r) => (
            <DeliveryItem key={r.taskId} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveryItem({ row: r }: { row: DeliveryRow }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function complete(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await api(`/api/delivery/${encodeURIComponent(r.taskId)}`, { method: "PATCH", body: JSON.stringify({ evidence, expectedUpdatedAt: r.updatedAt }) });
      await qc.invalidateQueries({ queryKey: ["delivery"] }); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record completion."); }
    finally { setBusy(false); }
  }
  const owner = r.assigneeName ?? r.assigneeId ?? "Unassigned in Graph8";
  return (
    <article className={`pg-card space-y-4 border-l-4 p-5 sm:p-6 ${ACCENT[r.state]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold leading-snug">{r.marker.commitment}</h2>
          <p className="mt-1 text-sm text-muted">{r.marker.dealName} · {r.marker.quoteLabel}</p>
        </div>
        <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
            {owner.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <dt className="pg-eyebrow">Owner</dt>
            <dd className="font-medium">{owner}</dd>
          </div>
        </div>
        <div>
          <dt className="pg-eyebrow">Target</dt>
          <dd className={`mt-0.5 font-medium tabular-nums ${r.state === "overdue" ? "text-conflict" : ""}`}>{r.dueDate?.slice(0, 10) ?? "No date"}</dd>
        </div>
      </dl>

      {r.marker.conditions.length > 0 && (
        <p className="rounded-xl bg-background p-3 text-sm">
          <span className="font-semibold">Conditions:</span> {r.marker.conditions.join(" · ")}
        </p>
      )}

      <details className="group text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-primary">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Evidence and scheduling decision
        </summary>
        <div className="mt-3 space-y-3 rounded-xl border border-border p-4">
          <p>{r.marker.scheduleReason}</p>
          {r.marker.salesEvidence.map((c, i) => (
            <blockquote key={`s${i}`} className="whitespace-pre-wrap break-words rounded-lg border-l-4 border-primary bg-primary-soft/40 p-3">
              <span className="pg-eyebrow block">Sales</span>“{c.excerpt}”
            </blockquote>
          ))}
          {r.marker.quoteEvidence.map((c, i) => (
            <blockquote key={`q${i}`} className="whitespace-pre-wrap break-words rounded-lg border-l-4 border-foreground/25 bg-background p-3">
              <span className="pg-eyebrow block">Quote</span>“{c.excerpt}”
            </blockquote>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/reviews/${encodeURIComponent(r.marker.reviewTaskId)}`} className="pg-link">
              Open source review →
            </Link>
            <p className="font-mono text-xs text-muted">Graph8 task: {r.taskId}</p>
          </div>
        </div>
      </details>

      {r.marker.completion && (
        <div className="rounded-xl border border-covered/25 bg-covered-soft p-3.5 text-sm text-covered">
          <p className="font-semibold">Completion record</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{r.marker.completion.evidence}</p>
        </div>
      )}
      {r.state !== "completed" && !editing && (
        <Button variant="secondary" onClick={() => setEditing(true)} disabled={!r.updatedAt}>
          Record completion evidence
        </Button>
      )}
      {editing && (
        <form onSubmit={complete} className="pg-fade space-y-3 rounded-xl bg-background p-4">
          <label className="pg-label">
            What was delivered? Include a work reference or acceptance note.
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} required minLength={10} maxLength={2000} className="pg-field mt-1.5" />
          </label>
          <p className="text-xs text-muted">This saves your evidence and completes the Graph8 task. PromiseGuard does not independently verify the delivery.</p>
          <div className="flex gap-2">
            <Button disabled={busy || evidence.trim().length < 10}>{busy ? "Saving…" : "Complete Graph8 task"}</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && <ErrorPanel message={error} />}
    </article>
  );
}
