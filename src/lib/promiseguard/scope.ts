// Scope Creep Guard: after a quote is signed, checks later conversations for extra work that was agreed
// without payment. Each check is a Graph8 task on the deal; the comparison runs in its own Graph8 workflow.
import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { getDeal, type Deal } from "@/lib/graph8/adapters/deals";
import { createDraftQuote, getQuote, listQuotesForDeal, type QuoteRecord } from "@/lib/graph8/adapters/quotes";
import { createTask, getTask, listDealTasks, patchTask, type Task } from "@/lib/graph8/adapters/tasks";
import { executeWorkflow, getExecution, listRecentExecutions } from "@/lib/graph8/adapters/workflows";
import { Graph8Error } from "@/lib/graph8/errors";
import { withLock } from "./lock";
import { DEMO_TITLE_PREFIX, REVIEW_TAG, REVIEW_TITLE_PREFIX } from "./manifest";
import { assertDealMatchesMode } from "./mode";
import { quoteToDocument, sourceHash } from "./normalize";
import { DEMO_SCENARIOS, SAMPLE_LABEL } from "./sample-data";
import { refKey, type Citation, type EvidenceDocument, type Mode, type QuoteDocument, type SourceRef } from "./schemas";
import { SCOPE_OUTPUT_SCHEMA, SCOPE_PROMPT_VERSION } from "./scope-prompt";
import {
  buildScopeDescription,
  latestScopeDecisions,
  parseScopeDescription,
  validateScopeOutput,
  type ScopeDecision,
  type ScopeManifest,
} from "./scope-rules";
import { findSourceCandidates, loadSource, type CandidateScan } from "./sources";

const SCOPE_TAG = "promiseguard-scope";
const MAX_ITEMS = 12;

function scopeWorkflowId(): string {
  const id = env().GRAPH8_SCOPE_WORKFLOW_ID;
  if (!id) throw new AppRequestError("scope_workflow_missing", "The scope check workflow is not configured. Run: node scripts/setup-promiseguard.mts scope", 503);
  return id;
}

/** When the quote was signed: Graph8's accepted_at in Live mode, the scenario's signing date in Demo mode. */
function signedAt(quote: QuoteRecord, mode: Mode): string | null {
  if (mode === "live") return quote.status === "accepted" ? quote.acceptedAt ?? quote.updatedAt : null;
  for (const sc of DEMO_SCENARIOS) {
    const q = sc.scopeWatch && sc.quotes.find((x) => x.key === sc.scopeWatch!.quoteKey);
    if (q && q.title === quote.title) return sc.scopeWatch!.signedAt;
  }
  return null;
}

export type ScopeSummary = { taskId: string; quoteLabel: string; runState: ScopeManifest["runState"]; createdAt: string; open: number; agreedUnpaid: number };

export type ScopeContext = {
  mode: Mode;
  configured: boolean;
  signedQuotes: Array<{ id: string; label: string; signedAt: string }>;
  sources: CandidateScan;
  checks: ScopeSummary[];
};

export async function scopeContext(dealId: string, mode: Mode): Promise<ScopeContext> {
  const deal = await getDeal(dealId);
  assertDealMatchesMode(deal, mode);
  const quotes = (await listQuotesForDeal(deal.id))
    .map((q) => ({ q, at: signedAt(q, mode) }))
    .filter((x): x is { q: QuoteRecord; at: string } => Boolean(x.at))
    .map(({ q, at }) => ({ id: q.id, label: quoteToDocument(q, env().PROMISEGUARD_MAX_QUOTE_CHARS).label, signedAt: at }));
  const [sources, checks] = await Promise.all([findSourceCandidates(deal, mode, "scope"), listScopeChecks(deal.id)]);
  return { mode, configured: Boolean(env().GRAPH8_SCOPE_WORKFLOW_ID), signedQuotes: quotes, sources, checks };
}

