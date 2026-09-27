"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EmptyPanel, ErrorPanel, SampleBadge } from "@/components/Status";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/components/ui/format";
import { Notice } from "@/components/ui/PageHeader";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { ScopeContext } from "@/lib/promiseguard/scope";

const keyOf = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;

/** Deal page section: check conversations after signing for extra work the signed quote does not cover. */
export function ScopeCheckPanel({ dealId, isDemo }: { dealId: string; isDemo: boolean }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["scope-context", dealId],
    queryFn: () => api<ScopeContext>(`/api/deals/${encodeURIComponent(dealId)}/scope`),
  });
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);

  const c = query.data;
  const refs = (c?.sources.candidates ?? []).filter((s) => selected.includes(keyOf(s.ref))).map((s) => s.ref);
  const quote = c?.signedQuotes.find((q) => q.id === quoteId) ?? null;

  async function start() {
    if (!c || !quote || !refs.length) return;
    const key = JSON.stringify([quote.id, [...selected].sort()]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ taskId: string }>("/api/scope", {
        method: "POST",
        body: JSON.stringify({ dealId, quoteId: quote.id, sourceRefs: refs, requestId: request.current.id, mode: c.mode }),
      });
      router.push(`/scope/${encodeURIComponent(res.taskId)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the scope check.");
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="scope-h" className="pg-rise space-y-4">
      <div>
        <h2 id="scope-h" className="text-lg font-semibold tracking-tight">
          Scope Creep Guard <span className="font-normal text-muted">(after the quote is signed)</span>
        </h2>
        <p className="mt-1 text-sm text-muted">
          Checks conversations after signing for extra work the client asked for, and flags work someone agreed to do without payment.
        </p>
      </div>

      {query.isPending ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
      ) : query.isError ? (
        <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />
      ) : !c!.configured ? (
        <Notice tone="missing" title="Scope check is not set up">
          Run <code className="font-mono">node scripts/setup-promiseguard.mts scope</code> and add GRAPH8_SCOPE_WORKFLOW_ID to the environment.
        </Notice>
      ) : c!.signedQuotes.length === 0 ? (
        <EmptyPanel title="No signed quote on this deal yet.">
          {isDemo ? "In Demo mode, the Harbor Yoga deal has a signed quote to try this with." : "The check opens once Graph8 marks a quote on this deal accepted."}
        </EmptyPanel>
      ) : (
        <div className="pg-card space-y-5 p-5">
          <fieldset className="space-y-2">
            <legend className="pg-label">Signed quote</legend>
            {c!.signedQuotes.map((q) => (
              <label key={q.id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input type="radio" name="scope-quote" className="pg-check" checked={quoteId === q.id} onChange={() => setQuoteId(q.id)} />
                <span className="font-medium">{q.label}</span>
                <span className="text-muted">signed {formatDate(q.signedAt)}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="pg-label">Conversations after signing</legend>
            {c!.sources.candidates.length === 0 ? (
              <p className="text-sm text-muted">No conversations found for this deal.</p>
            ) : (
              c!.sources.candidates.map((s) => {
                const k = keyOf(s.ref);
                const after = quote && s.occurredAt ? s.occurredAt >= quote.signedAt : null;
                return (
                  <label key={k} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <input
                      type="checkbox"
                      className="pg-check"
                      checked={selected.includes(k)}
                      disabled={!s.textAvailable}
                      onChange={() => setSelected((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))}
                    />
                    <span className="font-medium">{s.title}</span>
                    {s.synthetic ? <SampleBadge /> : <Badge tone="primary">{s.originLabel}</Badge>}
                    <span className="text-muted">{formatDate(s.occurredAt)}</span>
                    {after === false && <span className="text-xs text-missing">before signing: its text will be skipped</span>}
                  </label>
                );
              })
            )}
            <p className="text-xs text-muted">Only messages dated on or after the signing date are checked. Undated text is skipped.</p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={start} disabled={busy || !quote || !refs.length}>
              {busy ? "Starting…" : "Check for scope creep"}
            </Button>
            <span className="text-xs text-muted">
              {!quote ? "Choose the signed quote." : !refs.length ? "Choose at least one conversation." : "Runs a Graph8 AI check and saves it as a Graph8 task."}
            </span>
          </div>
          {error && <ErrorPanel message={error} />}
        </div>
      )}

      {c && c.checks.length > 0 && (
        <ul className="pg-card divide-y divide-border overflow-hidden">
          {c.checks.map((k) => (
            <li key={k.taskId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <Link href={`/scope/${encodeURIComponent(k.taskId)}`} className="pg-link">
                Scope check · {k.quoteLabel}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {formatDate(k.createdAt, true)}
                {k.runState !== "completed" ? (
                  <Badge>{k.runState.replace("_", " ")}</Badge>
                ) : k.agreedUnpaid > 0 ? (
                  <Badge tone="conflict">{k.agreedUnpaid} agreed without payment</Badge>
                ) : k.open > 0 ? (
                  <Badge tone="missing">{k.open} open</Badge>
                ) : (
                  <Badge tone="covered">No open items</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
