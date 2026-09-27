"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api/client-fetch";

/** Shown on the login page so demo reviewers can sign in. Must match PROMISEGUARD_APP_PASSWORD. */
const DEMO_PASSWORD = "test123";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      router.replace("/deals");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="pg-card mt-8 space-y-4 p-6">
      <div className="space-y-1.5">
        <label htmlFor="password" className="pg-label">
          Workspace password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="pg-field mt-1.5 py-2.5"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-conflict-soft px-3 py-2 text-sm text-conflict">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !password} className="w-full py-2.5">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-missing/40 bg-missing-soft px-3.5 py-3 text-sm text-missing">
        <p>
          <span className="font-semibold">Demo access:</span> password is{" "}
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-foreground">{DEMO_PASSWORD}</code>
        </p>
        <button
          type="button"
          onClick={() => {
            setPassword(DEMO_PASSWORD);
            setError(null);
          }}
          className="font-semibold underline underline-offset-4 hover:text-foreground"
        >
          Use it
        </button>
      </div>
    </form>
  );
}
