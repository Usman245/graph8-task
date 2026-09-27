"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { ErrorPanel } from "@/components/status";
import type { handoffContext } from "@/lib/promiseguard/delivery";

type Context = Omit<Awaited<ReturnType<typeof handoffContext>>, "manifest">;
const field = "pg-field mt-1.5";

export function PromiseHandoff({ reviewTaskId }: { reviewTaskId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["handoff", reviewTaskId], queryFn: () => api<Context>(`/api/reviews/${encodeURIComponent(reviewTaskId)}/handoff`) });
  const [findingId, setFindingId] = useState("");
  const [owner, setOwner] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = q.data?.findings.find((f) => f.id === findingId);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const result = await api<{ reused: boolean }>(`/api/reviews/${encodeURIComponent(reviewTaskId)}/handoff`, { method: "POST", body: JSON.stringify({ findingId, assigneeId: owner, dueDate: date, scheduleReason: reason, conditionsAcknowledged: ack }) });
      setMessage(result.reused ? "This promise already has a delivery task. Open Delivery to track it." : "Delivery task saved in Graph8 with the promise evidence, owner, and deadline.");
      await qc.invalidateQueries({ queryKey: ["delivery"] });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create delivery task."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="handoff-heading" className="pg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><span aria-hidden className="mt-0.5 inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-covered-soft text-covered"><svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8h9m-3-3.5L11.5 8 8 11.5M13.5 3v10" strokeLinecap="round" strokeLinejoin="round" /></svg></span><div><h2 id="handoff-heading" className="text-lg font-semibold tracking-tight">Promise Handoff</h2><p className="mt-1 max-w-2xl text-sm text-muted">Carry agreed promises into delivery with an owner, a deadline, and the evidence behind them.</p></div></div>
      <Link href="/delivery" className="pg-link text-sm">Open Delivery →</Link>
    </div>
    {q.isPending ? <p role="status" className="mt-4 text-sm text-muted">Checking handoff readiness…</p> : q.isError ? <div className="mt-4"><ErrorPanel message={q.error.message} onRetry={() => q.refetch()} /></div> : <>
      {q.data.mode === "demo" && <p className="mt-5 rounded-xl border border-missing/25 bg-missing-soft p-3.5 text-sm text-missing">Demo rehearsal: creates a labeled Graph8 task. It does not accept the quote, send an email, or create an invoice.</p>}
      {q.data.reason ? <p className="mt-4 text-sm text-muted">{q.data.reason}</p> : q.data.findings.length === 0 ? <p className="mt-4 text-sm text-muted">No covered promises are available for handoff in this review.</p> : <form onSubmit={create} className="mt-5 space-y-5 border-t border-border pt-5">
        <label className="pg-label">Promise to deliver<select value={findingId} onChange={(e) => { setFindingId(e.target.value); setAck(false); setMessage(null); }} className={field} required><option value="">Select a verified promise</option>{q.data.findings.map((f) => <option key={f.id} value={f.id}>{f.commitment}</option>)}</select></label>
        {selected && <div className="pg-fade space-y-2 rounded-xl bg-background p-4 text-sm">
          <p className="pg-eyebrow">Conditions to preserve</p>
          <p>{selected.conditions.length ? selected.conditions.join(" · ") : "No explicit conditions were extracted. Check the excerpts before scheduling."}</p>
          <details><summary className="cursor-pointer font-medium">Review the original evidence</summary><div className="mt-2 space-y-2">{selected.salesEvidence.map((c, i) => <p key={`s${i}`} className="whitespace-pre-wrap break-words">Sales: “{c.excerpt}”</p>)}{selected.quoteEvidence.map((c, i) => <p key={`q${i}`} className="whitespace-pre-wrap break-words">Quote: “{c.excerpt}”</p>)}</div></details>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="pg-label">Delivery owner<select value={owner} onChange={(e) => setOwner(e.target.value)} className={field} required><option value="">Select a Graph8 team member</option>{q.data.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="pg-label">Target date (UTC)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} required /></label>
        </div>
        {!q.data.owners.length && <p className="text-sm text-missing">Add an active team member in Graph8 before creating delivery work.</p>}
        <label className="pg-label">Why this deadline?<textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={1000} rows={2} className={field} placeholder="For example: final assets received September 27; delivery due six weeks later." required /></label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm transition hover:bg-background"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="pg-check mt-0.5" required /><span>I reviewed the conditions and chose this delivery date. This date is not an AI interpretation of the contract.</span></label>
        <Button disabled={busy || !selected || !owner || !date || reason.trim().length < 10 || !ack}>{busy ? "Creating task…" : "Create Graph8 delivery task"}</Button>
      </form>}
    </>}
    {message && <p role="status" className="mt-4 rounded-xl border border-covered/25 bg-covered-soft p-3.5 text-sm text-covered">{message}</p>}
    {error && <div className="mt-4"><ErrorPanel message={error} /></div>}
  </section>;
}
