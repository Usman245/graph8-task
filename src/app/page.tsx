import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Arrow, PromiseMock, Shield, Underline } from "@/components/PromiseMock";
import { Badge } from "@/components/ui/Badge";

export const metadata = {
  title: { absolute: "PromiseGuard · Catch promises the quote forgot" },
  description:
    "PromiseGuard compares what sales promised in emails and call transcripts with what the quotation covers, blocks risky sends, and hands agreed promises to delivery with evidence. Built on Graph8.",
};

const STEPS = [
  {
    title: "Pick a deal and its quote",
    body: "Choose the Graph8 quotation you are about to send or hand to delivery. PromiseGuard never picks the quote for you.",
  },
  {
    title: "Add the sales conversations",
    body: "Select the emails and meeting transcripts where promises were made. Only sources whose participants match a deal contact are suggested.",
  },
  {
    title: "Graph8 AI compares them",
    body: "Every seller commitment is checked against the quote, with the exact excerpt from both sides as evidence.",
  },
  {
    title: "Fix, send, and deliver",
    body: "Resolve each gap, send through the Quote Guard gate, then hand agreed promises to an owner with a deadline.",
  },
];

const COVERAGE = [
  { tone: "covered", label: "Covered", body: "A clause in the quote supports the promise." },
  { tone: "missing", label: "Missing", body: "Sales promised it, but nothing in the quote covers it." },
  { tone: "conflict", label: "Conflict", body: "The quote says something different from what was promised." },
  { tone: "review", label: "Needs review", body: "The evidence is unclear, so a person decides." },
] as const;

const FEATURES = [
  {
    title: "Evidence beside every decision",
    body: "Each finding shows what the seller said and what the quote says, side by side, with speaker, source, and date.",
    icon: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2v-7Z",
  },
  {
    title: "Quote Guard send gate",
    body: "Created or edited quotes are reviewed automatically. Sending stays blocked while promise risks are open, and an override needs a written reason.",
    icon: "M8 1.8 3 3.6v3.7c0 3 2.1 5.4 5 6.5 2.9-1.1 5-3.5 5-6.5V3.6L8 1.8Z",
  },
  {
    title: "Promise feasibility",
    body: "Flags guarantees, vague success metrics, open-ended scope, dependencies, timing, and unpriced work, and suggests safer measurable wording.",
    icon: "M8 2v12M2 8h12M4 4l8 8M12 4l-8 8",
  },
  {
    title: "Fix it in one place",
    body: "Put the promise into the quote terms, or draft a clarification for the buyer. Both are saved in Graph8 for the rep to act on.",
    icon: "m10.5 2.5 3 3-8 8H2.5v-3l8-8Z",
  },
  {
    title: "Promise Handoff",
    body: "Carry agreed promises into delivery with an owner, a target date, the conditions, and the original evidence.",
    icon: "M2 8h9m-3-3.5L11.5 8 8 11.5M13.5 3v10",
  },
  {
    title: "State stays in Graph8",
    body: "Reviews, issues, notes, and delivery tasks are real Graph8 records, so nothing is lost when a tab closes or a server restarts.",
    icon: "M3 4.5C3 3.4 5.2 2.5 8 2.5s5 .9 5 2S10.8 6.5 8 6.5 3 5.6 3 4.5Zm0 0v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2",
  },
];

