import { z } from "zod";
import { ModeSchema, CitationSchema } from "./schemas";

export const DeliveryMarkerSchema = z.object({
  version: z.literal(1),
  key: z.string(),
  mode: ModeSchema,
  dealId: z.string(),
  dealName: z.string(),
  quoteId: z.string(),
  quoteLabel: z.string(),
  quoteHash: z.string(),
  reviewTaskId: z.string(),
  findingId: z.string(),
  commitment: z.string(),
  conditions: z.array(z.string()),
  salesEvidence: z.array(CitationSchema),
  quoteEvidence: z.array(CitationSchema),
  scheduleReason: z.string(),
  createdAt: z.string(),
  completion: z.object({ evidence: z.string(), at: z.string() }).nullable(),
});
export type DeliveryMarker = z.infer<typeof DeliveryMarkerSchema>;

export const CreateDeliveryBody = z
  .object({
    findingId: z.string().min(1).max(200),
    assigneeId: z.string().min(1).max(100),
    dueDate: z.iso.date(),
    scheduleReason: z.string().trim().min(10).max(1000),
    conditionsAcknowledged: z.literal(true),
  })
  .strict();
export const CompleteDeliveryBody = z
  .object({
    evidence: z.string().trim().min(10).max(2000),
    expectedUpdatedAt: z.string().min(1).max(100),
  })
  .strict();

const MARKER = "PG_DELIVERY_V1:";
export function deliveryDescription(m: DeliveryMarker): string {
  return [
    m.mode === "demo"
      ? "PromiseGuard DEMO delivery rehearsal (not an accepted contract)."
      : "PromiseGuard accepted-quote delivery obligation.",
    `Promise: ${m.commitment}`,
    `Quote: ${m.quoteLabel}`,
    `Review task: ${m.reviewTaskId}`,
    ...m.conditions.map((c) => `Condition: ${c}`),
    `Scheduling decision: ${m.scheduleReason}`,
    ...m.salesEvidence.map(
      (c) => `Sales evidence (${c.documentId}): ${c.excerpt}`,
    ),
    ...m.quoteEvidence.map(
      (c) => `Quote evidence (${c.documentId}): ${c.excerpt}`,
    ),
    ...(m.completion
      ? [`Completion recorded ${m.completion.at}: ${m.completion.evidence}`]
      : []),
    "Completion evidence is a reviewer record, not independent verification of delivery.",
    `${MARKER}${JSON.stringify(m)}`,
  ].join("\n\n");
}
export function parseDelivery(description: string): DeliveryMarker | null {
  const line = description.split("\n").find((v) => v.startsWith(MARKER));
  if (!line) return null;
  try {
    const p = DeliveryMarkerSchema.safeParse(
      JSON.parse(line.slice(MARKER.length)),
    );
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export const DELIVERY_STATES = [
  "overdue",
  "open",
  "completed",
  "needs_evidence",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export function deliveryState(
  status: string | null,
  dueDate: string | null,
  hasEvidence: boolean,
  now = new Date(),
): DeliveryState {
  if (status === "completed")
    return hasEvidence ? "completed" : "needs_evidence";
  if (dueDate && dueDate.slice(0, 10) < now.toISOString().slice(0, 10))
    return "overdue";
  return "open";
}
