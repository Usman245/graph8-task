import Link from "next/link";
import { DealList } from "@/components/deals/deal-list";
import { Arrow, PromiseMock, Shield, Underline } from "@/components/promise-mock";
import { SampleBadge } from "@/components/status";
import { findExampleReview } from "@/lib/promiseguard/example";
import { currentMode } from "@/lib/promiseguard/mode";

export const metadata = { title: "Deals", description: "Pick a Graph8 deal and check the promises sales made against its quotation." };

const STEPS = [
  { title: "Pick a deal and its quote", body: "Choose the quotation you are about to send or hand to delivery." },
  { title: "Add the sales conversations", body: "Select the emails, call transcripts, or sample conversations where promises were made." },
  { title: "Graph8 AI compares them", body: "Each promise is checked against the quote with exact quotes as evidence, then saved as Graph8 tasks." },
];

const GUARD_NOTE =
  "Quote Guard does this automatically: every created or edited quote is reviewed, and sending stays blocked while promise risks are open.";

export default async function DealsPage() {
  const [mode, exampleReviewId] = await Promise.all([currentMode(), findExampleReview()]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section
        aria-labelledby="intro-h"
        className="pg-rise relative overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(600px 260px at 100% 0%, var(--primary-soft), transparent 70%), radial-gradient(420px 220px at 0% 100%, var(--missing-soft), transparent 70%)",
          }}
        />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-conflict" />
              Promise gap detection
            </p>
            <h1 id="intro-h" className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Catch promises
              <br />
              the quote <span className="relative whitespace-nowrap text-primary">forgot<Underline /></span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              Sales promised to run the bakery&apos;s TikTok too, but the quote leaves TikTok out. PromiseGuard catches gaps like this
              before they become client disputes.
            </p>

            {exampleReviewId && (
              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
                <Link
                  href={`/reviews/${encodeURIComponent(exampleReviewId)}`}
                  className="group inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(28,29,31,.6)] transition hover:-translate-y-px hover:bg-primary"
                >
                  See the Bloom Bakery example
                  <Arrow className="transition group-hover:translate-x-0.5" />
                </Link>
                <span className="flex max-w-xs flex-wrap items-center gap-2 text-xs leading-snug text-muted">
                  <SampleBadge />
                  A completed review saved in Graph8. Its sales conversation is synthetic sample data.
                </span>
              </div>
            )}
          </div>

          <PromiseMock />
        </div>

        {/* Steps */}
        <div className="relative border-t border-border bg-background/60 px-6 py-8 sm:px-10">
          <ol className="grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="pg-rise relative" style={{ animationDelay: `${150 + i * 90}ms` }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-primary">0{i + 1}</span>
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
                <p className="mt-3 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/15 bg-primary-soft/60 px-4 py-3 text-sm text-foreground/80">
            <Shield />
            {GUARD_NOTE}
            <Link href="/guard" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Open Quote Guard <Arrow />
            </Link>
          </p>
        </div>
      </section>

      {/* Deals */}
      <section aria-labelledby="deals-h" className="pg-rise space-y-5" style={{ animationDelay: "250ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="deals-h" className="text-2xl font-semibold tracking-tight">
              Deals
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {mode === "demo"
                ? "Demo mode shows only [PromiseGuard Demo] deals stored in Graph8. Their conversation evidence is a labeled sample."
                : "Live mode shows real deals from your Graph8 workspace. Pick one to check its quotation against sales conversations."}
            </p>
          </div>
        </div>
        <DealList mode={mode} />
      </section>
    </div>
  );
}
