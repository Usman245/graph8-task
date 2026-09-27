"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CoverageBadge, ErrorPanel, GateBadge, RiskBadge } from "@/components/Status";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Notice } from "@/components/ui/PageHeader";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { QuoteGateDetail, SendResult } from "@/lib/promiseguard/guard";

const fieldClass = "pg-field mt-1.5";

export const gateKey = (quoteId: string) => ["gate", quoteId];

/** Send a quote through PromiseGuard's gate. Live sends through Graph8; Demo renders Graph8's send preview only. */
export function SendDialog({ quoteId, open, onClose }: { quoteId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const gate = useQuery({
    queryKey: gateKey(quoteId),
    queryFn: () => api<QuoteGateDetail>(`/api/quotes/${encodeURIComponent(quoteId)}/gate`),
    enabled: open,
  });
  const [message, setMessage] = useState("");
  const [override, setOverride] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  function close() {
    setResult(null);
    setError(null);
    setOverride("");
    setShowOverride(false);
    setAcknowledged(false);
    onClose();
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<SendResult>(`/api/quotes/${encodeURIComponent(quoteId)}/send`, {
        method: "POST",
        body: JSON.stringify({ message: message || undefined, overrideReason: showOverride ? override : undefined }),
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: gateKey(quoteId) });
      qc.invalidateQueries({ queryKey: ["guard"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The send failed.");
    } finally {
      setBusy(false);
    }
  }

  const d = gate.data;
  const isDemo = d?.mode === "demo";
  const clear = d?.gate.state === "clear";
  const overrideOk = showOverride && override.trim().length >= 10;
  const blocked: string[] = !d
    ? []
    : d.gate.state === "closed"
      ? [d.gate.reasons[0] ?? "The quote is closed."]
      : [
          ...(!clear && !showOverride ? ["The gate is not clear: resolve the open items, or choose “Override the gate”."] : []),
          ...(!clear && showOverride && !overrideOk ? [`Give an override reason of at least 10 characters (${override.trim().length}/10).`] : []),
          ...(!isDemo && !acknowledged ? ["Tick the confirmation that Graph8 will email the quote."] : []),
        ];
  const canSend = Boolean(d) && blocked.length === 0;

  return (
    <Drawer
      open={open}
      onClose={close}
      title={
        <span className="block">
          <span className="pg-eyebrow block">Send quote</span>
          <span className="mt-1 block">{d ? d.quoteLabel : "Loading…"}</span>
        </span>
      }
    >
      {gate.isPending ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-20 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      ) : gate.isError ? (
        <ErrorPanel message={gate.error.message} onRetry={() => gate.refetch()} />
      ) : result ? (
        <div className="space-y-4 text-sm">
          {result.sent ? (
            <Notice tone="covered" title="Quote sent">
              Sent through Graph8 e-signature{result.status ? ` (quote status: ${result.status})` : ""}.
            </Notice>
          ) : (
            <Notice tone="missing" title="Demo mode: Graph8 rendered the send preview. Nothing was sent.">
              {result.preview?.subject && <p>Subject: {result.preview.subject}</p>}
              {result.preview?.recipient && <p>Would go to: {result.preview.recipient}</p>}
            </Notice>
          )}
          {result.overrideNoteId && <p className="text-muted">The override and its reason were saved as a Graph8 deal note.</p>}
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-6 text-sm">
          <section
            className={`space-y-3 rounded-xl border p-4 ${
              clear ? "border-covered/25 bg-covered-soft/50" : d!.gate.state === "at_risk" ? "border-conflict/25 bg-conflict-soft/50" : "border-border bg-background"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="pg-eyebrow">Quote Guard</span>
              <GateBadge state={d!.gate.state} />
            </div>
            {d!.gate.reasons.map((r) => (
              <p key={r} className="text-muted">
                {r}
              </p>
            ))}
            {d!.openItems.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {d!.openItems.map((i) => (
                  <li key={i.findingId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <CoverageBadge coverage={i.coverage} />
                    {i.riskLevel === "high" && <RiskBadge level="high" />}
                    <span className="font-medium">{i.commitment}</span>
                  </li>
                ))}
              </ul>
            )}
            {d!.gate.reviewTaskId && (
              <Link href={`/reviews/${encodeURIComponent(d!.gate.reviewTaskId)}`} className="pg-link inline-block" onClick={close}>
                Open the review →
              </Link>
            )}
          </section>

          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0">
              <dt className="pg-eyebrow">Recipient</dt>
              <dd className="mt-1 truncate font-medium">{d!.signerEmail ?? "No signer set on the quote"}</dd>
            </div>
            <div>
              <dt className="pg-eyebrow">Status</dt>
              <dd className="mt-1 font-medium capitalize">{d!.quoteStatus ?? "unknown"}</dd>
            </div>
          </dl>

          <div>
            <label htmlFor="send-message" className="pg-label">
              Message to the buyer <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="send-message" className={fieldClass} rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          {!clear && d!.gate.state !== "closed" && (
            <div className="space-y-3 rounded-xl border border-conflict/25 bg-conflict-soft p-4">
              <p className="font-semibold text-conflict">The gate is not clear. Resolve the open items, or override with a reason.</p>
              {!showOverride ? (
                <Button variant="secondary" onClick={() => setShowOverride(true)}>
                  Override the gate
                </Button>
              ) : (
                <div>
                  <label htmlFor="override-reason" className="pg-label text-conflict">
                    Why send anyway? <span className="font-normal">(at least 10 characters, saved as a Graph8 deal note)</span>
                  </label>
                  <textarea
                    id="override-reason"
                    className={fieldClass}
                    rows={2}
                    maxLength={500}
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {isDemo ? (
            <Notice tone="missing">Demo quote: PromiseGuard calls Graph8&apos;s send preview, which renders the exact email and sends nothing.</Notice>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition hover:bg-background">
              <input type="checkbox" className="pg-check mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>I understand Graph8 will email this quote to {d!.signerEmail ?? "the signer"} for e-signature.</span>
            </label>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-5">
            <Button onClick={send} disabled={!canSend || busy} variant={clear ? "primary" : "danger"}>
              {busy ? "Working…" : isDemo ? "Preview the send in Graph8" : clear ? "Send quote" : "Override and send"}
            </Button>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
          {blocked.length > 0 && (
            <ul aria-label="Before you can send" className="space-y-1 text-xs font-medium text-missing">
              {blocked.map((b) => (
                <li key={b}>✗ {b}</li>
              ))}
            </ul>
          )}
          {error && <ErrorPanel message={error} />}
        </div>
      )}
    </Drawer>
  );
}
