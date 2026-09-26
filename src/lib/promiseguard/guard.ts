import "server-only";
import { after } from "next/server";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { getDeal, type Deal } from "@/lib/graph8/adapters/deals";
import { createDealNote } from "@/lib/graph8/adapters/notes";
import {
  TERMINAL_QUOTE_STATUSES,
  getQuote,
  listRecentQuotes,
  previewQuoteSend,
  sendQuote,
  type QuoteRecord,
} from "@/lib/graph8/adapters/quotes";
import { createTask } from "@/lib/graph8/adapters/tasks";
import { listWebhooks } from "@/lib/graph8/adapters/webhooks";
import { Graph8Error } from "@/lib/graph8/errors";
import { GATE_LABEL, openFindings, type GateState } from "./gate-rules";
import { sha256 } from "./hash";
import { withLock } from "./lock";
import { DEMO_TITLE_PREFIX, REVIEW_TAG, REVIEW_TITLE_PREFIX } from "./manifest";
import { isDemoDeal } from "./mode";
import { PROMISEGUARD_NOTE_PREFIX, quoteToDocument } from "./normalize";
import { listReviewSummaries, loadReview, type ReviewSummary } from "./repository";
import { finalizeReview, startReview } from "./runs";
import { refKey, type Coverage, type Mode, type SummaryCounts } from "./schemas";
import { findSourceCandidates } from "./sources";

// Quote Guard: reviews quotes automatically when they are created or edited (Graph8 webhook or a manual
// scan), gates the send on the latest review, and alerts on quotes sent with open promise gaps.
// Single-instance state (timers, activity log) lives on globalThis so it survives dev hot reloads.

type Store = {
  timers: Map<string, ReturnType<typeof setTimeout>>;
  watching: Set<string>;
  activity: AutopilotEvent[];
};
const store: Store = ((globalThis as { __promiseguardGuard?: Store }).__promiseguardGuard ??= {
  timers: new Map(),
  watching: new Set(),
  activity: [],
});

export type AutopilotEvent = {
  at: string;
  quoteId: string;
  quoteLabel: string | null;
  trigger: "webhook" | "scan" | "manual" | "send";
  event: string;
  outcome: string;
  reviewTaskId: string | null;
};

function record(e: Omit<AutopilotEvent, "at">) {
  store.activity.unshift({ ...e, at: new Date().toISOString() });
  store.activity.length = Math.min(store.activity.length, 40);
  console.info(`[promiseguard] ${e.trigger} ${e.event} quote=${e.quoteId} -> ${e.outcome}`);
}

const ACTIVE_RUN = new Set(["preparing", "running", "start_unknown"]);

