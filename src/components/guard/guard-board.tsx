"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyPanel, ErrorPanel, GateBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMinor } from "@/components/ui/format";
import { StatTile } from "@/components/ui/page-header";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { AutoResult, GuardBoard as Board, GuardRow } from "@/lib/promiseguard/guard";
import { SendDialog } from "./send-dialog";

const needsReview = (r: GuardRow) => r.gate.state === "no_review" || r.gate.state === "changed";
const ORDER = { at_risk: 0, incomplete: 1, changed: 2, no_review: 3, failed: 4, reviewing: 5, clear: 6, not_linked: 7, closed: 8 } as const;

export function GuardBoard() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["guard"],
    queryFn: () => api<Board>("/api/guard"),
    // Fast while Graph8 is comparing; otherwise slow polling picks up webhook-triggered reviews.
    refetchInterval: (q) => (q.state.data?.rows.some((r) => r.gate.state === "reviewing") ? 5000 : 30000),
  });
  const [scanning, setScanning] = useState(false);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sendQuote, setSendQuote] = useState<string | null>(null);

  async function scan(quoteIds?: string[]) {
    setMessage(null);
    if (quoteIds?.length === 1) setBusyQuote(quoteIds[0]);
    else setScanning(true);
    try {
      if (quoteIds?.length === 1) {
        const r = await api<AutoResult>(`/api/quotes/${encodeURIComponent(quoteIds[0])}/review`, { method: "POST" });
        setMessage(r.outcome === "skipped" ? `Not reviewed: ${r.reason}` : r.outcome === "started" ? "Review started in Graph8." : "Already reviewed.");
      } else {
        const r = await api<{ results: AutoResult[]; remaining: number }>("/api/guard/scan", { method: "POST", body: JSON.stringify({}) });
        const started = r.results.filter((x) => x.outcome === "started").length;
        const skipped = r.results.filter((x) => x.outcome === "skipped");
        setMessage(
          `${started} review(s) started` +
            (skipped.length ? `, ${skipped.length} skipped (${skipped.map((s) => s.reason).join("; ")})` : "") +
            (r.remaining ? `. ${r.remaining} more remain; scan again.` : "."),
        );
      }
      await qc.invalidateQueries({ queryKey: ["guard"] });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "The scan failed.");
    } finally {
      setScanning(false);
      setBusyQuote(null);
    }
  }

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-label="Loading Quote Guard">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    );
  }
  if (query.isError) return <ErrorPanel message={`Could not load quotes from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;

  const b = query.data;
  const rows = [...b.rows].sort((x, y) => ORDER[x.gate.state] - ORDER[y.gate.state]);
  const pending = b.rows.filter(needsReview);
  const count = (s: GuardRow["gate"]["state"]) => b.rows.filter((r) => r.gate.state === s).length;
  const a = b.autopilot;

  return (
    <div className="space-y-8">
      <section aria-label="Gate summary" className="pg-rise grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["at_risk", "Promise risks open", "conflict"],
            ["changed", "Quote or evidence changed", "missing"],
            ["no_review", "Not reviewed", "review"],
            ["clear", "Clear to send", "covered"],
          ] as const
        ).map(([s, label, tone]) => (
          <StatTile key={s} tone={tone} value={count(s)} label={<GateBadge state={s} />}>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </StatTile>
        ))}
      </section>

      <section aria-labelledby="autopilot-h" className="pg-card pg-rise overflow-hidden" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 max-w-3xl gap-4">
            <span
              aria-hidden
              className={`mt-0.5 inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl ${
                a.webhookRegistered ? "bg-covered-soft text-covered" : "bg-missing-soft text-missing"
              }`}
            >
              <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="autopilot-h" className="text-lg font-semibold tracking-tight">
                  Autopilot
                </h2>
                <Badge tone={a.webhookRegistered ? "covered" : "missing"}>{a.webhookRegistered ? "Webhook live" : "Webhook off"}</Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {a.webhookRegistered
                  ? `Graph8 calls PromiseGuard on ${a.webhookEvents.join(", ") || "quote events"}. Created or edited quotes are reviewed ${a.delaySeconds}s after the last edit; quotes sent with open gaps raise a Graph8 task.`
                  : a.webhookUrlConfigured
                    ? "The webhook URL is configured but not registered in Graph8. Run: node scripts/setup-promiseguard.mts webhook"
                    : "No public webhook URL is configured (PROMISEGUARD_PUBLIC_URL), so Graph8 cannot call this server. Use Scan now to review changed quotes."}
              </p>
            </div>
          </div>
          <Button onClick={() => scan()} disabled={scanning || pending.length === 0}>
            {scanning ? "Scanning…" : `Scan now (${pending.length})`}
          </Button>
        </div>
        <div className="space-y-3 border-t border-border bg-background/50 px-5 py-4 sm:px-6">
          <p className="text-xs text-muted">
            Scan reviews unreviewed quotes and outdated reviews (up to 5 at a time) using the most recent readable sources within
            the review limits. Each new review uses AI credits; completed reviews are reused when their quote and evidence are unchanged.
          </p>
          {message && (
            <p role="status" className="rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-primary">
              {message}
            </p>
          )}
          {a.activity.length > 0 && (
            <details className="group text-sm" open>
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
                <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Recent autopilot activity
              </summary>
              <p className="mt-1 text-xs text-muted">
                Automatic reviews are read back from their Graph8 review tasks, so they appear here after a restart or on any
                server. Skips and alerts marked &ldquo;this server&rdquo; were seen only by this instance.
              </p>
              <ol className="mt-3 space-y-0 border-l border-border pl-4">
                {a.activity.map((e, i) => (
                  <li key={i} className="relative flex flex-wrap items-center justify-between gap-2 py-2">
                    <span aria-hidden className="absolute -left-[21px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" />
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">{formatDate(e.at, true)}</span>
                      <Badge>{e.event}</Badge>
                      <span>
                        <span className="font-medium">{e.quoteLabel ?? e.quoteId.slice(0, 8)}</span>: {e.outcome}
                      </span>
                      {e.source === "server" && <span className="text-xs text-muted">(this server)</span>}
                    </span>
                    {e.reviewTaskId && e.outcome.startsWith("Review") && (
                      <Link className="pg-link text-sm" href={`/reviews/${encodeURIComponent(e.reviewTaskId)}`}>
                        Open review →
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </section>

      {b.errors.map((e) => (
        <ErrorPanel key={e} message={e} />
      ))}

      <section aria-labelledby="quotes-h" className="pg-rise space-y-4" style={{ animationDelay: "140ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="quotes-h" className="text-xl font-semibold tracking-tight">
            Quotes
          </h2>
          {rows.length > 0 && <p className="text-xs text-muted">Sorted by risk, most urgent first</p>}
        </div>
        {rows.length === 0 ? (
          <EmptyPanel title={b.mode === "demo" ? "No demo quotes found." : "No quotes found in this Graph8 workspace."}>
            {b.mode === "demo"
              ? "Run node scripts/setup-promiseguard.mts records to create the demo deals and draft quotes."
              : "Create a quote on a deal in Graph8. With the webhook registered it is reviewed automatically; otherwise use Scan now."}
          </EmptyPanel>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.quoteId}
                className={`pg-card grid items-center gap-4 p-4 transition hover:border-foreground/15 sm:p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] ${
                  r.gate.state === "at_risk" ? "border-l-4 border-l-conflict" : r.gate.state === "clear" ? "border-l-4 border-l-covered" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{r.quoteLabel}</p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="font-semibold tabular-nums text-foreground">{formatMinor(r.totalMinor, r.currency)}</span> ·{" "}
                    {r.quoteStatus ?? "unknown"} · updated {formatDate(r.updatedAt, true)}
                  </p>
                  <p className="mt-1.5 text-sm">
                    {r.dealId ? (
                      <Link className="pg-link" href={`/deals/${encodeURIComponent(r.dealId)}`}>
                        {r.dealName ?? "Deal"}
                      </Link>
                    ) : (
                      <span className="text-muted">Not linked to a deal</span>
                    )}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <GateBadge state={r.gate.state} />
                    {(r.gate.state === "at_risk" || r.gate.state === "clear") && (
                      <span className="text-xs text-muted">
                        <span className="font-semibold tabular-nums text-foreground">{r.gate.open}</span> open gap{r.gate.open === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {r.gate.reasons[0] && <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.gate.reasons[0]}</p>}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {r.gate.reviewTaskId && (
                    <Link
                      href={`/reviews/${encodeURIComponent(r.gate.reviewTaskId)}`}
                      className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold shadow-sm transition hover:border-foreground/20 hover:bg-background"
                    >
                      Open review
                    </Link>
                  )}
                  {(needsReview(r) || r.gate.state === "failed" || r.gate.state === "incomplete") && (
                    <Button variant="secondary" className="px-3 py-1.5" disabled={busyQuote === r.quoteId} onClick={() => scan([r.quoteId])}>
                      {busyQuote === r.quoteId ? "Starting…" : "Review now"}
                    </Button>
                  )}
                  {r.dealId && r.gate.state !== "closed" && (
                    <Button className="px-3 py-1.5" variant={r.gate.state === "clear" ? "primary" : "secondary"} onClick={() => setSendQuote(r.quoteId)}>
                      Send…
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sendQuote && <SendDialog quoteId={sendQuote} open onClose={() => setSendQuote(null)} />}
    </div>
  );
}
