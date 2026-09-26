import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { getDeal } from "@/lib/graph8/adapters/deals";
import { createDealNote } from "@/lib/graph8/adapters/notes";
import { IN_FLIGHT_QUOTE_STATUSES, TERMINAL_QUOTE_STATUSES, getQuote, updateQuoteTerms } from "@/lib/graph8/adapters/quotes";
import { withLock } from "./lock";
import { assertDealMatchesMode } from "./mode";
import { PROMISEGUARD_NOTE_PREFIX } from "./normalize";
import { loadReview, requireEditable, saveManifest } from "./repository";
import { checkRevision, findFinding } from "./runs";

// One-click fixes for a finding. Both write real Graph8 records and record a human decision on the review;
// neither changes the AI verdict. A quote edit makes the review "changed", so the fix is proven by a recheck.

export type ReviewQuote = {
  quoteId: string;
  status: string | null;
  termsContent: string;
  editable: boolean;
  /** Saving would recall a sent quote to draft and void its live signing link. */
  recallsSentQuote: boolean;
  reason: string | null;
};

export async function reviewQuote(reviewTaskId: string): Promise<ReviewQuote> {
  const { manifest: m } = requireEditable(await loadReview(reviewTaskId));
  const q = await getQuote(m.quoteId);
  const status = (q.status ?? "").toLowerCase();
  const terminal = TERMINAL_QUOTE_STATUSES.includes(status);
  return {
    quoteId: q.id,
    status: q.status,
    termsContent: q.termsContent ?? "",
    editable: !terminal,
    recallsSentQuote: IN_FLIGHT_QUOTE_STATUSES.includes(status),
    reason: terminal ? `The quote is ${q.status}; Graph8 does not allow editing it.` : null,
  };
}

const MAX_TERMS = 20_000;

export async function applyQuoteTerms(
  reviewTaskId: string,
  findingId: string,
  input: { termsContent: string; expectedRevision: number; acknowledgeRecall: boolean },
) {
  return withLock(`review:${reviewTaskId}`, async () => {
    const { task, manifest: m } = requireEditable(await loadReview(reviewTaskId));
    checkRevision(m, input.expectedRevision);
    const f = findFinding(m, findingId);
    assertDealMatchesMode(await getDeal(m.dealId), m.mode);

    const q = await getQuote(m.quoteId);
    const status = (q.status ?? "").toLowerCase();
    if (TERMINAL_QUOTE_STATUSES.includes(status)) throw new AppRequestError("quote_closed", `The quote is ${q.status}; it cannot be edited.`, 409);
    if (IN_FLIGHT_QUOTE_STATUSES.includes(status) && !input.acknowledgeRecall) {
      throw new AppRequestError("recall_required", "This quote was already sent. Saving recalls it to draft and voids the buyer's signing link. Confirm to continue.", 409);
    }
    const terms = input.termsContent.replace(/\r\n?/g, "\n").trim();
    if (!terms) throw new AppRequestError("terms_empty", "The quote terms cannot be empty.", 422);
    if (terms.length > MAX_TERMS) throw new AppRequestError("terms_too_long", `Keep the terms under ${MAX_TERMS} characters.`, 422);
    if (terms === (q.termsContent ?? "").replace(/\r\n?/g, "\n").trim()) {
      throw new AppRequestError("terms_unchanged", "The terms are unchanged. Edit them before saving.", 422);
    }

    const res = await updateQuoteTerms(q.id, terms);
    // "confirmed", not "resolved": this review describes the old quote version, which still has the gap if the
    // edit is ever reverted. The fix is proven by a recheck of the new version, which the gate then uses.
    const decision = {
      findingId: f.id,
      decision: "confirmed" as const,
      reason: `Quote terms updated in Graph8 from PromiseGuard to address "${f.commitment}". Recheck to verify coverage.`.slice(0, 1000),
      actorLabel: "Workspace reviewer",
      at: new Date().toISOString(),
    };
    const saved = await saveManifest(task, { ...m, humanDecisions: [...m.humanDecisions, decision] });
    return { revision: saved.manifest.revision, quoteStatus: res.status };
  });
}

export async function addClarificationNote(reviewTaskId: string, findingId: string, input: { content: string; expectedRevision: number }) {
  return withLock(`review:${reviewTaskId}`, async () => {
    const { task, manifest: m } = requireEditable(await loadReview(reviewTaskId));
    checkRevision(m, input.expectedRevision);
    const f = findFinding(m, findingId);
    assertDealMatchesMode(await getDeal(m.dealId), m.mode);
    const content = input.content.trim();
    if (content.length < 10) throw new AppRequestError("note_empty", "Write the clarification first.", 422);

    // The prefix keeps this note out of future reviews' evidence.
    const note = await createDealNote(
      m.dealId,
      `${PROMISEGUARD_NOTE_PREFIX} Buyer clarification drafted for "${f.commitment}" (quote ${m.quoteLabel})\n\n${content}`,
    );
    const decision = {
      findingId: f.id,
      decision: "confirmed" as const,
      reason: "Buyer clarification drafted and saved as a Graph8 deal note. Record a resolution once the buyer has agreed.",
      actorLabel: "Workspace reviewer",
      at: new Date().toISOString(),
    };
    const saved = await saveManifest(task, { ...m, humanDecisions: [...m.humanDecisions, decision] });
    return { revision: saved.manifest.revision, noteId: note.id };
  });
}
