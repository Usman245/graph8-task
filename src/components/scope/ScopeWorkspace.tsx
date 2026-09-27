"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ScopeBadge } from "@/components/scope/ScopeBadge";
import { EmptyPanel, ErrorPanel, ModeBadge, SampleBadge } from "@/components/Status";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/components/ui/format";
import { Notice, PageHeader, StatTile } from "@/components/ui/PageHeader";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { ScopeView } from "@/lib/promiseguard/scope";
import { SCOPE_CLASSES, SCOPE_LABEL, scopeCounts } from "@/lib/promiseguard/scope-labels";
import type { ScopeItem, ScopeManifest } from "@/lib/promiseguard/scope-rules";

const TERMINAL = new Set(["completed", "failed", "stopped"]);
const TILE_TONE = { out_of_scope_agreed: "conflict", out_of_scope_unagreed: "missing", needs_review: "review", in_scope: "covered" } as const;

export function ScopeWorkspace({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const polls = useRef(0);
  const key = ["scope", taskId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      polls.current += 1;
      return api<ScopeView>(`/api/scope/${encodeURIComponent(taskId)}`);
    },
    refetchInterval: (q) => {
      const s = q.state.data?.manifest.runState;
      return s === "running" || s === "start_unknown" ? (polls.current < 10 ? 3000 : 8000) : false;
    },
  });
  const finalize = useMutation({
    mutationFn: () => api(`/api/scope/${encodeURIComponent(taskId)}/finalize`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const view = query.data;
  const m = view?.manifest;
  const { mutate: runFinalize, isPending: finalizing } = finalize;
  useEffect(() => {
    if (!m || finalizing) return;
    const done = view?.executionStatus && TERMINAL.has(view.executionStatus);
    if ((m.runState === "running" && done) || m.runState === "start_unknown") runFinalize();
  }, [m, view?.executionStatus, finalizing, runFinalize]);

  if (query.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" aria-label="Loading scope check" />;
  if (query.isError) return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;
  const s = m!;
  const isDemo = s.mode === "demo";
  const items = s.items ?? [];
  const counts = scopeCounts(items);

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ href: `/deals/${encodeURIComponent(s.dealId)}`, label: s.dealName }}
        eyebrow="Scope Creep Guard"
        title={`Scope check: ${s.quoteLabel}`}
        description={`Conversations after the quote was signed on ${formatDate(s.signedAt)}, checked against the signed quote.`}
        badges={
          <>
            <ModeBadge mode={s.mode} />
            {isDemo && <SampleBadge />}
            <Badge>Saved in Graph8</Badge>
          </>
        }
      />

      {isDemo && (
        <Notice tone="missing">The conversations in this check are the labeled sample conversation (synthetic). The quote, the check, and any change order are real Graph8 records.</Notice>
      )}

      {s.runState === "running" || s.runState === "start_unknown" ? (
        <div className="pg-card p-5 text-sm text-muted" aria-live="polite">
          Graph8 is checking the conversations{view?.executionStatus ? ` (${view.executionStatus})` : ""}. You can leave this page; the result is saved in Graph8.
        </div>
      ) : s.runState !== "completed" ? (
        <ErrorPanel message={s.runError?.message ?? "The scope check did not complete. Run a new check from the deal page."} />
      ) : (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SCOPE_CLASSES.map((k) => (
              <StatTile key={k} label={SCOPE_LABEL[k]} value={counts[k]} tone={TILE_TONE[k]} />
            ))}
          </section>
          {s.excludedBeforeSigning > 0 && (
            <p className="text-xs text-muted">{s.excludedBeforeSigning} message(s) dated before signing, or undated, were skipped.</p>
          )}
          {items.length === 0 ? (
            <EmptyPanel title="No requests for work were found after signing." />
          ) : (
            <div className="space-y-4">
              {items.map((it) => (
                <ScopeItemCard key={it.id} taskId={taskId} m={s} item={it} decision={view!.decisions[it.id]} onChanged={() => qc.invalidateQueries({ queryKey: key })} />
              ))}
            </div>
          )}
          {s.rejected.length > 0 && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer">Rejected AI items ({s.rejected.length}): their excerpts could not be verified</summary>
              <ul className="mt-2 list-disc pl-5">
                {s.rejected.map((r, i) => (
                  <li key={i}>
                    {r.request}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted">Decision support only; not a determination of contractual liability.</p>
        </>
      )}
    </div>
  );
}

function Excerpt({ m, label, cite }: { m: ScopeManifest; label: string; cite: ScopeItem["requestEvidence"][number] }) {
  const d = m.documents[cite.documentId];
  return (
    <figure className="rounded-lg border-l-4 border-primary/60 bg-background p-3">
      <figcaption className="pg-eyebrow flex flex-wrap items-center gap-2">
        {label}
        {d?.synthetic && <SampleBadge />}
      </figcaption>
      <blockquote className="mt-1 whitespace-pre-wrap">&ldquo;{cite.excerpt}&rdquo;</blockquote>
      {d && (
        <p className="mt-1 text-xs text-muted">
          {d.speaker ?? "Unknown speaker"} ({d.side}) · {d.source} · {formatDate(d.at)}
        </p>
      )}
    </figure>
  );
}

function ScopeItemCard({
  taskId,
  m,
  item,
  decision,
  onChanged,
}: {
  taskId: string;
  m: ScopeManifest;
  item: ScopeItem;
  decision: ScopeView["decisions"][string] | undefined;
  onChanged: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "change_order" | "goodwill" | "dismissed">("none");
  const [name, setName] = useState(item.changeOrder?.productName ?? item.request);
  const [desc, setDesc] = useState(item.changeOrder?.description ?? item.request);
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/scope/${encodeURIComponent(taskId)}/items/${encodeURIComponent(item.id)}`;
  const priceMinor = Math.round(Number(price) * 100);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPanel("none");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="pg-card space-y-3 p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <ScopeBadge value={item.classification} />
        <h3 className="font-semibold">{item.request}</h3>
      </div>
      <p className="text-muted">{item.reason}</p>
      {item.adjustment && <p className="text-xs text-missing">PromiseGuard adjusted the AI result: {item.adjustment}</p>}

      <div className="grid gap-2 md:grid-cols-2">
        {item.requestEvidence.map((c, i) => (
          <Excerpt key={`r${i}`} m={m} label="Requested" cite={c} />
        ))}
        {item.agreementEvidence.map((c, i) => (
          <Excerpt key={`a${i}`} m={m} label="Agreed" cite={c} />
        ))}
        {item.quoteEvidence.map((c, i) => (
          <figure key={`q${i}`} className="rounded-lg border-l-4 border-covered/60 bg-background p-3">
            <figcaption className="pg-eyebrow">Signed quote says</figcaption>
            <blockquote className="mt-1 whitespace-pre-wrap">&ldquo;{c.excerpt}&rdquo;</blockquote>
          </figure>
        ))}
      </div>

      {decision ? (
        <p className="rounded-lg bg-background px-3 py-2">
          <span className="font-medium">
            {decision.decision === "change_order" ? "Change order drafted" : decision.decision === "goodwill" ? "Accepted as goodwill" : "Dismissed"}
          </span>
          {decision.changeOrderLabel ? `: ${decision.changeOrderLabel} (draft in Graph8, not sent)` : `: ${decision.reason}`}
        </p>
      ) : item.classification !== "in_scope" ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPanel("change_order")}>Draft change order</Button>
            <Button variant="secondary" onClick={() => setPanel("goodwill")}>
              Accept as goodwill
            </Button>
            <Button variant="ghost" onClick={() => setPanel("dismissed")}>
              Dismiss
            </Button>
          </div>

          {panel === "change_order" && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api(`${base}/change-order`, { method: "POST", body: JSON.stringify({ productName: name, description: desc, priceMinor, expectedRevision: m.revision }) }));
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <label className="pg-label">
                  Line item
                  <input className="pg-field mt-1.5" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
                </label>
                <label className="pg-label">
                  Price
                  <input className="pg-field mt-1.5" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
                </label>
              </div>
              <label className="pg-label">
                Description
                <textarea className="pg-field mt-1.5" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={600} required />
              </label>
              <p className="text-xs text-muted">Creates a draft quote in Graph8 for this deal, copying the signer and billing details. Nothing is sent.</p>
              <div>
                <Button type="submit" disabled={busy || name.trim().length < 3 || desc.trim().length < 3 || !(priceMinor >= 0) || price === ""}>
                  {busy ? "Creating…" : "Create draft in Graph8"}
                </Button>
              </div>
            </form>
          )}

          {(panel === "goodwill" || panel === "dismissed") && (
            <form
              className="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api(`${base}/decision`, { method: "POST", body: JSON.stringify({ decision: panel, reason, expectedRevision: m.revision }) }));
              }}
            >
              <label className="pg-label">
                {panel === "goodwill" ? "Why do this work for free?" : "Why dismiss this item?"}
                <textarea className="pg-field mt-1.5" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </label>
              <div>
                <Button type="submit" variant="secondary" disabled={busy || reason.trim().length < 5}>
                  {busy ? "Saving…" : "Save to Graph8"}
                </Button>
              </div>
            </form>
          )}
          {error && <ErrorPanel message={error} />}
        </div>
      ) : null}
    </article>
  );
}
