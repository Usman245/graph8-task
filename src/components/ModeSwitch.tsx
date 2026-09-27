"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client-fetch";
import type { Mode } from "@/lib/promiseguard/schemas";

const OPTIONS: Array<{ value: Mode; label: string; hint: string }> = [
  { value: "demo", label: "Demo", hint: "Sample conversation with a [PromiseGuard Demo] deal and quote in Graph8" },
  { value: "live", label: "Live", hint: "Real Graph8 deals, quotes, emails, and meeting transcripts" },
];

export function ModeSwitch({ mode, demoEnabled }: { mode: Mode; demoEnabled: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  async function select(next: Mode) {
    if (next === mode || pending) return;
    setPending(true);
    try {
      await api("/api/mode", { method: "POST", body: JSON.stringify({ mode: next }) });
      qc.clear();
      router.push("/deals");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div role="radiogroup" aria-label="Data mode" className="flex rounded-xl border border-border bg-surface-muted p-1 text-sm">
      {OPTIONS.map((o) => {
        const active = o.value === mode;
        const disabled = pending || (o.value === "demo" && !demoEnabled);
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            disabled={disabled}
            onClick={() => select(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium transition disabled:cursor-not-allowed ${
              active
                ? o.value === "demo"
                  ? "bg-surface text-missing shadow-sm"
                  : "bg-surface text-primary shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${active ? (o.value === "demo" ? "bg-missing" : "bg-primary") : "bg-muted/40"}`}
            />
            {o.label} mode
          </button>
        );
      })}
    </div>
  );
}
