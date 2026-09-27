const QUOTE_LINES = [
  { label: "Website redesign", covered: true },
  { label: "Instagram content, 12 posts/mo", covered: true },
  { label: "TikTok management", covered: false },
];

/** Decorative "said vs. quoted" illustration of the bakery example. */
export function PromiseMock() {
  return (
    <div aria-hidden className="pg-rise relative mx-auto w-full max-w-md select-none" style={{ animationDelay: "120ms" }}>
      <div className="rotate-[-1.5deg] rounded-xl border border-border bg-surface p-4 shadow-[0_20px_40px_-24px_rgba(28,29,31,.35)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Sales call · transcript</p>
        <p className="mt-2 text-sm leading-relaxed">
          &ldquo;…and don&apos;t worry, we&apos;ll{" "}
          <mark className="rounded bg-missing-soft px-1 text-missing">run your TikTok too</mark>, same as Instagram.&rdquo;
        </p>
      </div>

      <div className="relative -mt-2 ml-8 rotate-[1deg] rounded-xl border border-border bg-surface p-4 shadow-[0_24px_48px_-24px_rgba(28,29,31,.4)]">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Quote · Bloom Bakery</p>
          <span className="rounded-full bg-conflict-soft px-2 py-0.5 text-[11px] font-semibold text-conflict">1 gap found</span>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {QUOTE_LINES.map((l) => (
            <li
              key={l.label}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${l.covered ? "" : "border border-dashed border-conflict/50 bg-conflict-soft/60"}`}
            >
              <span
                className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
                  l.covered ? "bg-covered-soft text-covered" : "bg-conflict text-white"
                }`}
              >
                {l.covered ? "✓" : "!"}
              </span>
              <span className={l.covered ? "" : "font-medium text-conflict"}>{l.label}</span>
              {!l.covered && <span className="ml-auto text-[11px] text-conflict">not in quote</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Underline() {
  return (
    <svg aria-hidden viewBox="0 0 120 12" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-2.5 w-full text-missing">
      <path d="M2 8 C 30 2, 60 11, 118 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shield() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 1.5 2.5 3.5v4c0 3.3 2.4 5.9 5.5 7 3.1-1.1 5.5-3.7 5.5-7v-4L8 1.5Z" strokeLinejoin="round" />
      <path d="m5.5 8 1.8 1.8L10.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
