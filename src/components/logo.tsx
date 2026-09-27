/** PromiseGuard wordmark: a shield with a check. `inverted` is for dark backgrounds. */
export function Logo({ className = "", inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        aria-hidden
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${inverted ? "bg-white text-foreground" : "bg-foreground text-white"}`}
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M8 1.8 3 3.6v3.7c0 3 2.1 5.4 5 6.5 2.9-1.1 5-3.5 5-6.5V3.6L8 1.8Z" strokeLinejoin="round" />
          <path d="m5.7 7.9 1.6 1.6 3-3.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      PromiseGuard
    </span>
  );
}
