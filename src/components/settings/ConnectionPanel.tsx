"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { ConnectionStatus } from "@/lib/promiseguard/capabilities";

export function ConnectionPanel() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["connection"],
    queryFn: () => api<ConnectionStatus>("/api/connection"),
  });

  // Bypasses the 30s server cache and re-probes every Graph8 capability.
  const recheck = useMutation({
    mutationFn: () => api<ConnectionStatus>("/api/connection?refresh=1"),
    onSuccess: (fresh) => qc.setQueryData(["connection"], fresh),
  });

  if (query.isPending) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" aria-label="Loading connection status" />;
  }
  if (query.isError) {
    return (
      <div role="alert" className="rounded-xl border border-conflict/25 bg-conflict-soft p-4 text-sm text-conflict">
        Could not load connection status: {query.error.message}{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const s = query.data;
  return (
    <div className="space-y-6">
      <section className="pg-card pg-rise overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/60 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">Live Graph8 AI and storage</Badge>
            {s.demoEnabled && <Badge tone="missing">Demo mode available</Badge>}
            <Badge tone={s.comparisonReady ? "covered" : "conflict"}>
              {s.comparisonReady ? "Comparison available" : "Comparison blocked"}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span aria-live="polite" className="text-xs">
              {recheck.isPending ? (
                <span className="text-muted">Checking Graph8…</span>
              ) : recheck.isError ? (
                <span className="text-conflict">
                  Check failed: {recheck.error instanceof ApiError ? recheck.error.message : "network error"}
                </span>
              ) : recheck.isSuccess ? (
                <span className="text-covered">
                  Checked at {new Date(s.checkedAt).toLocaleTimeString()}: {s.checks.filter((c) => c.status === "ok").length} of{" "}
                  {s.checks.length} available
                </span>
              ) : null}
            </span>
            <Button variant="secondary" onClick={() => recheck.mutate()} disabled={recheck.isPending}>
              {recheck.isPending ? "Checking…" : "Run checks again"}
            </Button>
          </div>
        </div>
        <ul className={`divide-y divide-border transition-opacity ${recheck.isPending ? "opacity-50" : ""}`}>
          {s.checks.map((c) => (
            <li key={c.id + c.label} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition hover:bg-background/60">
              <div className="flex min-w-0 gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                    c.status === "ok" ? "bg-covered-soft text-covered" : c.status === "failed" ? "bg-conflict-soft text-conflict" : "bg-surface-muted text-muted"
                  }`}
                >
                  {c.status === "ok" ? "✓" : c.status === "failed" ? "!" : "–"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.label}</p>
                  <p className="mt-0.5 text-sm text-muted">{c.message}</p>
                </div>
              </div>
              <Badge tone={c.status === "ok" ? "covered" : c.status === "failed" ? "conflict" : "neutral"}>
                {c.status === "ok" ? "Available" : c.status === "failed" ? "Unavailable" : "Skipped"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="pg-rise grid gap-4 sm:grid-cols-3" style={{ animationDelay: "80ms" }}>
        <div className="pg-card p-5">
          <p className="pg-eyebrow">Comparison model</p>
          <p className="mt-2 text-sm">
            {s.modelId ? `${s.modelId}, executed by Graph8` : "Not recorded. Run the setup script."}
          </p>
        </div>
        <div className="pg-card p-5">
          <p className="pg-eyebrow">Seller domains</p>
          <p className="mt-2 text-sm">
            {s.sellerDomains.length
              ? s.sellerDomains.join(", ")
              : "None configured. Every speaker will be treated as unknown and flagged for review."}
          </p>
        </div>
        <div className="pg-card p-5">
          <p className="pg-eyebrow">Verified assignees</p>
          <p className="mt-2 text-sm">
            {s.assigneeCount
              ? `${s.assigneeCount} Graph8 user(s) available for issue assignment.`
              : "None configured. Issues can still be created unassigned."}
          </p>
        </div>
      </section>
      <p className="text-xs text-muted">Last checked {new Date(s.checkedAt).toLocaleString()}</p>
    </div>
  );
}
