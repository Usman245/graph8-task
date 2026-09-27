import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  back,
  badges,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: React.ReactNode };
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="pg-rise space-y-3">
      {back && (
        <Link href={back.href} className="group inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground">
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 transition group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13 8H3m4-4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <p className="pg-eyebrow mb-2">{eyebrow}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {description && <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function StepHeading({ n, id, title, aside }: { n: number; id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground font-mono text-xs text-white">{n}</span>
        {title}
      </h2>
      {aside}
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = "neutral",
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "neutral" | "covered" | "missing" | "conflict" | "review" | "primary";
  children?: React.ReactNode;
}) {
  const bar = {
    neutral: "bg-border",
    covered: "bg-covered",
    missing: "bg-missing",
    conflict: "bg-conflict",
    review: "bg-review",
    primary: "bg-primary",
  }[tone];
  return (
    <div className="pg-card relative overflow-hidden p-4 pl-5">
      <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${bar}`} />
      <div className="text-xs font-medium text-muted">{label}</div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {children}
    </div>
  );
}

export function Notice({
  tone = "primary",
  title,
  children,
  className = "",
}: {
  tone?: "primary" | "missing" | "conflict" | "covered";
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = {
    primary: "border-primary/20 bg-primary-soft/70 text-primary",
    missing: "border-missing/25 bg-missing-soft text-missing",
    conflict: "border-conflict/25 bg-conflict-soft text-conflict",
    covered: "border-covered/25 bg-covered-soft text-covered",
  }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border p-3.5 text-sm ${t} ${className}`}>
      <svg aria-hidden viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6">
        {tone === "covered" ? (
          <>
            <circle cx="8" cy="8" r="6.25" />
            <path d="m5.5 8.2 1.7 1.7 3.3-3.4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 7.2v3.6M8 5.2v.1" strokeLinecap="round" />
          </>
        )}
      </svg>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}
