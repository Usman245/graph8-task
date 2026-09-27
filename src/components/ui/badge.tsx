type Tone = "neutral" | "covered" | "missing" | "conflict" | "review" | "primary";

const tones: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-surface-muted text-muted ring-border", dot: "bg-muted/60" },
  covered: { chip: "bg-covered-soft text-covered ring-covered/20", dot: "bg-covered" },
  missing: { chip: "bg-missing-soft text-missing ring-missing/20", dot: "bg-missing" },
  conflict: { chip: "bg-conflict-soft text-conflict ring-conflict/20", dot: "bg-conflict" },
  review: { chip: "bg-review-soft text-review ring-review/20", dot: "bg-review" },
  primary: { chip: "bg-primary-soft text-primary ring-primary/20", dot: "bg-primary" },
};

/** Status label that always carries text, never color alone. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  const t = tones[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${t.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}
