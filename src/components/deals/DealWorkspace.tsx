"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { CoverageBadge, EmptyPanel, ErrorPanel, ModeBadge, SampleBadge } from "@/components/Status";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { formatDate, formatMinor, formatMoney } from "@/components/ui/format";
import { Notice, PageHeader, StepHeading } from "@/components/ui/PageHeader";
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

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-label="Loading deal">
        <div className="h-20 w-2/3 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return <ErrorPanel message={`Could not load this deal from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />;
  }
  const c = query.data;
  const isDemo = c.mode === "demo";

  // Everything that must be true before "Check promises" is enabled, shown to the user as a checklist.
  const checklist: Array<{ label: string; done: boolean; href?: string }> = [
    { label: "Choose a quotation in step 1", done: Boolean(quote), href: "#quotes-h" },
    ...(quote && quote.preview.length === 0
      ? [{ label: "Choose a quotation that has scope text to compare", done: false, href: "#quotes-h" }]
      : []),
    ...(quote?.linkage === "customer_only"
      ? [{ label: "Confirm the quotation belongs to this deal", done: matchConfirmed, href: "#quotes-h" }]
      : []),
    { label: "Choose at least one conversation in step 2", done: selectedRefs.length > 0, href: "#sources-h" },
  ];
  const blockers: string[] = [
    ...(c.modeMismatch ? [c.modeMismatch] : []),
    ...(!c.comparisonReady ? ["The Graph8 connection or comparison workflow is unavailable. Open Connection to see which check failed."] : []),
    ...checklist.filter((i) => !i.done).map((i) => i.label),
  ];

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

  const contacts = c.deal.contacts.map((x) => x.name ?? x.email).filter(Boolean).join(", ");

  return (
    <div className="space-y-10 pb-40">
      <PageHeader
        back={{ href: "/deals", label: "Deals" }}
        eyebrow="Check promises against quote"
        title={c.deal.name}
        badges={
          <>
            <ModeBadge mode={c.mode} />
            {isDemo && <SampleBadge />}
          </>
        }
        description={
          <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
            {[
              ["Contacts", contacts || "No contacts"],
              ["Value", formatMoney(c.deal.amount, c.deal.currency)],
              ["Stage", c.deal.stageName ?? "No stage"],
              ...(c.deal.ownerName ? [["Owner", c.deal.ownerName]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="pg-eyebrow">{k}</dt>
                <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        }
      />

      {c.modeMismatch && (
        <div role="alert">
          <Notice tone="missing">{c.modeMismatch}</Notice>
        </div>
      )}

      <section aria-labelledby="quotes-h" className="pg-rise space-y-4" style={{ animationDelay: "60ms" }}>
        <StepHeading n={1} id="quotes-h" title="Choose the quotation" />
        <p className="text-sm text-muted">Click a quote card to select it. PromiseGuard never picks the quote for you.</p>
        {c.quoteWarnings.map((w) => (
          <Notice key={w} tone="missing">
            {w}
          </Notice>
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
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-missing/25 bg-missing-soft p-4 text-sm">
            <input type="checkbox" checked={matchConfirmed} onChange={(e) => setMatchConfirmed(e.target.checked)} className="pg-check mt-0.5" />
            <span>
              This quote is for the same customer but is not linked to this deal in Graph8. I confirm it belongs to this deal. The
              confirmation is saved with the review.
            </span>
          </label>
        )}
      </section>

      <section aria-labelledby="sources-h" className="pg-rise space-y-4" style={{ animationDelay: "120ms" }}>
        <StepHeading
          n={2}
          id="sources-h"
          title="Choose the sales conversations"
          aside={
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-muted">
              <span className="tabular-nums text-foreground">{selected.length}</span> of {c.maxSources} max selected
            </span>
          }
        />
        {c.sources.errors.map((e) => (
          <ErrorPanel key={e} message={e} />
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
              const disabled = !s.textAvailable || (!checked && selected.length >= c.maxSources);
              return (
                <div
                  key={k}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-surface p-4 transition sm:p-5 ${
                    checked ? "border-primary bg-primary-soft/30 ring-4 ring-primary-soft" : "border-border hover:border-foreground/15"
                  } ${disabled && !checked ? "opacity-70" : ""}`}
                >
                  <label className={`flex min-w-0 flex-1 items-start gap-4 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <input type="checkbox" className="pg-check mt-1" checked={checked} disabled={disabled} onChange={() => toggle(k)} />
                    <span
                      aria-hidden
                      className={`hidden h-10 w-10 flex-none items-center justify-center rounded-xl sm:inline-flex ${
                        s.synthetic ? "bg-missing-soft text-missing" : "bg-primary-soft text-primary"
                      }`}
                    >
                      <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7Z" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
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
                  <Button variant="secondary" className="px-3 py-1.5" onClick={() => setPreview(s)} disabled={!s.textAvailable}>
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

      <section aria-labelledby="reviews-h" className="pg-rise space-y-4" style={{ animationDelay: "180ms" }}>
        <h2 id="reviews-h" className="text-lg font-semibold tracking-tight">
          Previous PromiseGuard reviews
        </h2>
        {"error" in c.reviews ? (
          <ErrorPanel message={c.reviews.error} />
        ) : c.reviews.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">No reviews saved in Graph8 for this deal yet.</p>
        ) : (
          <ul className="pg-card divide-y divide-border overflow-hidden">
            {c.reviews.items.map((r) => (
              <li key={r.taskId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm transition hover:bg-background/70">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/reviews/${encodeURIComponent(r.taskId)}`} className="pg-link">
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
                  <div className="flex flex-wrap gap-2">
                    {(["conflict", "missing", "needs_review", "covered"] as const).map((k) =>
                      r.counts![k] ? (
                        <span key={k} className="flex items-center gap-1">
                          <CoverageBadge coverage={k} />
                          <span className="text-xs font-semibold tabular-nums">{r.counts![k]}</span>
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

      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/90 px-5 py-3.5 shadow-[0_16px_48px_-16px_rgba(28,29,31,.35)] backdrop-blur-md">
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold">{quote ? quote.label : "No quote selected"}</span>
              <span className="text-muted">· {selectedRefs.length} source(s)</span>
              {isDemo && selectedRefs.length > 0 && <span className="text-missing">· Sample conversation</span>}
              {quote && !quote.textComplete && <span className="text-missing">· Quote text incomplete</span>}
            </p>
            {blockers.length === 0 ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-covered">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-covered" />
                Ready. Creates a review task in Graph8 and runs the comparison.
              </p>
            ) : (
              <ul aria-label="Before you can check promises" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {c.modeMismatch && <li className="text-conflict">✗ {c.modeMismatch}</li>}
                {!c.comparisonReady && (
                  <li className="text-conflict">
                    ✗ Graph8 comparison unavailable.{" "}
                    <Link href="/settings" className="underline">
                      Open Connection
                    </Link>
                  </li>
                )}
                {checklist.map((i) => (
                  <li key={i.label} className={i.done ? "text-covered" : "font-medium text-missing"}>
                    {i.done ? "✓" : "○"}{" "}
                    {i.done || !i.href ? (
                      i.label
                    ) : (
                      <a href={i.href} className="underline underline-offset-2">
                        {i.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {submitError && (
              <p role="alert" className="mt-1 text-xs text-conflict">
                {submitError}
              </p>
            )}
          </div>
          <Button onClick={start} disabled={blockers.length > 0 || submitting} className="px-5 py-2.5">
            {submitting ? "Starting…" : "Check promises"}
            {!submitting && (
              <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </Button>
        </div>
      </div>

      <SourcePreview dealId={c.deal.id} source={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function QuoteCard({ q, selected, onSelect }: { q: QuoteOption; selected: boolean; onSelect: () => void }) {
  return (
    <div
      className={`rounded-2xl border bg-surface p-5 transition ${
        selected ? "border-primary bg-primary-soft/30 ring-4 ring-primary-soft" : "border-border hover:border-foreground/15"
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input type="radio" name="quote" className="pg-check mt-1" checked={selected} onChange={onSelect} />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex items-start justify-between gap-3">
            <span className="font-semibold leading-snug">{q.label}</span>
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight">{formatMinor(q.totalMinor, q.currency)}</span>
          </span>
          <span className="block text-xs text-muted">
            <span className="capitalize">{q.status ?? "unknown status"}</span> · created {formatDate(q.createdAt)}
            {q.sentAt ? ` · sent ${formatDate(q.sentAt)}` : ""}
          </span>
          <span className="flex flex-wrap gap-1.5">
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
        <details className="group mt-4 border-t border-border pt-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-primary">
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Preview quote scope
          </summary>
          <div className="mt-3 space-y-2">
            {q.preview.map((p) => (
              <div key={p.path} className="rounded-lg bg-background p-3">
                <p className="pg-eyebrow">{p.path}</p>
                <p className="mt-1 whitespace-pre-wrap">{p.text}</p>
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
        <span className="block">
          <span className="pg-eyebrow block">Conversation preview</span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {source?.title}
            {source?.synthetic && <SampleBadge />}
          </span>
        </span>
      }
    >
      {source?.synthetic && (
        <Notice tone="missing" className="mb-5">
          Sample conversation: synthetic demonstration content from the build plan. It is not a Graph8 email or meeting transcript.
        </Notice>
      )}
      {query.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel message={query.error.message} />
      ) : (
        <ol className="space-y-4">
          {query.data.documents.map((d) => {
            const seller = d.speakerSide === "seller";
            return (
              <li key={d.id} className={`flex gap-3 ${seller ? "" : "flex-row-reverse"}`}>
                <span
                  aria-hidden
                  className={`mt-1 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                    seller ? "bg-primary-soft text-primary" : d.speakerSide === "buyer" ? "bg-surface-muted text-muted" : "bg-review-soft text-review"
                  }`}
                >
                  {(d.speaker ?? "?").trim().charAt(0).toUpperCase()}
                </span>
                <div className={`min-w-0 max-w-[85%] rounded-2xl border p-3.5 ${seller ? "rounded-tl-sm border-primary/15 bg-primary-soft/40" : "rounded-tr-sm border-border bg-background"}`}>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-foreground">{d.speaker ?? "Unknown speaker"}</span>
                    <Badge tone={seller ? "primary" : d.speakerSide === "buyer" ? "neutral" : "review"}>
                      {d.speakerSide === "unknown" ? "Unknown side" : d.speakerSide}
                    </Badge>
                    {formatDate(d.occurredAt, true)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{d.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}
