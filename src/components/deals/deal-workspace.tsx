"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CoverageBadge, EmptyPanel, ErrorPanel, ModeBadge, SampleBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { formatDate, formatMinor, formatMoney } from "@/components/ui/format";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { DealContext, QuoteOption } from "@/lib/promiseguard/context";
import type { SourceRef } from "@/lib/promiseguard/schemas";
import type { SourceCandidate } from "@/lib/promiseguard/sources";

const keyOf = (r: SourceRef) => `${r.kind}:${r.id}`;

export function DealWorkspace({ dealId }: { dealId: string }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["deal-context", dealId],
    queryFn: () => api<DealContext>(`/api/deals/${encodeURIComponent(dealId)}/context`),
  });
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [matchConfirmed, setMatchConfirmed] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<SourceCandidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // One request ID per deliberate operation; reused if the same selection is retried.
  const requestRef = useRef<{ key: string; id: string } | null>(null);

  const ctx = query.data;
  const quote = ctx?.quotes.find((q) => q.id === quoteId) ?? null;
  const selectedRefs = useMemo(
    () => (ctx?.sources.candidates ?? []).filter((c) => selected.includes(keyOf(c.ref))).map((c) => c.ref),
    [ctx, selected],
  );

  if (query.isPending) return <div className="h-64 animate-pulse rounded-lg bg-surface-muted" aria-label="Loading deal" />;
  if (query.isError) {
    return <ErrorPanel message={`Could not load this deal from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;
  }
  const c = query.data;
  const isDemo = c.mode === "demo";

  const blockers: string[] = [];
  if (c.modeMismatch) blockers.push(c.modeMismatch);
  if (!c.comparisonReady) blockers.push("The Graph8 connection or comparison workflow is unavailable (see Connection).");
  if (!quote) blockers.push("Select a quotation.");
  else if (quote.preview.length === 0) blockers.push("The selected quotation has no scope text to compare.");
  else if (quote.linkage === "customer_only" && !matchConfirmed) blockers.push("Confirm the quotation belongs to this deal.");
  if (selectedRefs.length === 0) blockers.push("Select at least one source.");

  async function start() {
    if (!quote || blockers.length) return;
    const selectionKey = JSON.stringify([quote.id, matchConfirmed, [...selected].sort()]);
    if (requestRef.current?.key !== selectionKey) requestRef.current = { key: selectionKey, id: crypto.randomUUID() };
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api<{ reviewTaskId: string }>("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          dealId: c.deal.id,
          quoteId: quote.id,
          sourceRefs: selectedRefs,
          matchConfirmed,
          requestId: requestRef.current.id,
          mode: c.mode,
        }),
      });
      router.push(`/reviews/${encodeURIComponent(res.reviewTaskId)}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Could not start the comparison.");
      setSubmitting(false);
    }
  }

  function toggle(k: string) {
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length >= c.maxSources ? s : [...s, k]));
  }

  return (
    <div className="space-y-8 pb-36">
      <div>
        <Link href="/deals" className="text-sm text-muted hover:text-foreground">
          ← Deals
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{c.deal.name}</h1>
          <ModeBadge mode={c.mode} />
          {isDemo && <SampleBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">
          {[
            c.deal.contacts.map((x) => x.name ?? x.email).filter(Boolean).join(", ") || "No contacts",
            formatMoney(c.deal.amount, c.deal.currency),
            c.deal.stageName ?? "No stage",
            c.deal.ownerName ? `Owner: ${c.deal.ownerName}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {c.modeMismatch && (
        <div role="alert" className="rounded-lg border border-missing/30 bg-missing-soft p-4 text-sm text-missing">
          {c.modeMismatch}
        </div>
      )}

      <section aria-labelledby="quotes-h" className="space-y-3">
        <h2 id="quotes-h" className="text-lg font-semibold">
          1. Choose the quotation
        </h2>
        {c.quoteWarnings.map((w) => (
          <p key={w} className="text-sm text-missing">
            {w}
          </p>
        ))}
        {c.quotes.length === 0 ? (
          <EmptyPanel title="No quotations found for this deal.">Create or link a quote to this deal in Graph8, then reload.</EmptyPanel>
        ) : (
          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="sr-only">Quotation</legend>
            {c.quotes.map((q) => (
              <QuoteCard
                key={q.id}
                q={q}
                selected={q.id === quoteId}
                onSelect={() => {
                  setQuoteId(q.id);
                  setMatchConfirmed(false);
                }}
              />
            ))}
          </fieldset>
        )}
        {quote?.linkage === "customer_only" && (
          <label className="flex items-start gap-2 rounded-md border border-missing/30 bg-missing-soft p-3 text-sm">
            <input type="checkbox" checked={matchConfirmed} onChange={(e) => setMatchConfirmed(e.target.checked)} className="mt-0.5" />
            <span>
              This quote is for the same customer but is not linked to this deal in Graph8. I confirm it belongs to this deal. The
              confirmation is saved with the review.
            </span>
          </label>
        )}
      </section>

      <section aria-labelledby="sources-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sources-h" className="text-lg font-semibold">
            2. Choose the sales conversations
          </h2>
          <span className="text-sm text-muted">
            {selected.length} of {c.maxSources} max selected
          </span>
        </div>
        {c.sources.errors.map((e) => (
          <p key={e} className="text-sm text-conflict">
            {e}
          </p>
        ))}
        {c.sources.candidates.length === 0 && !c.modeMismatch ? (
          isDemo ? (
            <EmptyPanel title="No sample conversation matches this deal's contacts." />
          ) : (
            <EmptyPanel title="No Graph8 emails or meeting transcripts match this deal's contacts.">
              PromiseGuard only suggests sources whose participants exactly match a deal contact&apos;s email address.
            </EmptyPanel>
          )
        ) : (
          <div className="grid gap-3">
            {c.sources.candidates.map((s) => {
              const k = keyOf(s.ref);
              const checked = selected.includes(k);
              return (
                <div
                  key={k}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-surface p-4 ${checked ? "border-primary" : "border-border"}`}
                >
                  <label className="flex flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={!s.textAvailable || (!checked && selected.length >= c.maxSources)}
                      onChange={() => toggle(k)}
                    />
                    <span className="space-y-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {s.title}
                        {s.synthetic ? <SampleBadge /> : <Badge tone="primary">{s.originLabel}</Badge>}
                      </span>
                      <span className="block text-sm text-muted">
                        {s.synthetic ? "Sample conversation (synthetic, not from Graph8)" : s.originLabel} · {formatDate(s.occurredAt)} ·
                        Matched contact: {s.matchedContacts.join(", ")}
                      </span>
                      <span className="block text-xs text-muted">Participants: {s.participants.join(", ")}</span>
                      {s.unavailableReason && <span className="block text-xs text-conflict">{s.unavailableReason}</span>}
                    </span>
                  </label>
                  <Button variant="secondary" className="px-3 py-1" onClick={() => setPreview(s)} disabled={!s.textAvailable}>
                    Preview
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {c.sources.coverage.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
            {c.sources.coverage.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="reviews-h" className="space-y-3">
        <h2 id="reviews-h" className="text-lg font-semibold">
          Previous PromiseGuard reviews
        </h2>
        {"error" in c.reviews ? (
          <ErrorPanel message={c.reviews.error} />
        ) : c.reviews.items.length === 0 ? (
          <p className="text-sm text-muted">No reviews saved in Graph8 for this deal yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {c.reviews.items.map((r) => (
              <li key={r.taskId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/reviews/${encodeURIComponent(r.taskId)}`} className="font-medium text-primary hover:underline">
                      {r.quoteLabel ?? "Review"}
                    </Link>
                    {r.mode && <ModeBadge mode={r.mode} />}
                    <Badge>{r.readOnly ? "Read-only" : (r.runState ?? "unknown").replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDate(r.createdAt, true)} · {r.sourceCount} source(s) · Graph8 task {r.taskStatus ?? ""}
                  </p>
                </div>
                {r.counts && (
                  <div className="flex flex-wrap gap-1">
                    {(["conflict", "missing", "needs_review", "covered"] as const).map((k) =>
                      r.counts![k] ? (
                        <span key={k} className="flex items-center gap-1">
                          <CoverageBadge coverage={k} />
                          <span className="text-xs">{r.counts![k]}</span>
                        </span>
                      ) : null,
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {"partial" in c.reviews && c.reviews.partial && <p className="text-xs text-muted">Showing the 100 most recent deal tasks.</p>}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm">
            <p>
              <span className="font-medium">{quote ? quote.label : "No quote selected"}</span>
              <span className="text-muted"> · {selectedRefs.length} source(s)</span>
              {isDemo && selectedRefs.length > 0 && <span className="text-missing"> · Sample conversation</span>}
              {quote && !quote.textComplete && <span className="text-missing"> · Quote text incomplete</span>}
            </p>
            <p className="text-xs text-muted">
              {blockers[0] ?? "Creates a review task in Graph8 and runs the comparison."}
            </p>
            {submitError && (
              <p role="alert" className="text-xs text-conflict">
                {submitError}
              </p>
            )}
          </div>
          <Button onClick={start} disabled={blockers.length > 0 || submitting}>
            {submitting ? "Starting…" : "Check promises"}
          </Button>
        </div>
      </div>

      <SourcePreview dealId={c.deal.id} source={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function QuoteCard({ q, selected, onSelect }: { q: QuoteOption; selected: boolean; onSelect: () => void }) {
  return (
    <div className={`rounded-lg border bg-surface p-4 ${selected ? "border-primary ring-1 ring-primary" : "border-border"}`}>
      <label className="flex items-start gap-3">
        <input type="radio" name="quote" className="mt-1" checked={selected} onChange={onSelect} />
        <span className="flex-1 space-y-1">
          <span className="block font-medium">{q.label}</span>
          <span className="block text-sm text-muted">
            {formatMinor(q.totalMinor, q.currency)} · {q.status ?? "unknown status"} · created {formatDate(q.createdAt)}
            {q.sentAt ? ` · sent ${formatDate(q.sentAt)}` : ""}
          </span>
          <span className="flex flex-wrap gap-1">
            {q.linkage === "deal" ? <Badge tone="covered">Linked to this deal</Badge> : <Badge tone="missing">Same customer, not linked</Badge>}
            {q.preview.length === 0 ? (
              <Badge tone="conflict">Quotation detail is insufficient</Badge>
            ) : q.textComplete ? (
              <Badge tone="neutral">Scope text: {q.includedFields.join(", ")}</Badge>
            ) : (
              <Badge tone="missing">Quote text incomplete</Badge>
            )}
          </span>
          {q.limitations.map((l) => (
            <span key={l} className="block text-xs text-missing">
              {l}
            </span>
          ))}
        </span>
      </label>
      {q.preview.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-primary">Preview quote scope</summary>
          <div className="mt-2 space-y-2">
            {q.preview.map((p) => (
              <div key={p.path} className="rounded bg-background p-2">
                <p className="text-xs font-medium text-muted">{p.path}</p>
                <p className="whitespace-pre-wrap">{p.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

type SourcePreviewData = {
  label: string;
  synthetic: boolean;
  documents: Array<{ id: string; speaker: string | null; speakerSide: string; occurredAt: string | null; text: string }>;
};

function SourcePreview({ dealId, source, onClose }: { dealId: string; source: SourceCandidate | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["source", dealId, source?.ref.kind, source?.ref.id],
    queryFn: () =>
      api<SourcePreviewData>(
        `/api/sources/${source!.ref.kind}/${encodeURIComponent(source!.ref.id)}?dealId=${encodeURIComponent(dealId)}`,
      ),
    enabled: Boolean(source),
  });
  return (
    <Drawer
      open={Boolean(source)}
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {source?.title}
          {source?.synthetic && <SampleBadge />}
        </span>
      }
    >
      {source?.synthetic && (
        <p className="mb-4 rounded-md bg-missing-soft p-3 text-sm text-missing">
          Sample conversation: synthetic demonstration content from the build plan. It is not a Graph8 email or meeting transcript.
        </p>
      )}
      {query.isPending ? (
        <div className="h-32 animate-pulse rounded bg-surface-muted" />
      ) : query.isError ? (
        <ErrorPanel message={query.error.message} />
      ) : (
        <ol className="space-y-3">
          {query.data.documents.map((d) => (
            <li key={d.id} className="rounded-md border border-border p-3">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-foreground">{d.speaker ?? "Unknown speaker"}</span>
                <Badge tone={d.speakerSide === "seller" ? "primary" : d.speakerSide === "buyer" ? "neutral" : "review"}>
                  {d.speakerSide === "unknown" ? "Unknown side" : d.speakerSide}
                </Badge>
                {formatDate(d.occurredAt, true)}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{d.text}</p>
            </li>
          ))}
        </ol>
      )}
    </Drawer>
  );
}