const AUDIENCE = [
  { role: "Sales reps", body: "Send quotes knowing every promise you made is written down, or deliberately clarified." },
  { role: "Account managers", body: "See the gap between the conversation and the contract before it becomes a client dispute." },
  { role: "Delivery leads", body: "Receive promises with an owner, a date, and the exact words the customer heard." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="PromiseGuard home">
            <Logo />
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#how" className="transition hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="transition hover:text-foreground">
              Features
            </a>
            <a href="#who" className="transition hover:text-foreground">
              Who it&apos;s for
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-foreground">
              Sign in
            </Link>
            <Link
              href="/deals"
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary"
            >
              Open workspace
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(700px 360px at 85% 10%, var(--primary-soft), transparent 70%), radial-gradient(520px 300px at 5% 90%, var(--missing-soft), transparent 70%)",
            }}
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div className="pg-rise">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-conflict" />
                Promise gap detection for Graph8
              </p>
              <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
                Catch promises
                <br />
                the quote <span className="relative whitespace-nowrap text-primary">forgot<Underline /></span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Sales promised to run the bakery&apos;s TikTok too, but the quote leaves TikTok out. PromiseGuard compares what was said in emails
                and calls with what the quotation covers, and stops the gap before it becomes a client dispute.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/deals"
                  className="group inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(28,29,31,.6)] transition hover:-translate-y-px hover:bg-primary"
                >
                  Try the demo
                  <Arrow className="transition group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center rounded-lg border border-border bg-surface px-5 py-3 text-sm font-semibold shadow-sm transition hover:border-foreground/20"
                >
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-xs text-muted">Demo mode uses a clearly labeled sample conversation with real Graph8 deals and quotes.</p>
            </div>
            <PromiseMock />
          </div>
        </section>

        <section aria-label="The problem" className="border-y border-border bg-foreground text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
            {[
              ["Promises live in conversations", "Emails, calls, and meeting transcripts, spread across the deal."],
              ["Scope lives in the quote", "Line items and terms, written later and often by someone else."],
              ["Disputes live in the gap", "Found at delivery, when the customer asks where the thing they were promised is."],
            ].map(([t, b], i) => (
              <div key={t} className="pg-rise" style={{ animationDelay: `${i * 80}ms` }}>
                <p className="font-mono text-xs text-white/50">0{i + 1}</p>
                <p className="mt-2 text-xl font-semibold tracking-tight">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <p className="pg-eyebrow">How it works</p>
          <h2 id="how-h" className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            From conversation to quote to delivery, with the evidence attached.
          </h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground font-mono text-xs text-white">{i + 1}</span>
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
                <p className="mt-4 font-semibold">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="verdict-h" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div>
              <p className="pg-eyebrow">Four clear verdicts</p>
              <h2 id="verdict-h" className="mt-2 text-3xl font-semibold tracking-tight">Every promise gets a verdict, never a colour alone.</h2>
              <p className="mt-4 text-muted">
                Each seller commitment is labeled and backed by quotes from both sides. Buyer requests are kept separate from what the seller actually
                agreed to, and conditions like &ldquo;once assets arrive&rdquo; are preserved.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {COVERAGE.map((c) => (
                <li key={c.label} className="rounded-2xl border border-border bg-background p-5">
                  <Badge tone={c.tone}>{c.label}</Badge>
                  <p className="mt-3 text-sm leading-relaxed">{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" aria-labelledby="features-h" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <p className="pg-eyebrow">Features</p>
          <h2 id="features-h" className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for the moment before a quote goes out.
          </h2>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="pg-card p-6 transition hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_rgba(36,83,199,.45)]">
                <span aria-hidden className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d={f.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="mt-4 font-semibold">{f.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="who" aria-labelledby="who-h" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="pg-eyebrow">Who it&apos;s for</p>
            <h2 id="who-h" className="mt-2 text-3xl font-semibold tracking-tight">Everyone who touches the deal after the handshake.</h2>
            <ul className="mt-10 grid gap-6 md:grid-cols-3">
              {AUDIENCE.map((a) => (
                <li key={a.role} className="border-l-2 border-primary pl-5">
                  <p className="font-semibold">{a.role}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-14 text-white sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "radial-gradient(520px 300px at 95% 0%, rgba(36,83,199,.55), transparent 70%), radial-gradient(420px 260px at 0% 100%, rgba(154,91,0,.4), transparent 70%)",
              }}
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">See the Bloom Bakery gap for yourself.</h2>
                <p className="mt-4 max-w-xl text-white/70">
                  Open the demo workspace, pick the sample deal, and watch PromiseGuard find the TikTok promise the quote left out.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/deals"
                    className="group inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-px"
                  >
                    Open the workspace
                    <Arrow className="transition group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
              <div className="flex gap-3 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-white/75">
                <span className="text-white">
                  <Shield />
                </span>
                <p>
                  Decision support only. PromiseGuard shows the evidence and suggests actions; it is not a determination of contractual liability, and
                  a person makes every final call.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted">
          <Logo className="text-foreground" />
          <p>Built on Graph8 CRM, AI, and storage.</p>
          <Link href="/login" className="pg-link">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
