import { z } from "zod";

// App-owned types. Kept separate from Graph8 DTOs (see src/lib/graph8/adapters).

export const ModeSchema = z.enum(["demo", "live"]);
export type Mode = z.infer<typeof ModeSchema>;

export const SourceKindSchema = z.enum(["sample", "email", "meeting"]);
export const SourceRefSchema = z.object({ kind: SourceKindSchema, id: z.string().min(1).max(200) }).strict();
export type SourceRef = z.infer<typeof SourceRefSchema>;
export const refKey = (r: SourceRef) => `${r.kind}:${r.id}`;

export type SpeakerSide = "seller" | "buyer" | "unknown";

export type EvidenceDocument = {
  id: string;
  parent: SourceRef;
  text: string;
  textHash: string;
  speaker: string | null;
  speakerSide: SpeakerSide;
  occurredAt: string | null;
  /** True for the labeled sample conversation; never true for Graph8 records. */
  synthetic: boolean;
};

export type QuotePart = { id: string; path: string; text: string };

export type QuoteDocument = {
  quoteId: string;
  customerId: string | null;
  label: string;
  versionHash: string;
  parts: QuotePart[];
  textComplete: boolean;
  includedFields: string[];
  limitations: string[];
};

export const CATEGORIES = ["scope", "timeline", "support", "price", "other"] as const;
export const COVERAGES = ["covered", "missing", "conflict", "needs_review"] as const;
export type Coverage = (typeof COVERAGES)[number];

/** Exact model output contract (mirrors MODEL_OUTPUT_SCHEMA in prompt.ts). */
export const ModelOutputSchema = z.object({
  truncated: z.boolean(),
  findings: z.array(
    z.object({
      commitment: z.string().min(1).max(400),
      category: z.enum(CATEGORIES),
      coverage: z.enum(COVERAGES),
      reason: z.string().max(1200),
      conditions: z.array(z.string().max(400)).max(8),
      sales_evidence: z.array(z.object({ document_id: z.string(), excerpt: z.string().min(1).max(1500) })).min(1).max(6),
      quote_evidence: z.array(z.object({ part_id: z.string(), excerpt: z.string().min(1).max(1500) })).max(6),
      suggested_action: z.string().max(600),
    }),
  ),
});
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export const CitationSchema = z.object({
  documentId: z.string(),
  excerpt: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  commitment: z.string(),
  category: z.enum(CATEGORIES),
  coverage: z.enum(COVERAGES),
  /** Set when the server changed the model's verdict (e.g. incomplete quote text). */
  modelCoverage: z.enum(COVERAGES).nullable(),
  adjustment: z.string().nullable(),
  reason: z.string(),
  conditions: z.array(z.string()),
  salesEvidence: z.array(CitationSchema),
  quoteEvidence: z.array(CitationSchema),
  suggestedAction: z.string(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const HumanDecisionSchema = z.object({
  findingId: z.string(),
  decision: z.enum(["confirmed", "dismissed", "resolved"]),
  reason: z.string(),
  actorLabel: z.string(),
  at: z.string(),
});
export type HumanDecision = z.infer<typeof HumanDecisionSchema>;

export const RUN_STATES = ["preparing", "running", "completed", "failed", "start_unknown", "stale"] as const;
export type RunState = (typeof RUN_STATES)[number];

export const DocumentInfoSchema = z.object({
  source: z.string(),
  speaker: z.string().nullable(),
  side: z.enum(["seller", "buyer", "unknown"]),
  at: z.string().nullable(),
  synthetic: z.boolean(),
});

export const ReviewManifestSchema = z.object({
  schemaVersion: z.literal(1),
  app: z.literal("promiseguard"),
  mode: ModeSchema,
  revision: z.number().int().nonnegative(),
  requestId: z.string(),
  reviewTaskId: z.string(),
  dealId: z.string(),
  dealName: z.string(),
  quoteId: z.string(),
  quoteLabel: z.string(),
  sourceRefs: z.array(SourceRefSchema),
  sourceLabels: z.record(z.string(), z.string()),
  sourceHashes: z.record(z.string(), z.string()),
  quoteHash: z.string(),
  quoteTextComplete: z.boolean(),
  quoteIncludedFields: z.array(z.string()),
  promptVersion: z.string(),
  workflowId: z.string(),
  executionId: z.string().nullable(),
  runState: z.enum(RUN_STATES),
  runError: z.object({ code: z.string(), message: z.string() }).nullable(),
  report: z.array(FindingSchema).nullable(),
  rejected: z.array(z.object({ commitment: z.string(), reason: z.string() })),
  truncated: z.boolean(),
  documents: z.record(z.string(), DocumentInfoSchema),
  humanDecisions: z.array(HumanDecisionSchema),
  issueTaskIds: z.record(z.string(), z.string()),
  matchConfirmed: z.boolean(),
  coverageComplete: z.boolean(),
  coverageNotes: z.array(z.string()),
  previousReviewTaskId: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type ReviewManifest = z.infer<typeof ReviewManifestSchema>;

export type SummaryCounts = Record<Coverage, number>;

export function summarize(findings: Finding[]): SummaryCounts {
  const counts: SummaryCounts = { covered: 0, missing: 0, conflict: 0, needs_review: 0 };
  for (const f of findings) counts[f.coverage] += 1;
  return counts;
}