async function listScopeChecks(dealId: string): Promise<ScopeSummary[]> {
  const { items } = await listDealTasks(dealId, { search: "Scope check", limit: 100 });
  return items
    .filter((t) => t.tags.includes(SCOPE_TAG))
    .map((t) => ({ t, m: parseScopeDescription(t.description) }))
    .filter((x): x is { t: Task; m: ScopeManifest } => Boolean(x.m))
    .map(({ t, m }) => {
      const last = latestScopeDecisions(m);
      const open = (m.items ?? []).filter((i) => i.classification !== "in_scope" && !last.has(i.id));
      return {
        taskId: t.id,
        quoteLabel: m.quoteLabel,
        runState: m.runState,
        createdAt: m.createdAt,
        open: open.length,
        agreedUnpaid: open.filter((i) => i.classification === "out_of_scope_agreed").length,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

type Evidence = { deal: Deal; quote: QuoteRecord; signed: string; sources: Awaited<ReturnType<typeof loadSource>>[]; documents: EvidenceDocument[]; excluded: number };

/** Re-reads the deal, signed quote, and sources, keeping only documents dated on or after the signing date. */
async function prepare(dealId: string, quoteId: string, refs: SourceRef[], mode: Mode): Promise<Evidence> {
  const deal = await getDeal(dealId);
  assertDealMatchesMode(deal, mode);
  const quote = await getQuote(quoteId);
  if (quote.dealId !== deal.id) throw new AppRequestError("quote_other_deal", "This quote is not linked to this deal.", 409);
  const signed = signedAt(quote, mode);
  if (!signed) {
    throw new AppRequestError("quote_not_signed", mode === "live" ? "Scope checks need a quote that Graph8 marks accepted." : "This demo quote has no signing date.", 409);
  }
  if (!refs.length || refs.length > env().PROMISEGUARD_MAX_SOURCES) {
    throw new AppRequestError("sources_invalid", `Select between 1 and ${env().PROMISEGUARD_MAX_SOURCES} conversations.`, 422);
  }
  const sources = [];
  for (const ref of refs) sources.push(await loadSource(deal, ref, mode, "scope"));
  const all = sources.flatMap((s) => s.documents);
  // Undated text cannot be proven to come after the signature, so it is left out.
  const documents = all.filter((d) => d.occurredAt && d.occurredAt >= signed);
  if (!documents.length) throw new AppRequestError("nothing_after_signing", "None of the selected conversations are dated after the quote was signed.", 422);
  const chars = documents.reduce((n, d) => n + d.text.length, 0);
  if (chars > env().PROMISEGUARD_MAX_SOURCE_CHARS) throw new AppRequestError("sources_too_large", "The selected conversations are too long. Select fewer.", 413);
  return { deal, quote, signed, sources, documents, excluded: all.length - documents.length };
}

/** Models mangle long IDs, so the prompt uses short ones (d1, p1) that are mapped back to the real IDs afterwards. */
function shortened(ev: Evidence) {
  const qd = quoteToDocument(ev.quote, env().PROMISEGUARD_MAX_QUOTE_CHARS);
  const back = new Map<string, string>();
  const documents = ev.documents.map((d, i) => {
    back.set(`d${i + 1}`, d.id);
    return { ...d, id: `d${i + 1}` };
  });
  const quote: QuoteDocument = {
    ...qd,
    parts: qd.parts.map((p, i) => {
      back.set(`p${i + 1}`, p.id);
      return { ...p, id: `p${i + 1}` };
    }),
  };
  const restore = (c: Citation): Citation => ({ ...c, documentId: back.get(c.documentId) ?? c.documentId });
  return { documents, quote, qd, restore };
}

function inputData(m: Pick<ScopeManifest, "requestId" | "mode" | "signedAt" | "dealName">, ev: Evidence): Record<string, string> {
  const { documents, quote: qd } = shortened(ev);
  const labels = new Map(ev.sources.map((s) => [refKey(s.ref), s.label]));
  return {
    context_json: JSON.stringify({
      request_id: m.requestId,
      prompt_version: SCOPE_PROMPT_VERSION,
      max_items: MAX_ITEMS,
      signed_at: m.signedAt,
      deal_name: m.dealName,
      evidence_origin: m.mode === "demo" ? "synthetic sample conversation for demonstration" : "Graph8 records",
    }),
    sources_json: JSON.stringify(
      documents.map((d) => ({ document_id: d.id, source: labels.get(refKey(d.parent)), speaker: d.speaker, speaker_side: d.speakerSide, occurred_at: d.occurredAt, text: d.text })),
    ),
    quote_json: JSON.stringify({ quote_id: qd.quoteId, label: qd.label, parts: qd.parts.map((p) => ({ part_id: p.id, path: p.path, text: p.text })) }),
    output_schema_json: JSON.stringify(SCOPE_OUTPUT_SCHEMA),
  };
}

const hashes = (ev: Evidence) => Object.fromEntries(ev.sources.map((s) => [refKey(s.ref), sourceHash(s.documents)]));

async function loadScope(taskId: string): Promise<{ task: Task; m: ScopeManifest }> {
  let task: Task;
  try {
    task = await getTask(taskId);
  } catch (err) {
    if (err instanceof Graph8Error && err.code === "not_found") throw new AppRequestError("scope_not_found", "This scope check does not exist.", 404);
    throw err;
  }
  const m = parseScopeDescription(task.description);
  if (!m || !task.tags.includes(SCOPE_TAG) || task.entityType !== "deal" || task.entityId !== m.dealId || (m.taskId && m.taskId !== task.id)) {
    throw new AppRequestError("not_scope_check", "This Graph8 task is not a PromiseGuard scope check.", 404);
  }
  return { task, m };
}

/** Conditional save: Graph8 returns 409 if the task changed since it was read. */
async function saveScope(task: Task, next: ScopeManifest) {
  const m: ScopeManifest = { ...next, taskId: task.id, revision: next.revision + 1 };
  const updated = await patchTask(task.id, { description: buildScopeDescription(m) }, task.updatedAt);
  return { task: updated, m };
}

export async function startScopeCheck(input: { dealId: string; quoteId: string; sourceRefs: SourceRef[]; requestId: string; mode: Mode }) {
  return withLock(`scope-deal:${input.dealId}`, async () => {
    const existing = (await listDealTasks(input.dealId, { search: input.requestId.slice(0, 8), limit: 50 })).items
      .map((t) => ({ t, m: parseScopeDescription(t.description) }))
      .find((x) => x.m?.requestId === input.requestId);
    if (existing) return { taskId: existing.t.id, recovered: true };

    const wf = scopeWorkflowId();
    const ev = await prepare(input.dealId, input.quoteId, input.sourceRefs, input.mode);
    const label = quoteToDocument(ev.quote, env().PROMISEGUARD_MAX_QUOTE_CHARS).label;
    const initial: ScopeManifest = {
      schemaVersion: 1,
      app: "promiseguard-scope",
      mode: input.mode,
      revision: 0,
      requestId: input.requestId,
      taskId: "",
      dealId: ev.deal.id,
      dealName: ev.deal.name,
      quoteId: ev.quote.id,
      quoteLabel: label,
      signedAt: ev.signed,
      sourceRefs: input.sourceRefs,
      sourceLabels: Object.fromEntries(ev.sources.map((s) => [refKey(s.ref), s.label])),
      sourceHashes: hashes(ev),
      quoteHash: quoteToDocument(ev.quote, env().PROMISEGUARD_MAX_QUOTE_CHARS).versionHash,
      excludedBeforeSigning: ev.excluded,
      promptVersion: SCOPE_PROMPT_VERSION,
      workflowId: wf,
      executionId: null,
      runState: "running",
      runError: null,
      items: null,
      rejected: [],
      truncated: false,
      documents: {},
      decisions: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    const prefix = input.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
    const task = await createTask(
      {
        title: `${prefix} Scope check ${label.replace(/^\[PromiseGuard Demo\]\s*/, "")} [${input.requestId.slice(0, 8)}]`.slice(0, 250),
        description: buildScopeDescription(initial),
        entity_type: "deal",
        entity_id: ev.deal.id,
        priority: 3,
        tags: [REVIEW_TAG, SCOPE_TAG, ...(input.mode === "demo" ? ["promiseguard-demo"] : [])],
      },
      input.requestId,
    );
    let saved = await saveScope(task, initial);
    try {
      const { executionId } = await executeWorkflow(wf, inputData(saved.m, ev));
      saved = await saveScope(saved.task, { ...saved.m, executionId });
    } catch (err) {
      if (!(err instanceof Graph8Error)) throw err;
      const uncertain = err.code === "timeout" || err.code === "network" || err.code === "server_error";
      await saveScope(saved.task, {
        ...saved.m,
        runState: uncertain ? "start_unknown" : "failed",
        runError: { code: uncertain ? "start_unknown" : `graph8_${err.code}`, message: uncertain ? "Graph8 did not confirm the check started. It will be looked up in the workflow history." : err.message },
      });
    }
    return { taskId: task.id, recovered: false };
  });
}

export type ScopeView = { manifest: ScopeManifest; executionStatus: string | null; decisions: Record<string, ScopeDecision> };

/** Read-only: stored state plus the live workflow status. */
export async function getScopeView(taskId: string): Promise<ScopeView> {
  const { m } = await loadScope(taskId);
  let executionStatus: string | null = null;
  if (m.runState === "running" && m.executionId) executionStatus = (await getExecution(m.executionId)).status;
  return { manifest: m, executionStatus, decisions: Object.fromEntries(latestScopeDecisions(m)) };
}

/** Idempotent; never starts a second AI run. */
export async function finalizeScope(taskId: string): Promise<{ state: ScopeManifest["runState"] }> {
  return withLock(`scope:${taskId}`, async () => {
    let { task, m } = await loadScope(taskId);
    if (m.runState === "completed" || m.runState === "failed" || m.runState === "stale") return { state: m.runState };
    if (!m.executionId) {
      const hit = (await listRecentExecutions(m.workflowId, 50)).find(
        (x) => typeof x.inputData?.context_json === "string" && x.inputData.context_json.includes(`"request_id":"${m.requestId}"`),
      );
      if (!hit) return { state: m.runState };
      ({ task, m } = await saveScope(task, { ...m, executionId: hit.executionId, runState: "running", runError: null }));
    }
    const ex = await getExecution(m.executionId!);
    if (!ex.terminal) return { state: "running" };
    if (ex.status !== "completed") {
      await saveScope(task, { ...m, runState: "failed", runError: { code: `workflow_${ex.status}`, message: `The Graph8 workflow ${ex.status}${ex.errorMessage ? `: ${ex.errorMessage.slice(0, 300)}` : "."}` } });
      return { state: "failed" };
    }
    const ev = await prepare(m.dealId, m.quoteId, m.sourceRefs, m.mode).catch((err) => {
      if (err instanceof AppRequestError) return null;
      throw err;
    });
    const qd = ev && quoteToDocument(ev.quote, env().PROMISEGUARD_MAX_QUOTE_CHARS);
    if (!ev || !qd || qd.versionHash !== m.quoteHash || JSON.stringify(hashes(ev)) !== JSON.stringify(m.sourceHashes)) {
      await saveScope(task, { ...m, runState: "stale", runError: { code: "evidence_changed", message: "The quote or a conversation changed while the check ran. Run a new check." } });
      return { state: "stale" };
    }
    const short = shortened(ev);
    const v = validateScopeOutput({ raw: ex.rawResult, fallbackParsed: ex.parsedResult, documents: short.documents, quote: short.quote, maxItems: MAX_ITEMS });
    if (!v.ok) {
      await saveScope(task, { ...m, runState: "failed", runError: { code: "invalid_output", message: `${v.message} Run the check again.` } });
      return { state: "failed" };
    }
    const items = v.items.map((i) => ({
      ...i,
      requestEvidence: i.requestEvidence.map(short.restore),
      agreementEvidence: i.agreementEvidence.map(short.restore),
      quoteEvidence: i.quoteEvidence.map(short.restore),
    }));
    const cited = new Set(items.flatMap((i) => [...i.requestEvidence, ...i.agreementEvidence].map((c) => c.documentId)));
    const documents: ScopeManifest["documents"] = {};
    for (const d of ev.documents) {
      if (cited.has(d.id)) documents[d.id] = { source: m.sourceLabels[refKey(d.parent)] ?? refKey(d.parent), speaker: d.speaker, side: d.speakerSide, at: d.occurredAt, synthetic: d.synthetic };
    }
    await saveScope(task, { ...m, runState: "completed", items, rejected: v.rejected, truncated: v.truncated, documents, completedAt: new Date().toISOString() });
    return { state: "completed" };
  });
}

function findItem(m: ScopeManifest, itemId: string) {
  const item = m.items?.find((i) => i.id === itemId);
  if (!item) throw new AppRequestError("item_not_found", "This item is not part of the scope check.", 404);
  return item;
}

function checkRevision(m: ScopeManifest, expected: number) {
  if (m.revision !== expected) throw new AppRequestError("stale_revision", "This scope check changed since you loaded it. Refresh and try again.", 409);
}

/** Goodwill (do it for free, on purpose) or dismiss; both need a reason. */
export async function decideScopeItem(taskId: string, itemId: string, input: { decision: "goodwill" | "dismissed"; reason: string; expectedRevision: number }) {
  return withLock(`scope:${taskId}`, async () => {
    const { task, m } = await loadScope(taskId);
    checkRevision(m, input.expectedRevision);
    findItem(m, itemId);
    const reason = input.reason.trim();
    if (reason.length < 5) throw new AppRequestError("reason_required", "Give a short reason.", 422);
    const decision: ScopeDecision = { itemId, decision: input.decision, reason, changeOrderQuoteId: null, changeOrderLabel: null, at: new Date().toISOString() };
    const saved = await saveScope(task, { ...m, decisions: [...m.decisions, decision] });
    return { revision: saved.m.revision };
  });
}

/** Creates a draft change-order quote in Graph8 for out-of-scope work. Never sends it. */
export async function draftChangeOrder(
  taskId: string,
  itemId: string,
  input: { productName: string; description: string; priceMinor: number; expectedRevision: number },
) {
  return withLock(`scope:${taskId}`, async () => {
    const { task, m } = await loadScope(taskId);
    checkRevision(m, input.expectedRevision);
    const item = findItem(m, itemId);
    if (item.classification === "in_scope") throw new AppRequestError("in_scope", "This work is already covered by the signed quote.", 409);
    const done = latestScopeDecisions(m).get(itemId);
    if (done?.decision === "change_order") return { quoteId: done.changeOrderQuoteId, recovered: true };

    const deal = await getDeal(m.dealId);
    assertDealMatchesMode(deal, m.mode);
    const signed = await getQuote(m.quoteId);
    const companyId = Number(signed.companyId);
    if (!Number.isFinite(companyId)) throw new AppRequestError("no_company", "The signed quote has no customer company in Graph8.", 422);
    const signer = signed.signerContactId
      ? { contactId: signed.signerContactId }
      : signed.signerEmail
        ? { email: signed.signerEmail, name: signed.signerName ?? signed.signerEmail }
        : null;
    if (!signer) throw new AppRequestError("no_signer", "The signed quote has no signer to copy.", 422);

    const prefix = m.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
    const title = `${prefix} Change order: ${input.productName.trim()} [${itemId.slice(2, 10)}]`.slice(0, 250);
    const excerpt = item.requestEvidence[0]?.excerpt ?? item.request;
    const terms = [
      `Change order for work requested after "${m.quoteLabel}" was signed.`,
      `Requested: ${item.request}`,
      `Evidence: "${excerpt}"${m.mode === "demo" ? ` (${SAMPLE_LABEL.toLowerCase()}, synthetic)` : ""}`,
      "This work is not included in the signed quote and is priced separately below.",
    ].join("\n");
    let quote: QuoteRecord;
    try {
      quote = await createDraftQuote({
        title,
        dealId: m.dealId,
        companyId,
        signer,
        billing: signed.billing,
        currency: signed.currency ?? "USD",
        contractStartDate: new Date().toISOString().slice(0, 10),
        termsContent: terms,
        notes: `[PromiseGuard] Draft change order from scope check ${taskId}. Review the price before sending.`,
        lineItem: { productName: input.productName.trim(), description: input.description.trim(), unitAmountMinor: input.priceMinor },
      });
    } catch (err) {
      // An uncertain create may have succeeded: look for the exact title before reporting failure.
      const found = err instanceof Graph8Error ? (await listQuotesForDeal(m.dealId).catch(() => [])).find((q) => q.title === title) : undefined;
      if (!found) throw err;
      quote = found;
    }
    const decision: ScopeDecision = {
      itemId,
      decision: "change_order",
      reason: `Draft change order created in Graph8 (${input.priceMinor / 100} ${signed.currency ?? "USD"}).`,
      changeOrderQuoteId: quote.id,
      changeOrderLabel: [quote.number, quote.title].filter(Boolean).join(" · "),
      at: new Date().toISOString(),
    };
    const saved = await saveScope(task, { ...m, decisions: [...m.decisions, decision] });
    return { quoteId: quote.id, recovered: false, revision: saved.m.revision };
  });
}
