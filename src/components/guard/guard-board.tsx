"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyPanel, ErrorPanel, GateBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMinor } from "@/components/ui/format";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { AutoResult, GuardBoard as Board, GuardRow } from "@/lib/promiseguard/guard";
import { SendDialog } from "./send-dialog";

const needsReview = (r: GuardRow) => r.gate.state === "no_review" || r.gate.state === "changed";
const ORDER = { at_risk: 0, changed: 1, no_review: 2, failed: 3, reviewing: 4, clear: 5, not_linked: 6, closed: 7 } as const;

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

  if (query.isPending) return <div className="h-64 animate-pulse rounded-lg bg-surface-muted" aria-label="Loading Quote Guard" />;
  if (query.isError) return <ErrorPanel message={`Could not load quotes from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;

  const b = query.data;
  const rows = [...b.rows].sort((x, y) => ORDER[x.gate.state] - ORDER[y.gate.state]);
  const pending = b.rows.filter(needsReview);
  const count = (s: GuardRow["gate"]["state"]) => b.rows.filter((r) => r.gate.state === s).length;
  const a = b.autopilot;

  return (
    <div className="space-y-6">
      <section aria-label="Gate summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["at_risk", "Promise gaps open"],
            ["changed", "Changed since review"],
            ["no_review", "Not reviewed"],
            ["clear", "Clear to send"],
          ] as const
        ).map(([s, label]) => (
          <div key={s} className="rounded-lg border border-border bg-surface p-4">
            <GateBadge state={s} />
            <p className="mt-2 text-2xl font-semibold">{count(s)}</p>
            <p className="sr-only">{label}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="autopilot-h" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 id="autopilot-h" className="font-semibold">
              Autopilot
            </h2>
            <p className="text-sm text-muted">
              {a.webhookRegistered
                ? `Graph8 calls PromiseGuard on ${a.webhookEvents.join(", ") || "quote events"}. Created or edited quotes are reviewed ${a.delaySeconds}s after the last edit; quotes sent with open gaps raise a Graph8 task.`
                : a.webhookUrlConfigured
                  ? "The webhook URL is configured but not registered in Graph8. Run: node scripts/setup-promiseguard.mts webhook"
                  : "No public webhook URL is configured (PROMISEGUARD_PUBLIC_URL), so Graph8 cannot call this server. Use Scan now to review changed quotes."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.webhookRegistered ? "covered" : "missing"}>{a.webhookRegistered ? "Webhook live" : "Webhook off"}</Badge>
            <Button onClick={() => scan()} disabled={scanning || pending.length === 0}>
              {scanning ? "Scanning…" : `Scan now (${pending.length})`}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Scan reviews every unreviewed or changed quote (up to 5 at a time) against all of its deal&apos;s conversations. Each new review
          runs the Graph8 workflow and uses AI credits; an unchanged quote is never reviewed twice.
        </p>
        {message && (
          <p role="status" className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary">
            {message}
          </p>
        )}
        {a.activity.length > 0 && (
          <details className="text-sm" open>
            <summary className="cursor-pointer font-medium">Recent activity (this server)</summary>
            <ul className="mt-2 divide-y divide-border">
              {a.activity.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    <span className="font-mono text-xs text-muted">{formatDate(e.at, true)}</span> · <Badge>{e.event}</Badge>{" "}
                    {e.quoteLabel ?? e.quoteId.slice(0, 8)}: {e.outcome}
                  </span>
                  {e.reviewTaskId && e.outcome.startsWith("Review") && (
                    <Link className="text-primary hover:underline" href={`/reviews/${encodeURIComponent(e.reviewTaskId)}`}>
                      Open review
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {b.errors.map((e) => (
        <p key={e} className="text-sm text-conflict">
          {e}
        </p>
      ))}

      {rows.length === 0 ? (
        <EmptyPanel title={b.mode === "demo" ? "No demo quotes found." : "No quotes found in this Graph8 workspace."}>
          {b.mode === "demo"
            ? "Run node scripts/setup-promiseguard.mts records to create the demo deals and draft quotes."
            : "Create a quote on a deal in Graph8. With the webhook registered it is reviewed automatically; otherwise use Scan now."}
        </EmptyPanel>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Quotes and their send-gate state</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Quote</th>
                <th className="px-4 py-2 font-medium">Deal</th>
                <th className="px-4 py-2 font-medium">Gate</th>
                <th className="px-4 py-2 font-medium">Open gaps</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.quoteId} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.quoteLabel}</p>
                    <p className="text-xs text-muted">
                      {formatMinor(r.totalMinor, r.currency)} · {r.quoteStatus ?? "unknown"} · updated {formatDate(r.updatedAt, true)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.dealId ? (
                      <Link className="text-primary hover:underline" href={`/deals/${encodeURIComponent(r.dealId)}`}>
                        {r.dealName ?? "Deal"}
                      </Link>
                    ) : (
                      <span className="text-muted">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <GateBadge state={r.gate.state} />
                    {r.gate.reasons[0] && <p className="mt-1 max-w-xs text-xs text-muted">{r.gate.reasons[0]}</p>}
                  </td>
                  <td className="px-4 py-3">{r.gate.state === "at_risk" || r.gate.state === "clear" ? r.gate.open : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {r.gate.reviewTaskId && (
                        <Link
                          href={`/reviews/${encodeURIComponent(r.gate.reviewTaskId)}`}
                          className="inline-flex items-center rounded-md border border-border px-3 py-1 text-sm hover:bg-surface-muted"
                        >
                          Open review
                        </Link>
                      )}
                      {(needsReview(r) || r.gate.state === "failed") && (
                        <Button variant="secondary" className="px-3 py-1" disabled={busyQuote === r.quoteId} onClick={() => scan([r.quoteId])}>
                          {busyQuote === r.quoteId ? "Starting…" : "Review now"}
                        </Button>
                      )}
                      {r.dealId && r.gate.state !== "closed" && (
                        <Button className="px-3 py-1" variant={r.gate.state === "clear" ? "primary" : "secondary"} onClick={() => setSendQuote(r.quoteId)}>
                          Send…
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sendQuote && <SendDialog quoteId={sendQuote} open onClose={() => setSendQuote(null)} />}
    </div>
  );
}
