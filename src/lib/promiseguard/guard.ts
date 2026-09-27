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
import {
  discoveryComplete,
  discoveryKeys,
  evidenceFingerprint,
  evidenceReader,
  readSourceHashes,
} from "./freshness";
import { withLock } from "./lock";
import { DEMO_TITLE_PREFIX, REVIEW_TAG, REVIEW_TITLE_PREFIX } from "./manifest";
import { isDemoDeal } from "./mode";
import { PROMISEGUARD_NOTE_PREFIX, quoteToDocument } from "./normalize";
import { PROMPT_VERSION } from "./prompt";
import {
  listReviewSummaries,
  loadReview,
  type ReviewSummary,
} from "./repository";
import { finalizeReview, startReview } from "./runs";
import {
  type Coverage,
  type Mode,
  type RiskLevel,
  type SummaryCounts,
} from "./schemas";

// Quote Guard: automatic quote reviews (Graph8 webhook or scan), the send gate, and alerts for quotes sent with open risks.
// Background work runs in next/server after() with a deadline, so it also works on serverless hosts.

type Store = {
  watching: Set<string>;
  activity: AutopilotEvent[];
};
const store: Store = ((
  globalThis as { __promiseguardGuard2?: Store }
).__promiseguardGuard2 ??= {
  watching: new Set(),
  activity: [],
});

/** Background work must finish inside the route's maxDuration (60s); unfinished reviews finalize on the next view. */
const BACKGROUND_BUDGET_MS = 50_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AutopilotEvent = {
  at: string;
  source?: "graph8" | "server";
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
  console.info(
    `[promiseguard] ${e.trigger} ${e.event} quote=${e.quoteId} -> ${e.outcome}`,
  );
}

const ACTIVE_RUN = new Set(["preparing", "running", "start_unknown"]);

