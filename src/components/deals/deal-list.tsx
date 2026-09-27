"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyPanel, ErrorPanel, SampleBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/components/ui/format";
import { api } from "@/lib/api/client-fetch";
import type { DealPage } from "@/lib/promiseguard/context";
import type { Mode } from "@/lib/promiseguard/schemas";

export function DealList({ mode }: { mode: Mode }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const query = useQuery({
    queryKey: ["deals", mode, search, page],
    queryFn: () => api<DealPage & { mode: Mode }>(`/api/deals?page=${page}&search=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="deal-search" className="sr-only">
            Search deals
          </label>
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            id="deal-search"
            type="search"
            placeholder="Search deals by name"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm shadow-sm transition placeholder:text-muted/70 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary-soft"
          />
        </div>
        {query.data && query.data.items.length > 0 && (
          <p className="text-xs text-muted">
            {query.isFetching && !query.isPending ? "Updating…" : `${query.data.items.length} deal${query.data.items.length === 1 ? "" : "s"} on this page`}
          </p>
        )}
      </div>

      {query.isPending ? (
        <div className="space-y-3" aria-label="Loading deals">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border bg-surface-muted/60" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel message={`Could not load deals from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        search ? (
          <EmptyPanel title="No deals match your search.">Try a different name.</EmptyPanel>
        ) : mode === "demo" ? (
          <EmptyPanel title="No demo deal found in Graph8.">
            Run <code className="font-mono">node scripts/setup-promiseguard.mts records</code> to create the [PromiseGuard Demo] deals
            and draft quotes.
          </EmptyPanel>
        ) : (
          <EmptyPanel title="This Graph8 workspace has no deals yet.">
            Live mode reads real records only. Add a deal with a quote and a related email or meeting transcript in Graph8, or switch to
            Demo mode to see the full flow with the labeled sample conversation.
          </EmptyPanel>
        )
      ) : (
        <ul className={`space-y-3 transition-opacity ${query.isFetching ? "opacity-70" : ""}`}>
          {query.data.items.map((d) => {
            const name = stripDemo(d.name);
            const contact = d.primaryContact ? stripDemo(d.primaryContact) : null;
            return (
              <li
                key={d.id}
                className="group relative grid items-center gap-4 rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-px hover:border-primary/30 hover:shadow-[0_16px_32px_-20px_rgba(36,83,199,.45)] sm:p-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_auto]"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary"
                  >
                    {initials(name)}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold leading-snug">
                      <Link
                        href={`/deals/${encodeURIComponent(d.id)}`}
                        className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                        title={d.name}
                      >
                        {name}
                      </Link>
                      {mode === "demo" && <SampleBadge />}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted">{contact ?? "No contact"}</p>
                  </div>
                </div>

                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm md:justify-self-start">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Stage</dt>
                    <dd className="mt-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium">
                        <span className={`h-1.5 w-1.5 rounded-full ${d.stageName ? "bg-covered" : "bg-muted/50"}`} />
                        {d.stageName ?? "No stage"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Updated</dt>
                    <dd className="mt-1 text-muted">{formatDate(d.updatedAt)}</dd>
                  </div>
                </dl>

                <p className="text-lg font-semibold tabular-nums tracking-tight md:text-right">{formatMoney(d.amount, d.currency)}</p>

                <span
                  aria-hidden
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-primary-hover"
                >
                  Check promises against quote
                  <svg viewBox="0 0 16 16" className="h-4 w-4 transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {query.data && (query.data.page > 1 || query.data.hasNext) && (
        <div className="flex items-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted">Page {query.data.page}</span>
          <Button variant="secondary" disabled={!query.data.hasNext || query.isFetching} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
      {query.data && query.data.hiddenDemoDeals > 0 && (
        <p className="text-xs text-muted">{query.data.hiddenDemoDeals} [PromiseGuard Demo] deal(s) hidden in Live mode.</p>
      )}
    </div>
  );
}

const DEMO_PREFIX = /^\[PromiseGuard Demo\]\s*/i;
const stripDemo = (value: string) => value.replace(DEMO_PREFIX, "");

function initials(name: string) {
  const parts = name.split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w));
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "D";
}
