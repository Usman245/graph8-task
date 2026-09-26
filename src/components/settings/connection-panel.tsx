"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    return <div className="h-40 animate-pulse rounded-lg bg-surface-muted" aria-label="Loading connection status" />;
  }
  if (query.isError) {
    return (
      <div role="alert" className="rounded-lg border border-conflict/30 bg-conflict-soft p-4 text-sm text-conflict">
        Could not load connection status: {query.error.message}{" "}
        <button className="underline" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const s = query.data;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
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
            <li key={c.id + c.label} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-sm text-muted">{c.message}</p>
              </div>
              <Badge tone={c.status === "ok" ? "covered" : c.status === "failed" ? "conflict" : "neutral"}>
                {c.status === "ok" ? "Available" : c.status === "failed" ? "Unavailable" : "Skipped"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">Comparison model</p>
          <p className="mt-1 text-sm text-muted">
            {s.modelId ? `${s.modelId}, executed by Graph8` : "Not recorded. Run the setup script."}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">Seller domains</p>
          <p className="mt-1 text-sm text-muted">
            {s.sellerDomains.length
              ? s.sellerDomains.join(", ")
              : "None configured. Every speaker will be treated as unknown and flagged for review."}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">Verified assignees</p>
          <p className="mt-1 text-sm text-muted">
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
