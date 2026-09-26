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
      <div className="max-w-sm">
        <label htmlFor="deal-search" className="sr-only">
          Search deals
        </label>
        <input
          id="deal-search"
          type="search"
          placeholder="Search deals"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>

      {query.isPending ? (
        <div className="space-y-2" aria-label="Loading deals">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorPanel message={`Could not load deals from Graph8. ${query.error.message}`} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        search ? (
          <EmptyPanel title="No deals match your search.">Try a different name.</EmptyPanel>
        ) : mode === "demo" ? (
          <EmptyPanel title="No demo deal found in Graph8.">
            Run <code className="font-mono">node scripts/setup-promiseguard.mts records</code> to create the [PromiseGuard Demo] Acme deal
            and draft quote.
          </EmptyPanel>
        ) : (
          <EmptyPanel title="This Graph8 workspace has no deals yet.">
            Live mode reads real records only. Add a deal with a quote and a related email or meeting transcript in Graph8, or switch to
            Demo mode to see the full flow with the labeled sample conversation.
          </EmptyPanel>
        )
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Deal</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Value</th>
                <th className="px-4 py-2 font-medium">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data.items.map((d) => (
                <tr key={d.id} className="hover:bg-background">
                  <td className="px-4 py-3 font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      {d.name}
                      {mode === "demo" && <SampleBadge />}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{d.primaryContact ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{d.stageName ?? "No stage"}</td>
                  <td className="px-4 py-3">{formatMoney(d.amount, d.currency)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(d.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/deals/${encodeURIComponent(d.id)}`}
                      className="inline-flex whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
                    >
                      Check promises against quote
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
