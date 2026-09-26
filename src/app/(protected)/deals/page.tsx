import Link from "next/link";
import { DealList } from "@/components/deals/deal-list";
import { SampleBadge } from "@/components/status";
import { findAcmeExampleReview } from "@/lib/promiseguard/example";
import { currentMode } from "@/lib/promiseguard/mode";

export const metadata = { title: "Deals · PromiseGuard" };

const STEPS = [
  { title: "Pick a deal and its quote", body: "Choose the quotation you are about to send or hand to delivery." },
  { title: "Add the sales conversations", body: "Select the emails, call transcripts, or sample conversations where promises were made." },
  { title: "Graph8 AI compares them", body: "Each promise is checked against the quote with exact quotes as evidence, then saved as Graph8 tasks." },
];

const GUARD_NOTE =
  "Quote Guard does this automatically: every created or edited quote is reviewed, and sending stays blocked while promise gaps are open.";

export default async function DealsPage() {
  const [mode, exampleReviewId] = await Promise.all([currentMode(), findAcmeExampleReview()]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="intro-h" className="rounded-xl border border-border bg-surface p-6">
        <h1 id="intro-h" className="text-2xl font-semibold">
          Catch promises the quote forgot
        </h1>
        <p className="mt-2 max-w-2xl text-base">
          Sales promised migration, but the quote excludes it. PromiseGuard catches gaps like this before they become delivery problems.
        </p>

        {exampleReviewId && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/reviews/${encodeURIComponent(exampleReviewId)}`}
              className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              See the Acme example
            </Link>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <SampleBadge />
              A completed review saved in Graph8. Its sales conversation is synthetic sample data.
            </span>
          </div>
        )}

        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg bg-background p-4">
              <p className="text-sm font-semibold">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary">{i + 1}</span>
                {s.title}
              </p>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">
          {GUARD_NOTE}{" "}
          <Link href="/guard" className="font-medium text-primary hover:underline">
            Open Quote Guard
          </Link>
        </p>
      </section>

      <section aria-labelledby="deals-h" className="space-y-4">
        <div>
          <h2 id="deals-h" className="text-xl font-semibold">
            Deals
          </h2>
          <p className="mt-1 text-sm text-muted">
            {mode === "demo"
              ? "Demo mode shows only [PromiseGuard Demo] deals stored in Graph8. Their conversation evidence is a labeled sample."
              : "Live mode shows real deals from your Graph8 workspace. Pick one to check its quotation against sales conversations."}
          </p>
        </div>
        <DealList mode={mode} />
      </section>
    </div>
  );
}