/** UUID-shaped (version 8) ID derived from a seed, so the same quote version and sources map to one review. */
function deterministicId(seed: string): string {
  const h = sha256(seed);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const modeForDeal = (deal: Pick<Deal, "name">): Mode =>
  isDemoDeal(deal) ? "demo" : "live";
const isTerminal = (q: QuoteRecord) =>
  TERMINAL_QUOTE_STATUSES.includes((q.status ?? "").toLowerCase());

export type QuoteGate = {
  state: GateState;
  label: string;
  reasons: string[];
  reviewTaskId: string | null;
  open: number;
  counts: SummaryCounts | null;
  reviewedAt: string | null;
};

function evaluateGate(
  quote: QuoteRecord,
  currentHash: string,
  reviews: ReviewSummary[],
): QuoteGate {
  const make = (
    state: GateState,
    reasons: string[],
    r: ReviewSummary | null = null,
  ): QuoteGate => ({
    state,
    label: GATE_LABEL[state],
    reasons,
    reviewTaskId: r?.taskId ?? null,
    open: r?.open ?? 0,
    counts: r?.counts ?? null,
    reviewedAt: r?.createdAt ?? null,
  });
  if (isTerminal(quote))
    return make("closed", [`The quote is ${quote.status}.`]);
  if (!quote.dealId)
    return make("not_linked", [
      "Link the quote to a deal in Graph8 so its conversations can be checked.",
    ]);
  const forQuote = reviews.filter((r) => r.quoteId === quote.id);
  const latest = forQuote[0] ?? null;
  if (!latest)
    return make("no_review", [
      "No PromiseGuard review exists for this quote yet.",
    ]);
  if (latest.runState && ACTIVE_RUN.has(latest.runState))
    return make(
      "reviewing",
      ["Graph8 is comparing the quote with the conversations."],
      latest,
    );
  // The newest completed review of exactly this quote version decides (a reverted quote reuses its earlier review).
  const current = forQuote.find(
    (r) =>
      !r.readOnly && r.runState === "completed" && r.quoteHash === currentHash,
  );
  if (!current) {
    if (latest.readOnly)
      return make(
        "failed",
        ["The latest review was saved in a format this app cannot read."],
        latest,
      );
    if (latest.runState !== "completed")
      return make(
        "failed",
        [latest.runError ?? "The latest review did not complete."],
        latest,
      );
    return make(
      "changed",
      ["The quote text changed after the latest review. Review it again."],
      latest,
    );
  }
  if ((current.open ?? 0) > 0) {
    return make(
      "at_risk",
      [
        `${current.open} promise risk(s) are still open: coverage gaps, items needing review, or high-risk commitments requiring approval.`,
      ],
      current,
    );
  }
  if (current.coverageComplete !== true || current.open == null) {
    return make(
      "incomplete",
      [
        "Coverage is incomplete or unknown. Recheck the evidence, or explicitly override with a logged reason.",
      ],
      current,
    );
  }
  return make("clear", [], current);
}

/** No green result survives an unreadable, changed, newly added, or removed source. */
async function freshGate(
  quote: QuoteRecord,
  hash: string,
  reviews: ReviewSummary[],
  deal: Deal | null,
  reader?: ReturnType<typeof evidenceReader>,
): Promise<QuoteGate> {
  const gate = evaluateGate(quote, hash, reviews);
  if (
    !deal ||
    !gate.reviewTaskId ||
    !["clear", "at_risk", "incomplete"].includes(gate.state)
  )
    return gate;
  const review = reviews.find((r) => r.taskId === gate.reviewTaskId)!;
  const block = (state: GateState, reason: string): QuoteGate => ({
    ...gate,
    state,
    label: GATE_LABEL[state],
    reasons: [reason, ...gate.reasons],
  });
  if (review.mode !== modeForDeal(deal))
    return block("failed", "The saved review does not match this deal's mode.");
  if (!review.discoveredSourceKeys || review.promptVersion !== PROMPT_VERSION) {
    return block(
      "changed",
      "This review needs a recheck to establish the current evidence baseline.",
    );
  }
  try {
    const current = reader ?? evidenceReader(deal, modeForDeal(deal));
    const scan = await current.scan();
    if (!discoveryComplete(scan))
      return block(
        "incomplete",
        "Some sources could not be discovered or read. Restore access and recheck, or explicitly override.",
      );
    if (!review.sourceRefs.length)
      return block(
        "incomplete",
        "The review has no selected evidence sources.",
      );
    const hashes = await readSourceHashes(current, review.sourceRefs);
    if (
      evidenceFingerprint(
        hash,
        hashes,
        discoveryKeys(scan),
        modeForDeal(deal),
      ) !==
      evidenceFingerprint(
        review.quoteHash!,
        review.sourceHashes,
        review.discoveredSourceKeys,
        review.mode!,
      )
    ) {
      return block(
        "changed",
        "The selected evidence or available source set changed after this review. Review it again.",
      );
    }
    if (!review.discoveryComplete)
      return block(
        "incomplete",
        "Source discovery was incomplete when this review ran. Recheck before sending.",
      );
    return gate;
  } catch {
    return block(
      "incomplete",
      "Current evidence could not be verified. Restore access and recheck, or explicitly override with a logged reason.",
    );
  }
}

export type OpenItem = {
  findingId: string;
  commitment: string;
  coverage: Coverage;
  riskLevel: RiskLevel | null;
};

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

export async function quoteGateDetail(
  quoteId: string,
): Promise<QuoteGateDetail> {
  const quote = await getQuote(quoteId);
  const doc = quoteToDocument(quote, env().PROMISEGUARD_MAX_QUOTE_CHARS);
  const deal = quote.dealId ? await getDeal(quote.dealId) : null;
  const reviews = deal ? (await listReviewSummaries(deal.id)).items : [];
  const gate = await freshGate(quote, doc.versionHash, reviews, deal);
  let openItems: OpenItem[] = [];
  if (gate.state === "at_risk" && gate.reviewTaskId) {
    const r = await loadReview(gate.reviewTaskId);
    openItems = r.manifest
      ? openFindings(r.manifest).map((f) => ({
          findingId: f.id,
          commitment: f.commitment,
          coverage: f.coverage,
          riskLevel: f.commercialRisk?.level ?? null,
        }))
      : [];
  }
  if (gate.state === "reviewing" && gate.reviewTaskId)
    watchReview(gate.reviewTaskId);
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

export type AutoResult = {
  quoteId: string;
  quoteLabel: string | null;
  outcome: "started" | "up_to_date" | "skipped";
  reviewTaskId: string | null;
  reason: string | null;
};

/** Request IDs come from the quote version and sources, so an unchanged quote reuses its review instead of spending AI credits. */
async function autoReviewQuote(
  quoteId: string,
  trigger: AutopilotEvent["trigger"],
  opts: { event?: string; deadline?: number } = {},
): Promise<AutoResult> {
  return withLock(`quote:${quoteId}`, async () => {
    const e = env();
    const skip = (reason: string, label: string | null = null): AutoResult => ({
      quoteId,
      quoteLabel: label,
      outcome: "skipped",
      reviewTaskId: null,
      reason,
    });
    if (!e.GRAPH8_WORKFLOW_ID)
      return skip("The comparison workflow is not configured.");

    const quote = await getQuote(quoteId);
    const doc = quoteToDocument(quote, e.PROMISEGUARD_MAX_QUOTE_CHARS);
    if (isTerminal(quote))
      return skip(`The quote is ${quote.status}.`, doc.label);
    if (!quote.dealId)
      return skip("The quote is not linked to a deal.", doc.label);
    if (doc.parts.length === 0)
      return skip(
        "The quote has no scope text or line-item descriptions yet.",
        doc.label,
      );

    const deal = await getDeal(quote.dealId);
    const mode = modeForDeal(deal);
    if (mode === "demo" && !e.PROMISEGUARD_DEMO_ENABLED)
      return skip("Demo mode is disabled on this server.", doc.label);

    const reader = evidenceReader(deal, mode);
    const scan = await reader.scan();
    if (!discoveryComplete(scan))
      return skip(
        "Source discovery is incomplete. Restore access to the evidence and try again.",
        doc.label,
      );
    const refs = scan.candidates
      .filter((c) => c.textAvailable)
      .slice(0, e.PROMISEGUARD_MAX_SOURCES)
      .map((c) => c.ref);
    if (!refs.length) {
      return skip(
        mode === "demo"
          ? "No sample conversation matches this deal."
          : "No emails, meetings, deal notes, or deal memory were found for this deal.",
        doc.label,
      );
    }

    const forQuote = (await listReviewSummaries(deal.id)).items.filter(
      (r) => r.quoteId === quote.id,
    );
    const latest = forQuote[0] ?? null;
    // Apply the text budget before computing identity, so a bounded review can be reused too.
    let attempt = refs;
    const loaded = await Promise.all(refs.map((ref) => reader.load(ref)));
    const chars = (count: number) =>
      loaded
        .slice(0, count)
        .flatMap((s) => s.documents)
        .reduce((n, d) => n + d.text.length, 0);
    while (
      attempt.length > 1 &&
      chars(attempt.length) > e.PROMISEGUARD_MAX_SOURCE_CHARS
    )
      attempt = attempt.slice(0, -1);
    if (chars(attempt.length) > e.PROMISEGUARD_MAX_SOURCE_CHARS)
      return skip(
        "The most recent source exceeds the review text limit.",
        doc.label,
      );
    const hashes = await readSourceHashes(reader, attempt);
    const fingerprint = evidenceFingerprint(
      doc.versionHash,
      hashes,
      discoveryKeys(scan),
      mode,
    );
    const same = forQuote.find(
      (r) =>
        r.mode === mode &&
        r.promptVersion === PROMPT_VERSION &&
        r.discoveredSourceKeys &&
        evidenceFingerprint(
          r.quoteHash ?? "",
          r.sourceHashes,
          r.discoveredSourceKeys,
          mode,
        ) === fingerprint,
    );
    if (
      same &&
      (ACTIVE_RUN.has(same.runState ?? "") ||
        (same.runState === "completed" &&
          same.coverageComplete === true &&
          same.discoveryComplete))
    ) {
      if (ACTIVE_RUN.has(same.runState ?? ""))
        watchReview(same.taskId, opts.deadline);
      return {
        quoteId,
        quoteLabel: doc.label,
        outcome: "up_to_date",
        reviewTaskId: same.taskId,
        reason: "The quote and evidence contents are unchanged.",
      };
    }
    if (same && trigger !== "manual")
      return {
        quoteId,
        quoteLabel: doc.label,
        outcome: "skipped",
        reviewTaskId: same.taskId,
        reason:
          "The last review failed or was incomplete. Use Review now to retry.",
      };
    const res = await startReview({
      dealId: deal.id,
      quoteId: quote.id,
      sourceRefs: attempt,
      matchConfirmed: false,
      requestId: same
        ? crypto.randomUUID()
        : deterministicId(`auto-v2|${quote.id}|${fingerprint}`),
      expectedFingerprint: fingerprint,
      mode,
      previousReviewTaskId: latest?.taskId ?? null,
      trigger: trigger === "send" ? "manual" : trigger,
      ...(opts.event && trigger === "webhook"
        ? { triggerEvent: opts.event }
        : {}),
    });
    watchReview(res.reviewTaskId, opts.deadline);
    return {
      quoteId,
      quoteLabel: doc.label,
      outcome: res.recovered ? "up_to_date" : "started",
      reviewTaskId: res.reviewTaskId,
      reason: null,
    };
  });
}

/** Run an automatic review and record it in the activity log; never throws. */
export async function runAutoReview(
  quoteId: string,
  trigger: AutopilotEvent["trigger"],
  event: string,
  deadline?: number,
): Promise<AutoResult> {
  try {
    const r = await autoReviewQuote(quoteId, trigger, { event, deadline });
    record({
      quoteId,
      quoteLabel: r.quoteLabel,
      trigger,
      event,
      outcome:
        r.outcome === "started"
          ? "Review started"
          : r.outcome === "up_to_date"
            ? "Already reviewed"
            : `Skipped: ${r.reason}`,
      reviewTaskId: r.reviewTaskId,
    });
    return r;
  } catch (err) {
    const reason =
      err instanceof Graph8Error || err instanceof AppRequestError
        ? err.message
        : "Unexpected error.";
    if (!(err instanceof Graph8Error || err instanceof AppRequestError))
      console.error(
        "[promiseguard] autopilot failure",
        err instanceof Error ? err.name : typeof err,
      );
    record({
      quoteId,
      quoteLabel: null,
      trigger,
      event,
      outcome: `Failed: ${reason}`,
      reviewTaskId: null,
    });
    return {
      quoteId,
      quoteLabel: null,
      outcome: "skipped",
      reviewTaskId: null,
      reason,
    };
  }
}

/** Webhook body (inside after()): wait for edits to settle, and step aside if a newer edit arrived meanwhile. */
export async function settleThenReview(
  quoteId: string,
  event: string,
  deadline = Date.now() + BACKGROUND_BUDGET_MS,
): Promise<void> {
  const delayMs = env().PROMISEGUARD_AUTOPILOT_DELAY_SECONDS * 1000;
  let before: string | null = null;
  try {
    before = (await getQuote(quoteId)).updatedAt;
  } catch (err) {
    record({
      quoteId,
      quoteLabel: null,
      trigger: "webhook",
      event,
      outcome: `Failed: ${err instanceof Error ? err.message : "quote could not be read"}`,
      reviewTaskId: null,
    });
    return;
  }
  if (delayMs > 0)
    await sleep(Math.min(delayMs, Math.max(0, deadline - Date.now() - 5_000)));
  const latest = await getQuote(quoteId).catch(() => null);
  if (latest && before && latest.updatedAt && latest.updatedAt !== before) {
    record({
      quoteId,
      quoteLabel: null,
      trigger: "webhook",
      event,
      outcome:
        "Skipped: a newer edit arrived; its own event reviews the final version",
      reviewTaskId: null,
    });
    return;
  }
  await runAutoReview(quoteId, "webhook", event, deadline);
}

/** Finalizes a review in the background until the deadline; anything unfinished finalizes on the next view. */
export function watchReview(
  reviewTaskId: string,
  deadline = Date.now() + BACKGROUND_BUDGET_MS,
) {
  if (store.watching.has(reviewTaskId)) return;
  store.watching.add(reviewTaskId);
  const run = async () => {
    try {
      for (let i = 0; ; i++) {
        const wait = i < 10 ? 3000 : 6000;
        if (Date.now() + wait > deadline) return;
        await sleep(wait);
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
    // Outside a request scope (only possible on a long-running server): run detached.
    void run();
  }
}

export async function alertIfSentWithGaps(quoteId: string): Promise<void> {
  try {
    const d = await quoteGateDetail(quoteId);
    if (!d.dealId || d.gate.state === "clear" || d.gate.state === "closed") {
      record({
        quoteId,
        quoteLabel: d.quoteLabel,
        trigger: "webhook",
        event: "quote.sent",
        outcome: `Sent. Gate: ${d.gate.label}`,
        reviewTaskId: d.gate.reviewTaskId,
      });
      return;
    }
    const prefix = d.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
    const lines = [
      `The quote "${d.quoteLabel}" was sent while PromiseGuard's gate showed: ${d.gate.label}.`,
      ...d.gate.reasons,
      ...d.openItems.map(
        (i) =>
          `- ${i.coverage.replace("_", " ")}${i.riskLevel === "high" ? ", high commercial risk" : ""}: ${i.commitment}`,
      ),
      d.gate.reviewTaskId ? `Latest review task: ${d.gate.reviewTaskId}` : "",
      "Decision support only; not a determination of contractual liability.",
    ].filter(Boolean);
    const task = await createTask(
      {
        title:
          `${prefix} Quote sent with open promise risks: ${d.quoteLabel.replace(/^\[PromiseGuard Demo\]\s*/, "")}`.slice(
            0,
            250,
          ),
        description: lines.join("\n"),
        entity_type: "deal",
        entity_id: d.dealId,
        priority: 1,
        tags: [
          REVIEW_TAG,
          "promiseguard-alert",
          ...(d.mode === "demo" ? ["promiseguard-demo"] : []),
        ],
      },
      deterministicId(
        `sent-alert|${quoteId}|${d.gate.reviewTaskId ?? "none"}|${d.gate.state}`,
      ),
    );
    record({
      quoteId,
      quoteLabel: d.quoteLabel,
      trigger: "webhook",
      event: "quote.sent",
      outcome: `Alert task created (${d.gate.label})`,
      reviewTaskId: task.id,
    });
  } catch (err) {
    record({
      quoteId,
      quoteLabel: null,
      trigger: "webhook",
      event: "quote.sent",
      outcome: `Alert failed: ${err instanceof Error ? err.message : "error"}`,
      reviewTaskId: null,
    });
  }
}

export type SendResult = {
  mode: Mode;
  sent: boolean;
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
    if (!d.dealId || !d.mode)
      throw new AppRequestError(
        "quote_not_linked",
        "Only quotes linked to a deal can be sent through PromiseGuard.",
        409,
      );
    if (d.mode !== uiMode) {
      throw new AppRequestError(
        "mode_mismatch",
        d.mode === "demo"
          ? "This is a demo quote. Switch to Demo mode."
          : "This is a real quote. Switch to Live mode.",
        409,
      );
    }
    if (d.gate.state === "closed")
      throw new AppRequestError(
        "quote_closed",
        d.gate.reasons[0] ?? "The quote is closed.",
        409,
      );

    const override = input.overrideReason?.trim() ?? "";
    if (d.gate.state !== "clear" && override.length < 10) {
      throw new AppRequestError(
        "send_blocked",
        `Quote Guard blocked the send: ${d.gate.label}. ${d.gate.reasons.join(" ")}`,
        409,
      );
    }
    if (!d.signerEmail)
      throw new AppRequestError(
        "no_signer",
        "The quote has no signer. Set a signer on the quote in Graph8 first.",
        422,
      );

    let overrideNoteId: string | null = null;
    if (d.gate.state !== "clear") {
      const note = await createDealNote(
        d.dealId,
        [
          `${PROMISEGUARD_NOTE_PREFIX} Quote "${d.quoteLabel}" ${d.mode === "demo" ? "send preview requested" : "send requested"} with the gate overridden.`,
          `Gate: ${d.gate.label}. ${d.gate.reasons.join(" ")}`,
          ...d.openItems.map(
            (i) =>
              `- ${i.coverage.replace("_", " ")}${i.riskLevel === "high" ? ", high commercial risk" : ""}: ${i.commitment}`,
          ),
          `Reason given: ${override}`,
        ].join("\n"),
      );
      overrideNoteId = note.id;
    }

    const body = input.message?.trim() ? { message: input.message.trim() } : {};
    if (d.mode === "demo") {
      const preview = await previewQuoteSend(quoteId, body);
      const pick = (...keys: string[]) =>
        keys
          .map((k) => preview[k])
          .find((v): v is string => typeof v === "string" && v.length > 0) ??
        null;
      record({
        quoteId,
        quoteLabel: d.quoteLabel,
        trigger: "send",
        event: "guarded send",
        outcome: "Demo: Graph8 rendered the send preview (nothing sent)",
        reviewTaskId: d.gate.reviewTaskId,
      });
      return {
        mode: "demo",
        sent: false,
        preview: {
          subject: pick("subject", "email_subject"),
          recipient:
            pick("recipient_email", "to", "recipient") ?? d.signerEmail,
        },
        status: d.quoteStatus,
        overrideNoteId,
      };
    }
    const res = await sendQuote(quoteId, body);
    record({
      quoteId,
      quoteLabel: d.quoteLabel,
      trigger: "send",
      event: "guarded send",
      outcome: `Sent through Graph8 (${res.status ?? "sent"})`,
      reviewTaskId: d.gate.reviewTaskId,
    });
    return {
      mode: "live",
      sent: true,
      preview: null,
      status: res.status,
      overrideNoteId,
    };
  });
}

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

const WEBHOOK_PATH = "/api/webhooks/graph8";

export async function guardBoard(mode: Mode): Promise<GuardBoard> {
  const e = env();
  const errors: string[] = [];
  const quotes = await listRecentQuotes(50);

  const dealIds = [
    ...new Set(
      quotes.map((q) => q.dealId).filter((id): id is string => Boolean(id)),
    ),
  ];
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
    [
      ...new Set(
        selected
          .map((q) => q.dealId)
          .filter((id): id is string => Boolean(id && deals.has(id))),
      ),
    ].map(async (id) => {
      try {
        reviewsByDeal.set(id, (await listReviewSummaries(id)).items);
      } catch (err) {
        if (!(err instanceof Graph8Error)) throw err;
        errors.push(
          `Reviews for deal ${id.slice(0, 8)} could not be read: ${err.message}`,
        );
      }
    }),
  );

  // List rows omit line items, so the content hash comes from the quote detail.
  const readers = new Map(
    [...deals].map(([id, deal]) => [
      id,
      evidenceReader(deal, modeForDeal(deal)),
    ]),
  );
  const rows = await Promise.all(
    selected.map(async (listed): Promise<GuardRow> => {
      let quoteReadFailed = false;
      const q = await getQuote(listed.id).catch(() => {
        quoteReadFailed = true;
        return listed;
      });
      const doc = quoteToDocument(q, e.PROMISEGUARD_MAX_QUOTE_CHARS);
      let gate = await freshGate(
        q,
        doc.versionHash,
        q.dealId ? (reviewsByDeal.get(q.dealId) ?? []) : [],
        q.dealId ? (deals.get(q.dealId) ?? null) : null,
        q.dealId ? readers.get(q.dealId) : undefined,
      );
      if (quoteReadFailed)
        gate = {
          ...gate,
          state: "incomplete",
          label: GATE_LABEL.incomplete,
          reasons: [
            "The current quote could not be read. Retry before sending.",
          ],
        };
      if (gate.state === "reviewing" && gate.reviewTaskId)
        watchReview(gate.reviewTaskId);
      return {
        quoteId: q.id,
        quoteLabel: doc.label,
        quoteStatus: q.status,
        totalMinor: q.totalMinor,
        currency: q.currency,
        updatedAt: q.updatedAt,
        dealId: q.dealId,
        dealName: q.dealId ? (deals.get(q.dealId)?.name ?? null) : null,
        gate,
      };
    }),
  );
  rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  let webhookRegistered: boolean | null = null;
  let webhookEvents: string[] = [];
  try {
    const hook = (await listWebhooks()).find(
      (w) => w.active && w.url.includes(WEBHOOK_PATH),
    );
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
      webhookUrlConfigured: Boolean(
        e.PROMISEGUARD_PUBLIC_URL && e.PROMISEGUARD_WEBHOOK_TOKEN,
      ),
      webhookRegistered,
      webhookEvents,
      delaySeconds: e.PROMISEGUARD_AUTOPILOT_DELAY_SECONDS,
      activity: mergeActivity(rows, reviewsByDeal),
    },
  };
}