/** UUID-shaped (version 8) ID derived from a seed, so the same quote version and sources map to one review. */
export function deterministicId(seed: string): string {
  const h = sha256(seed);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const modeForDeal = (deal: Pick<Deal, "name">): Mode => (isDemoDeal(deal) ? "demo" : "live");
const isTerminal = (q: QuoteRecord) => TERMINAL_QUOTE_STATUSES.includes((q.status ?? "").toLowerCase());

// ---------------------------------------------------------------------------------------------
// Gate

export type QuoteGate = {
  state: GateState;
  label: string;
  reasons: string[];
  reviewTaskId: string | null;
  open: number;
  counts: SummaryCounts | null;
  reviewedAt: string | null;
};

/** Evaluate one quote against the reviews already loaded for its deal (newest first). */
export function evaluateGate(quote: QuoteRecord, currentHash: string, reviews: ReviewSummary[]): QuoteGate {
  const make = (state: GateState, reasons: string[], r: ReviewSummary | null = null): QuoteGate => ({
    state,
    label: GATE_LABEL[state],
    reasons,
    reviewTaskId: r?.taskId ?? null,
    open: r?.open ?? 0,
    counts: r?.counts ?? null,
    reviewedAt: r?.createdAt ?? null,
  });
  if (isTerminal(quote)) return make("closed", [`The quote is ${quote.status}.`]);
  if (!quote.dealId) return make("not_linked", ["Link the quote to a deal in Graph8 so its conversations can be checked."]);
  const forQuote = reviews.filter((r) => r.quoteId === quote.id);
  const latest = forQuote[0] ?? null;
  if (!latest) return make("no_review", ["No PromiseGuard review exists for this quote yet."]);
  if (latest.runState && ACTIVE_RUN.has(latest.runState)) return make("reviewing", ["Graph8 is comparing the quote with the conversations."], latest);
  // The newest completed review of exactly this quote version decides (a reverted quote reuses its earlier review).
  const current = forQuote.find((r) => !r.readOnly && r.runState === "completed" && r.quoteHash === currentHash);
  if (!current) {
    if (latest.readOnly) return make("failed", ["The latest review was saved in a format this app cannot read."], latest);
    if (latest.runState !== "completed") return make("failed", [latest.runError ?? "The latest review did not complete."], latest);
    return make("changed", ["The quote text changed after the latest review. Review it again."], latest);
  }
  if ((current.open ?? 0) > 0) {
    return make("at_risk", [`${current.open} promise gap(s) are still open: conflicts, missing items, or items needing review.`], current);
  }
  const notes = current.coverageComplete === false ? ["Coverage was incomplete (see the review's limitations)."] : [];
  return make("clear", notes, current);
}

export type OpenItem = { findingId: string; commitment: string; coverage: Coverage };

export type QuoteGateDetail = {
  quoteId: string;
  quoteLabel: string;
  quoteStatus: string | null;
  signerEmail: string | null;
  dealId: string | null;
  dealName: string | null;
  mode: Mode | null;
  gate: QuoteGate;
  openItems: OpenItem[];
};

export async function quoteGateDetail(quoteId: string): Promise<QuoteGateDetail> {
  const quote = await getQuote(quoteId);
  const doc = quoteToDocument(quote, env().PROMISEGUARD_MAX_QUOTE_CHARS);
  const deal = quote.dealId ? await getDeal(quote.dealId) : null;
  const reviews = deal ? (await listReviewSummaries(deal.id)).items : [];
  const gate = evaluateGate(quote, doc.versionHash, reviews);
  let openItems: OpenItem[] = [];
  if (gate.state === "at_risk" && gate.reviewTaskId) {
    const r = await loadReview(gate.reviewTaskId);
    openItems = r.manifest ? openFindings(r.manifest).map((f) => ({ findingId: f.id, commitment: f.commitment, coverage: f.coverage })) : [];
  }
  if (gate.state === "reviewing" && gate.reviewTaskId) watchReview(gate.reviewTaskId);
  return {
    quoteId: quote.id,
    quoteLabel: doc.label,
    quoteStatus: quote.status,
    signerEmail: quote.signerEmail,
    dealId: deal?.id ?? null,
    dealName: deal?.name ?? null,
    mode: deal ? modeForDeal(deal) : null,
    gate,
    openItems,
  };
}

// ---------------------------------------------------------------------------------------------
// Automatic review

export type AutoResult = {
  quoteId: string;
  quoteLabel: string | null;
  outcome: "started" | "up_to_date" | "skipped";
  reviewTaskId: string | null;
  reason: string | null;
};

/**
 * Review a quote against every readable conversation of its deal. The request ID is derived from the quote
 * version and source set, so repeated events for an unchanged quote reuse the same review instead of
 * spending AI credits again. A manual trigger retries a failed review with a fresh request ID.
 */
export async function autoReviewQuote(quoteId: string, trigger: AutopilotEvent["trigger"]): Promise<AutoResult> {
  return withLock(`quote:${quoteId}`, async () => {
    const e = env();
    const skip = (reason: string, label: string | null = null): AutoResult => ({ quoteId, quoteLabel: label, outcome: "skipped", reviewTaskId: null, reason });
    if (!e.GRAPH8_WORKFLOW_ID) return skip("The comparison workflow is not configured.");

    const quote = await getQuote(quoteId);
    const doc = quoteToDocument(quote, e.PROMISEGUARD_MAX_QUOTE_CHARS);
    if (isTerminal(quote)) return skip(`The quote is ${quote.status}.`, doc.label);
    if (!quote.dealId) return skip("The quote is not linked to a deal.", doc.label);
    if (doc.parts.length === 0) return skip("The quote has no scope text or line-item descriptions yet.", doc.label);

    const deal = await getDeal(quote.dealId);
    const mode = modeForDeal(deal);
    if (mode === "demo" && !e.PROMISEGUARD_DEMO_ENABLED) return skip("Demo mode is disabled on this server.", doc.label);

    const scan = await findSourceCandidates(deal, mode);
    const refs = scan.candidates.filter((c) => c.textAvailable).slice(0, e.PROMISEGUARD_MAX_SOURCES).map((c) => c.ref);
    if (!refs.length) {
      return skip(
        mode === "demo" ? "No sample conversation matches this deal." : "No emails, meetings, deal notes, or deal memory were found for this deal.",
        doc.label,
      );
    }

    const forQuote = (await listReviewSummaries(deal.id)).items.filter((r) => r.quoteId === quote.id);
    const latest = forQuote[0] ?? null;
    const keys = refs.map(refKey).sort().join("|");
    // Same quote version and same sources: reuse a completed or running review instead of spending credits.
    const reusable = forQuote.find(
      (r) => r.quoteHash === doc.versionHash && r.sourceKeys.join("|") === keys && (r.runState === "completed" || ACTIVE_RUN.has(r.runState ?? "")),
    );
    if (reusable) {
      if (ACTIVE_RUN.has(reusable.runState ?? "")) watchReview(reusable.taskId);
      return { quoteId, quoteLabel: doc.label, outcome: "up_to_date", reviewTaskId: reusable.taskId, reason: "This quote version was already reviewed with the same sources." };
    }
    // A failed review of the same input is retried only on a manual request, never by the webhook or a scan.
    const failedSame = forQuote.find((r) => r.quoteHash === doc.versionHash && r.sourceKeys.join("|") === keys);
    if (failedSame && trigger !== "manual") {
      return { quoteId, quoteLabel: doc.label, outcome: "skipped", reviewTaskId: failedSame.taskId, reason: "The last review of this quote version failed. Use Review now to retry." };
    }
    const retryFailed = Boolean(failedSame);

    // Drop the oldest sources if the selection is too long for one review.
    let attempt = refs;
    for (;;) {
      const seed = `auto|${quote.id}|${doc.versionHash}|${attempt.map(refKey).sort().join("|")}`;
      try {
        const res = await startReview({
          dealId: deal.id,
          quoteId: quote.id,
          sourceRefs: attempt,
          matchConfirmed: false,
          requestId: retryFailed ? crypto.randomUUID() : deterministicId(seed),
          mode,
          previousReviewTaskId: latest?.taskId ?? null,
        });
        watchReview(res.reviewTaskId);
        return { quoteId, quoteLabel: doc.label, outcome: res.recovered ? "up_to_date" : "started", reviewTaskId: res.reviewTaskId, reason: null };
      } catch (err) {
        if (err instanceof AppRequestError && err.code === "sources_too_large" && attempt.length > 1) {
          attempt = attempt.slice(0, -1);
          continue;
        }
        throw err;
      }
    }
  });
}

/** Run an automatic review and record it in the activity log; never throws. */
export async function runAutoReview(quoteId: string, trigger: AutopilotEvent["trigger"], event: string): Promise<AutoResult> {
  try {
    const r = await autoReviewQuote(quoteId, trigger);
    record({
      quoteId,
      quoteLabel: r.quoteLabel,
      trigger,
      event,
      outcome: r.outcome === "started" ? "Review started" : r.outcome === "up_to_date" ? "Already reviewed" : `Skipped: ${r.reason}`,
      reviewTaskId: r.reviewTaskId,
    });
    return r;
  } catch (err) {
    const reason = err instanceof Graph8Error || err instanceof AppRequestError ? err.message : "Unexpected error.";
    if (!(err instanceof Graph8Error || err instanceof AppRequestError)) console.error("[promiseguard] autopilot failure", err instanceof Error ? err.name : typeof err);
    record({ quoteId, quoteLabel: null, trigger, event, outcome: `Failed: ${reason}`, reviewTaskId: null });
    return { quoteId, quoteLabel: null, outcome: "skipped", reviewTaskId: null, reason };
  }
}

/** Debounce bursts of quote edits into one review after a quiet period. */
export function enqueueAutoReview(quoteId: string, event: string) {
  const existing = store.timers.get(quoteId);
  if (existing) clearTimeout(existing);
  const delay = env().PROMISEGUARD_AUTOPILOT_DELAY_SECONDS * 1000;
  store.timers.set(
    quoteId,
    setTimeout(() => {
      store.timers.delete(quoteId);
      void runAutoReview(quoteId, "webhook", event);
    }, delay),
  );
  record({ quoteId, quoteLabel: null, trigger: "webhook", event, outcome: `Queued (review starts after ${delay / 1000}s without further edits)`, reviewTaskId: null });
}

/** Finalize a review on the server while nobody has its page open. Idempotent; one watcher per review. */
export function watchReview(reviewTaskId: string) {
  if (store.watching.has(reviewTaskId)) return;
  store.watching.add(reviewTaskId);
  const run = async () => {
    try {
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, i < 10 ? 3000 : 8000));
        const res = await finalizeReview(reviewTaskId).catch(() => null);
        if (res && !ACTIVE_RUN.has(res.state)) return;
      }
    } finally {
      store.watching.delete(reviewTaskId);
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (e.g. a debounced webhook timer): run detached on this long-lived server.
    void run();
  }
}

