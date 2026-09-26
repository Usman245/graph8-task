type Tone = "neutral" | "covered" | "missing" | "conflict" | "review" | "primary";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted",
  covered: "bg-covered-soft text-covered",
  missing: "bg-missing-soft text-missing",
  conflict: "bg-conflict-soft text-conflict",
  review: "bg-review-soft text-review",
  primary: "bg-primary-soft text-primary",
};

/** Status label that always carries text, never color alone. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}