const TRIGGER_EVENT: Record<string, string> = {
  webhook: "Graph8 webhook",
  scan: "Scan now",
  manual: "Review now",
  user: "Check promises",
};

function reviewOutcome(r: ReviewSummary): string {
  if (r.runState && ACTIVE_RUN.has(r.runState))
    return "Review running in Graph8";
  if (r.runState === "completed") {
    const open = r.open ?? 0;
    return open > 0
      ? `Reviewed: ${open} promise risk(s) open`
      : r.coverageComplete
        ? "Reviewed: no open risks"
        : "Reviewed: coverage incomplete";
  }
  if (r.runState === "stale")
    return "Review stale: evidence changed during the run";
  return `Review failed${r.runError ? `: ${r.runError}` : ""}`;
}

function mergeActivity(
  rows: GuardRow[],
  reviewsByDeal: Map<string, ReviewSummary[]>,
): AutopilotEvent[] {
  const labels = new Map(rows.map((r) => [r.quoteId, r.quoteLabel]));
  const saved: AutopilotEvent[] = [...reviewsByDeal.values()]
    .flat()
    .filter(
      (r) =>
        r.quoteId &&
        (r.trigger === "webhook" ||
          r.trigger === "scan" ||
          r.trigger === "manual"),
    )
    .map((r) => ({
      at: r.createdAt ?? new Date(0).toISOString(),
      source: "graph8" as const,
      quoteId: r.quoteId!,
      quoteLabel: labels.get(r.quoteId!) ?? r.quoteLabel,
      trigger: r.trigger as AutopilotEvent["trigger"],
      event: r.triggerEvent ?? TRIGGER_EVENT[r.trigger ?? "manual"],
      outcome: reviewOutcome(r),
      reviewTaskId: r.taskId,
    }));
  const savedIds = new Set(saved.map((e) => e.reviewTaskId));
  const local = store.activity
    .filter(
      (e) =>
        !(
          e.reviewTaskId &&
          savedIds.has(e.reviewTaskId) &&
          e.outcome.startsWith("Review")
        ),
    )
    .map((e) => ({ ...e, source: "server" as const }));
  return [...saved, ...local]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);
}

export const needsReview = (r: GuardRow) =>
  r.gate.state === "no_review" || r.gate.state === "changed";