// ---------------------------------------------------------------------------------------------
// Quote sent without a clean review

export async function alertIfSentWithGaps(quoteId: string): Promise<void> {
  try {
    const d = await quoteGateDetail(quoteId);
    if (!d.dealId || d.gate.state === "clear" || d.gate.state === "closed") {
      record({ quoteId, quoteLabel: d.quoteLabel, trigger: "webhook", event: "quote.sent", outcome: `Sent. Gate: ${d.gate.label}`, reviewTaskId: d.gate.reviewTaskId });
      return;
    }
    const prefix = d.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
    const lines = [
      `The quote "${d.quoteLabel}" was sent while PromiseGuard's gate showed: ${d.gate.label}.`,
      ...d.gate.reasons,
      ...d.openItems.map((i) => `- ${i.coverage.replace("_", " ")}: ${i.commitment}`),
      d.gate.reviewTaskId ? `Latest review task: ${d.gate.reviewTaskId}` : "",
      "Decision support only; not a determination of contractual liability.",
    ].filter(Boolean);
    const task = await createTask(
      {
        title: `${prefix} Quote sent with open promise gaps: ${d.quoteLabel.replace(/^\[PromiseGuard Demo\]\s*/, "")}`.slice(0, 250),
        description: lines.join("\n"),
        entity_type: "deal",
        entity_id: d.dealId,
        priority: 1,
        tags: [REVIEW_TAG, "promiseguard-alert", ...(d.mode === "demo" ? ["promiseguard-demo"] : [])],
      },
      deterministicId(`sent-alert|${quoteId}|${d.gate.reviewTaskId ?? "none"}|${d.gate.state}`),
    );
    record({ quoteId, quoteLabel: d.quoteLabel, trigger: "webhook", event: "quote.sent", outcome: `Alert task created (${d.gate.label})`, reviewTaskId: task.id });
  } catch (err) {
    record({ quoteId, quoteLabel: null, trigger: "webhook", event: "quote.sent", outcome: `Alert failed: ${err instanceof Error ? err.message : "error"}`, reviewTaskId: null });
  }
}

