// Scope Creep Guard: data shapes, evidence validation, and the task-description codec. Pure: no Graph8 calls.
import { z } from "zod";
import { shortHash } from "./hash";
import { CitationSchema, ModeSchema, SourceRefSchema, type Citation, type EvidenceDocument, type QuoteDocument } from "./schemas";
import { SCOPE_CLASSES, scopeCounts, type ScopeClass } from "./scope-labels";
import { locateExcerpt, parseModelJson } from "./validate-evidence";

const Evidence = z.object({ document_id: z.string(), excerpt: z.string().min(1).max(1500) });
const QuoteEvidence = z.object({ part_id: z.string(), excerpt: z.string().min(1).max(1500) });

const ScopeModelOutput = z.object({
  truncated: z.boolean(),
  items: z.array(
    z.object({
      request: z.string().min(1).max(400),
      classification: z.enum(SCOPE_CLASSES),
      reason: z.string().max(800),
      request_evidence: z.array(Evidence).min(1).max(6),
      agreement_evidence: z.array(Evidence).max(6),
      quote_evidence: z.array(QuoteEvidence).max(6),
      change_order: z.object({ product_name: z.string().min(1).max(200), description: z.string().max(600) }).nullable().optional(),
    }),
  ),
});

export const ScopeItemSchema = z.object({
  id: z.string(),
  request: z.string(),
  classification: z.enum(SCOPE_CLASSES),
  modelClassification: z.enum(SCOPE_CLASSES).nullable(),
  adjustment: z.string().nullable(),
  reason: z.string(),
  requestEvidence: z.array(CitationSchema),
  agreementEvidence: z.array(CitationSchema),
  quoteEvidence: z.array(CitationSchema),
  changeOrder: z.object({ productName: z.string(), description: z.string() }).nullable(),
});
export type ScopeItem = z.infer<typeof ScopeItemSchema>;

export const ScopeDecisionSchema = z.object({
  itemId: z.string(),
  decision: z.enum(["change_order", "goodwill", "dismissed"]),
  reason: z.string(),
  changeOrderQuoteId: z.string().nullable(),
  changeOrderLabel: z.string().nullable(),
  at: z.string(),
});
export type ScopeDecision = z.infer<typeof ScopeDecisionSchema>;

const SCOPE_RUN_STATES = ["running", "completed", "failed", "start_unknown", "stale"] as const;

export const ScopeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.literal("promiseguard-scope"),
  mode: ModeSchema,
  revision: z.number().int().nonnegative(),
  requestId: z.string(),
  taskId: z.string(),
  dealId: z.string(),
  dealName: z.string(),
  quoteId: z.string(),
  quoteLabel: z.string(),
  signedAt: z.string(),
  sourceRefs: z.array(SourceRefSchema),
  sourceLabels: z.record(z.string(), z.string()),
  sourceHashes: z.record(z.string(), z.string()),
  quoteHash: z.string(),
  excludedBeforeSigning: z.number().int().nonnegative(),
  promptVersion: z.string(),
  workflowId: z.string(),
  executionId: z.string().nullable(),
  runState: z.enum(SCOPE_RUN_STATES),
  runError: z.object({ code: z.string(), message: z.string() }).nullable(),
  items: z.array(ScopeItemSchema).nullable(),
  rejected: z.array(z.object({ request: z.string(), reason: z.string() })),
  truncated: z.boolean(),
  documents: z.record(
    z.string(),
    z.object({ source: z.string(), speaker: z.string().nullable(), side: z.enum(["seller", "buyer", "unknown"]), at: z.string().nullable(), synthetic: z.boolean() }),
  ),
  decisions: z.array(ScopeDecisionSchema),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type ScopeManifest = z.infer<typeof ScopeManifestSchema>;

/** Latest decision per item; a change order or goodwill note clears an item, a dismissal too. */
export function latestScopeDecisions(m: Pick<ScopeManifest, "decisions">): Map<string, ScopeDecision> {
  const last = new Map<string, ScopeDecision>();
  for (const d of m.decisions) last.set(d.itemId, d);
  return last;
}

const BEGIN = "PG_SCOPE_V1_BEGIN";
const END = "PG_SCOPE_V1_END";

export function buildScopeDescription(m: ScopeManifest): string {
  const lines = ["PromiseGuard scope check (work requested after the quote was signed)", `Signed quote: ${m.quoteLabel}`, `Deal: ${m.dealName}`];
  if (m.mode === "demo") lines.push("Evidence: Sample conversation (synthetic demonstration content, not a Graph8 email or transcript).");
  if (m.items) {
    const c = scopeCounts(m.items);
    lines.push(`Result: ${c.out_of_scope_agreed} agreed without payment, ${c.out_of_scope_unagreed} requested but not agreed, ${c.needs_review} needing review, ${c.in_scope} in scope.`);
  } else lines.push(`Status: ${m.runState}`);
  lines.push("Decision support only; not a determination of contractual liability.");
  return `${lines.join("\n")}\n\n${BEGIN}\n${JSON.stringify(m)}\n${END}`;
}

