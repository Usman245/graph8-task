// Server-side verification of model output. Nothing the model says is shown unless its
// citations match the exact canonical text that was sent to Graph8.

import { shortHash } from "./hash";
import {
  ModelOutputSchema,
  type Citation,
  type Coverage,
  type EvidenceDocument,
  type Finding,
  type QuoteDocument,
} from "./schemas";

type ValidationResult =
  | {
      ok: true;
      findings: Finding[];
      rejected: Array<{ commitment: string; reason: string }>;
      truncated: boolean;
    }
  | { ok: false; code: "unparseable" | "schema_mismatch"; message: string };

const FOLD: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  " ": " ",
};

/** Exact match first, then one ignoring only whitespace runs and quote/dash variants. Offsets refer to the original text. */
export function locateExcerpt(
  text: string,
  excerpt: string,
): { start: number; end: number } | null {
  const needle = excerpt.trim();
  if (!needle) return null;
  const exact = text.indexOf(needle);
  if (exact >= 0) return { start: exact, end: exact + needle.length };

  const fold = (s: string) => {
    const chars: string[] = [];
    const map: number[] = [];
    let prevSpace = false;
    for (let i = 0; i < s.length; i++) {
      let c = FOLD[s[i]] ?? s[i];
      if (/\s/.test(c)) {
        if (prevSpace) continue;
        c = " ";
        prevSpace = true;
      } else prevSpace = false;
      chars.push(c);
      map.push(i);
    }
    return { folded: chars.join(""), map };
  };
  const hay = fold(text);
  const pin = fold(needle).folded.trim();
  const idx = hay.folded.indexOf(pin);
  if (idx < 0) return null;
  const start = hay.map[idx];
  const end = hay.map[idx + pin.length - 1] + 1;
  return { start, end };
}

export function parseModelJson(
  raw: string | null,
  fallbackParsed: unknown,
): unknown {
  if (raw != null) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  // Graph8's parse_json node tolerates fences/prose; its output still goes through the same schema.
  if (fallbackParsed && typeof fallbackParsed === "object")
    return fallbackParsed;
  return undefined;
}

export function validateModelOutput(input: {
  raw: string | null;
  fallbackParsed?: unknown;
  documents: EvidenceDocument[];
  quote: QuoteDocument;
  maxFindings: number;
}): ValidationResult {
  const json = parseModelJson(input.raw, input.fallbackParsed);
  if (json === undefined)
    return {
      ok: false,
      code: "unparseable",
      message: "The comparison did not return valid JSON.",
    };

  const parsed = ModelOutputSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      code: "schema_mismatch",
      message: "The comparison output did not match the expected structure.",
    };
  }

  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const parts = new Map(input.quote.parts.map((p) => [p.id, p]));
  const findings: Finding[] = [];
  const rejected: Array<{ commitment: string; reason: string }> = [];
  const seen = new Set<string>();

  let truncated = parsed.data.truncated;
  let items = parsed.data.findings;
  if (items.length > input.maxFindings) {
    items = items.slice(0, input.maxFindings);
    truncated = true;
  }

  for (const f of items) {
    const reject = (reason: string) =>
      rejected.push({ commitment: f.commitment, reason });

    const sales: Citation[] = [];
    let salesError: string | null = null;
    for (const e of f.sales_evidence) {
      const d = docs.get(e.document_id);
      if (!d) {
        salesError = `Cited a document that was not part of this review (${e.document_id}).`;
        break;
      }
      const loc = locateExcerpt(d.text, e.excerpt);
      if (!loc) {
        salesError = "A sales excerpt does not appear in the cited document.";
        break;
      }
      sales.push({
        documentId: d.id,
        excerpt: d.text.slice(loc.start, loc.end),
        ...loc,
      });
    }
    if (salesError) {
      reject(salesError);
      continue;
    }

    const quoteCites: Citation[] = [];
    let quoteError: string | null = null;
    for (const e of f.quote_evidence) {
      const p = parts.get(e.part_id);
      if (!p) {
        quoteError = `Cited a quote part that was not supplied (${e.part_id}).`;
        break;
      }
      const loc = locateExcerpt(p.text, e.excerpt);
      if (!loc) {
        quoteError = "A quote excerpt does not appear in the cited quote part.";
        break;
      }
      quoteCites.push({
        documentId: p.id,
        excerpt: p.text.slice(loc.start, loc.end),
        ...loc,
      });
    }
    if (quoteError) {
      reject(quoteError);
      continue;
    }

    const sides = sales.map((c) => docs.get(c.documentId)!.speakerSide);
    if (sides.every((s) => s === "buyer")) {
      reject(
        "Only buyer statements were cited, so this is not a seller commitment.",
      );
      continue;
    }

    let coverage: Coverage = f.coverage;
    const adjustments: string[] = [];
    if (
      (coverage === "covered" || coverage === "conflict") &&
      quoteCites.length === 0
    ) {
      reject(`Marked ${coverage} without verified quote evidence.`);
      continue;
    }
    if (!sides.includes("seller")) {
      coverage = "needs_review";
      adjustments.push("Speaker attribution is uncertain.");
    }
    if (coverage === "missing" && !input.quote.textComplete) {
      coverage = "needs_review";
      adjustments.push(
        "The quote text is incomplete, so absence cannot be confirmed.",
      );
    }

    const id = `f_${shortHash({ c: f.commitment.trim().toLowerCase(), d: sales[0].documentId, s: sales[0].start })}`;
    if (seen.has(id)) continue;
    seen.add(id);

    findings.push({
      id,
      commitment: f.commitment.trim(),
      category: f.category,
      coverage,
      modelCoverage: coverage !== f.coverage ? f.coverage : null,
      adjustment: adjustments.length ? adjustments.join(" ") : null,
      reason: f.reason.trim(),
      conditions: f.conditions.map((c) => c.trim()).filter(Boolean),
      salesEvidence: sales,
      quoteEvidence: quoteCites,
      suggestedAction: f.suggested_action.trim(),
      ...(f.commercial_risk
        ? {
            commercialRisk: {
              level: f.commercial_risk.level,
              riskTypes: f.commercial_risk.risk_types,
              reason: f.commercial_risk.reason.trim(),
              missingInformation: f.commercial_risk.missing_information
                .map((item) => item.trim())
                .filter(Boolean),
              recommendedClause: f.commercial_risk.recommended_clause.trim(),
              // Enforce the documented rule even if the model returns an inconsistent boolean.
              requiresApproval: f.commercial_risk.level === "high",
            },
          }
        : {}),
    });
  }

  return { ok: true, findings, rejected, truncated };
}