// ---------------------------------------------------------------------------------------------
// Guarded send

export type SendResult = {
  mode: Mode;
  sent: boolean;
  /** Demo mode renders the send through Graph8's send-preview; nothing reaches the buyer. */
  preview: { subject: string | null; recipient: string | null } | null;
  status: string | null;
  overrideNoteId: string | null;
};

export async function guardedSend(
  quoteId: string,
  uiMode: Mode,
  input: { overrideReason?: string; message?: string },
): Promise<SendResult> {
  return withLock(`quote:${quoteId}`, async () => {
    const d = await quoteGateDetail(quoteId);
    if (!d.dealId || !d.mode) throw new AppRequestError("quote_not_linked", "Only quotes linked to a deal can be sent through PromiseGuard.", 409);
    if (d.mode !== uiMode) {
      throw new AppRequestError("mode_mismatch", d.mode === "demo" ? "This is a demo quote. Switch to Demo mode." : "This is a real quote. Switch to Live mode.", 409);
    }
    if (d.gate.state === "closed") throw new AppRequestError("quote_closed", d.gate.reasons[0] ?? "The quote is closed.", 409);

    const override = input.overrideReason?.trim() ?? "";
    if (d.gate.state !== "clear" && override.length < 10) {
      throw new AppRequestError("send_blocked", `Quote Guard blocked the send: ${d.gate.label}. ${d.gate.reasons.join(" ")}`, 409);
    }
    if (!d.signerEmail) throw new AppRequestError("no_signer", "The quote has no signer. Set a signer on the quote in Graph8 first.", 422);

    let overrideNoteId: string | null = null;
    if (d.gate.state !== "clear") {
      const note = await createDealNote(
        d.dealId,
        [
          `${PROMISEGUARD_NOTE_PREFIX} Quote "${d.quoteLabel}" ${d.mode === "demo" ? "send preview requested" : "sent"} with the gate overridden.`,
          `Gate: ${d.gate.label}. ${d.gate.reasons.join(" ")}`,
          ...d.openItems.map((i) => `- ${i.coverage.replace("_", " ")}: ${i.commitment}`),
          `Reason given: ${override}`,
        ].join("\n"),
      );
      overrideNoteId = note.id;
    }

    const body = input.message?.trim() ? { message: input.message.trim() } : {};
    if (d.mode === "demo") {
      const preview = await previewQuoteSend(quoteId, body);
      const pick = (...keys: string[]) => keys.map((k) => preview[k]).find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
      record({ quoteId, quoteLabel: d.quoteLabel, trigger: "send", event: "guarded send", outcome: "Demo: Graph8 rendered the send preview (nothing sent)", reviewTaskId: d.gate.reviewTaskId });
      return {
        mode: "demo",
        sent: false,
        preview: { subject: pick("subject", "email_subject"), recipient: pick("recipient_email", "to", "recipient") ?? d.signerEmail },
        status: d.quoteStatus,
        overrideNoteId,
      };
    }
    const res = await sendQuote(quoteId, body);
    record({ quoteId, quoteLabel: d.quoteLabel, trigger: "send", event: "guarded send", outcome: `Sent through Graph8 (${res.status ?? "sent"})`, reviewTaskId: d.gate.reviewTaskId });
    return { mode: "live", sent: true, preview: null, status: res.status, overrideNoteId };
  });
}

