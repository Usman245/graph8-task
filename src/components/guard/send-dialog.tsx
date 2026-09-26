"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CoverageBadge, ErrorPanel, GateBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { QuoteGateDetail, SendResult } from "@/lib/promiseguard/guard";

const fieldClass = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";

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
  const canSend = Boolean(d) && d!.gate.state !== "closed" && (clear || (showOverride && override.trim().length >= 10)) && (isDemo || acknowledged);

  return (
    <Drawer open={open} onClose={close} title={<span>Send quote{d ? `: ${d.quoteLabel}` : ""}</span>}>
      {gate.isPending ? (
        <div className="h-32 animate-pulse rounded bg-surface-muted" />
      ) : gate.isError ? (
        <ErrorPanel message={gate.error.message} onRetry={() => gate.refetch()} />
      ) : result ? (
        <div className="space-y-3 text-sm">
          {result.sent ? (
            <p className="rounded-md bg-covered-soft p-3 text-covered">
              Sent through Graph8 e-signature{result.status ? ` (quote status: ${result.status})` : ""}.
            </p>
          ) : (
            <div className="rounded-md bg-missing-soft p-3 text-missing">
              <p className="font-medium">Demo mode: Graph8 rendered the send preview. Nothing was sent.</p>
              {result.preview?.subject && <p className="mt-1">Subject: {result.preview.subject}</p>}
              {result.preview?.recipient && <p>Would go to: {result.preview.recipient}</p>}
            </div>
          )}
          {result.overrideNoteId && <p className="text-muted">The override and its reason were saved as a Graph8 deal note.</p>}
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <section className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Quote Guard</span>
              <GateBadge state={d!.gate.state} />
            </div>
            {d!.gate.reasons.map((r) => (
              <p key={r} className="text-muted">
                {r}
              </p>
            ))}
            {d!.openItems.length > 0 && (
              <ul className="space-y-1">
                {d!.openItems.map((i) => (
                  <li key={i.findingId} className="flex flex-wrap items-center gap-2">
                    <CoverageBadge coverage={i.coverage} />
                    {i.commitment}
                  </li>
                ))}
              </ul>
            )}
            {d!.gate.reviewTaskId && (
              <Link href={`/reviews/${encodeURIComponent(d!.gate.reviewTaskId)}`} className="inline-block text-primary hover:underline" onClick={close}>
                Open the review
              </Link>
            )}
          </section>

          <p className="text-muted">
            Recipient: <span className="text-foreground">{d!.signerEmail ?? "no signer set on the quote"}</span> · Status: {d!.quoteStatus ?? "unknown"}
          </p>

          <div>
            <label htmlFor="send-message" className="block font-medium">
              Message to the buyer (optional)
            </label>
            <textarea id="send-message" className={fieldClass} rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          {!clear && d!.gate.state !== "closed" && (
            <div className="space-y-2 rounded-md border border-conflict/30 bg-conflict-soft p-3">
              <p className="font-medium text-conflict">The gate is not clear. Resolve the open items, or override with a reason.</p>
              {!showOverride ? (
                <Button variant="secondary" onClick={() => setShowOverride(true)}>
                  Override the gate
                </Button>
              ) : (
                <>
                  <label htmlFor="override-reason" className="block font-medium">
                    Why send anyway? (at least 10 characters, saved as a Graph8 deal note)
                  </label>
                  <textarea
                    id="override-reason"
                    className={fieldClass}
                    rows={2}
                    maxLength={500}
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                  />
                </>
              )}
            </div>
          )}

          {isDemo ? (
            <p className="rounded-md bg-missing-soft p-3 text-missing">
              Demo quote: PromiseGuard calls Graph8&apos;s send preview, which renders the exact email and sends nothing.
            </p>
          ) : (
            <label className="flex items-start gap-2 rounded-md border border-border p-3">
              <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
              <span>I understand Graph8 will email this quote to {d!.signerEmail ?? "the signer"} for e-signature.</span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={!canSend || busy} variant={clear ? "primary" : "danger"}>
              {busy ? "Working…" : isDemo ? "Preview the send in Graph8" : clear ? "Send quote" : "Override and send"}
            </Button>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-conflict">
              {error}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