export function parseScopeDescription(description: string | null | undefined): ScopeManifest | null {
  const text = description ?? "";
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END, start + 1);
  if (start < 0 || end < 0) return null;
  try {
    const parsed = ScopeManifestSchema.safeParse(JSON.parse(text.slice(start + BEGIN.length, end).trim()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type ScopeValidation =
  | { ok: true; items: ScopeItem[]; rejected: Array<{ request: string; reason: string }>; truncated: boolean }
  | { ok: false; message: string };

/** Keeps only items whose excerpts exist in the evidence; agreement must come from the seller. */
export function validateScopeOutput(input: {
  raw: string | null;
  fallbackParsed?: unknown;
  documents: EvidenceDocument[];
  quote: QuoteDocument;
  maxItems: number;
}): ScopeValidation {
  const json = parseModelJson(input.raw, input.fallbackParsed);
  if (json === undefined) return { ok: false, message: "The scope check did not return valid JSON." };
  const parsed = ScopeModelOutput.safeParse(json);
  if (!parsed.success) return { ok: false, message: "The scope check output did not match the expected structure." };

  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const parts = new Map(input.quote.parts.map((p) => [p.id, p]));
  const cite = (text: string, excerpt: string, id: string): Citation | null => {
    const loc = locateExcerpt(text, excerpt);
    return loc ? { documentId: id, excerpt: text.slice(loc.start, loc.end), ...loc } : null;
  };
  const citeDocs = (list: Array<{ document_id: string; excerpt: string }>) => {
    const out: Citation[] = [];
    for (const e of list) {
      const d = docs.get(e.document_id);
      const c = d ? cite(d.text, e.excerpt, d.id) : null;
      if (!c) return null;
      out.push(c);
    }
    return out;
  };

  let truncated = parsed.data.truncated;
  let raw = parsed.data.items;
  if (raw.length > input.maxItems) {
    raw = raw.slice(0, input.maxItems);
    truncated = true;
  }

  const items: ScopeItem[] = [];
  const rejected: Array<{ request: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const it of raw) {
    const request = citeDocs(it.request_evidence);
    if (!request) {
      rejected.push({ request: it.request, reason: "A request excerpt does not appear in the cited document." });
      continue;
    }
    const agreement = citeDocs(it.agreement_evidence);
    if (!agreement) {
      rejected.push({ request: it.request, reason: "An agreement excerpt does not appear in the cited document." });
      continue;
    }
    const quoteCites: Citation[] = [];
    let quoteOk = true;
    for (const e of it.quote_evidence) {
      const p = parts.get(e.part_id);
      const c = p ? cite(p.text, e.excerpt, p.id) : null;
      if (!c) quoteOk = false;
      else quoteCites.push(c);
    }
    if (!quoteOk) {
      rejected.push({ request: it.request, reason: "A quote excerpt does not appear in the signed quote." });
      continue;
    }

    let classification: ScopeClass = it.classification;
    let adjustment: string | null = null;
    if (classification === "out_of_scope_agreed") {
      if (!agreement.length) {
        classification = "needs_review";
        adjustment = "No agreement excerpt was cited.";
      } else if (!agreement.some((c) => docs.get(c.documentId)!.speakerSide === "seller")) {
        classification = "needs_review";
        adjustment = "The agreement was not made by someone on the seller side.";
      }
    }
    if (classification === "in_scope" && !quoteCites.length) {
      classification = "needs_review";
      adjustment = "No quote clause was cited to show it is in scope.";
    }

    const id = `s_${shortHash({ r: it.request.trim().toLowerCase(), d: request[0].documentId, s: request[0].start })}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const outOfScope = classification === "out_of_scope_agreed" || classification === "out_of_scope_unagreed";
    items.push({
      id,
      request: it.request.trim(),
      classification,
      modelClassification: classification !== it.classification ? it.classification : null,
      adjustment,
      reason: it.reason.trim(),
      requestEvidence: request,
      agreementEvidence: agreement,
      quoteEvidence: quoteCites,
      changeOrder:
        outOfScope && it.change_order
          ? { productName: it.change_order.product_name.trim(), description: it.change_order.description.trim() }
          : null,
    });
  }
  items.sort((a, b) => SCOPE_CLASSES.indexOf(a.classification) - SCOPE_CLASSES.indexOf(b.classification));
  return { ok: true, items, rejected, truncated };
}