// ---------------------------------------------------------------------------------------------
// Board

export type GuardRow = {
  quoteId: string;
  quoteLabel: string;
  quoteStatus: string | null;
  totalMinor: number | null;
  currency: string | null;
  updatedAt: string | null;
  dealId: string | null;
  dealName: string | null;
  gate: QuoteGate;
};

export type GuardBoard = {
  mode: Mode;
  rows: GuardRow[];
  errors: string[];
  autopilot: {
    webhookUrlConfigured: boolean;
    webhookRegistered: boolean | null;
    webhookEvents: string[];
    delaySeconds: number;
    activity: AutopilotEvent[];
  };
};

export const WEBHOOK_EVENTS = ["quote.created", "quote.updated", "quote.sent"];
export const WEBHOOK_PATH = "/api/webhooks/graph8";

export async function guardBoard(mode: Mode): Promise<GuardBoard> {
  const e = env();
  const errors: string[] = [];
  const quotes = await listRecentQuotes(50);

  const dealIds = [...new Set(quotes.map((q) => q.dealId).filter((id): id is string => Boolean(id)))];
  const deals = new Map<string, Deal>();
  await Promise.all(
    dealIds.map(async (id) => {
      try {
        deals.set(id, await getDeal(id));
      } catch (err) {
        if (!(err instanceof Graph8Error)) throw err;
        errors.push(`Deal ${id.slice(0, 8)} could not be read: ${err.message}`);
      }
    }),
  );
  const inMode = (q: QuoteRecord) => {
    const deal = q.dealId ? deals.get(q.dealId) : null;
    if (deal) return modeForDeal(deal) === mode;
    // Unlinked quotes have no deal to classify them; the demo prefix on the title decides.
    return (q.title ?? "").startsWith(DEMO_TITLE_PREFIX) === (mode === "demo");
  };
  const selected = quotes.filter(inMode);

  const reviewsByDeal = new Map<string, ReviewSummary[]>();
  await Promise.all(
    [...new Set(selected.map((q) => q.dealId).filter((id): id is string => Boolean(id && deals.has(id))))].map(async (id) => {
      try {
        reviewsByDeal.set(id, (await listReviewSummaries(id)).items);
      } catch (err) {
        if (!(err instanceof Graph8Error)) throw err;
        errors.push(`Reviews for deal ${id.slice(0, 8)} could not be read: ${err.message}`);
      }
    }),
  );

  // List rows omit line items, so the content hash comes from the quote detail.
  const rows = await Promise.all(
    selected.map(async (listed): Promise<GuardRow> => {
      const q = await getQuote(listed.id).catch(() => listed);
      const doc = quoteToDocument(q, e.PROMISEGUARD_MAX_QUOTE_CHARS);
      const gate = evaluateGate(q, doc.versionHash, q.dealId ? reviewsByDeal.get(q.dealId) ?? [] : []);
      if (gate.state === "reviewing" && gate.reviewTaskId) watchReview(gate.reviewTaskId);
      return {
        quoteId: q.id,
        quoteLabel: doc.label,
        quoteStatus: q.status,
        totalMinor: q.totalMinor,
        currency: q.currency,
        updatedAt: q.updatedAt,
        dealId: q.dealId,
        dealName: q.dealId ? deals.get(q.dealId)?.name ?? null : null,
        gate,
      };
    }),
  );
  rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  let webhookRegistered: boolean | null = null;
  let webhookEvents: string[] = [];
  try {
    const hook = (await listWebhooks()).find((w) => w.active && w.url.includes(WEBHOOK_PATH));
    webhookRegistered = Boolean(hook);
    webhookEvents = hook?.events ?? [];
  } catch (err) {
    if (!(err instanceof Graph8Error)) throw err;
    errors.push(`Webhook status could not be read: ${err.message}`);
  }

  return {
    mode,
    rows,
    errors,
    autopilot: {
      webhookUrlConfigured: Boolean(e.PROMISEGUARD_PUBLIC_URL && e.PROMISEGUARD_WEBHOOK_TOKEN),
      webhookRegistered,
      webhookEvents,
      delaySeconds: e.PROMISEGUARD_AUTOPILOT_DELAY_SECONDS,
      activity: store.activity.slice(0, 20),
    },
  };
}

/** Quote IDs on the board that an automatic review would act on. */
export const needsReview = (r: GuardRow) => r.gate.state === "no_review" || r.gate.state === "changed";
