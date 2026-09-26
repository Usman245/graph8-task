import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// GET /deals/{id}/memory: "Everything the meetings on this deal established: people, pains, commitments, risks."
// Observed 2026-09-26 (no meetings yet): { data: { deal_id, review_count, average_score, reviews: [] } }.
// Review items are an open shape in the OpenAPI schema, so commitments are extracted defensively and only
// from fields whose names say they are commitments. Nothing else in the memory is used as evidence.

const MemoryDto = z.object({
  data: z
    .object({
      deal_id: z.string().nullish(),
      review_count: z.number().nullish(),
      reviews: z.array(z.record(z.string(), z.unknown())).nullish(),
    })
    .passthrough(),
});

export type MemoryCommitment = {
  text: string;
  /** "seller" only when Graph8 labels the owner as our side; otherwise unknown. */
  side: "seller" | "buyer" | "unknown";
  owner: string | null;
};

export type MemoryReview = {
  id: string;
  title: string | null;
  occurredAt: string | null;
  commitments: MemoryCommitment[];
};

export type DealMemory = { reviewCount: number; reviews: MemoryReview[] };

const COMMITMENT_KEYS = /^(commitments?|promises?|seller_commitments|our_commitments|agreed_next_steps|next_steps|action_items)$/i;
const TEXT_KEYS = ["commitment", "text", "description", "content", "summary", "title", "item"];
const OWNER_KEYS = ["owner", "side", "by", "made_by", "speaker", "party", "owner_side"];
const SELLER_WORDS = /^(seller|us|we|our side|rep|sales|internal|vendor|agency|host)$/i;
const BUYER_WORDS = /^(buyer|them|they|customer|client|prospect|external|attendee)$/i;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function toCommitment(item: unknown): MemoryCommitment | null {
  if (typeof item === "string") return item.trim() ? { text: item.trim(), side: "unknown", owner: null } : null;
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const text = TEXT_KEYS.map((k) => str(rec[k])).find(Boolean);
  if (!text) return null;
  const owner = OWNER_KEYS.map((k) => str(rec[k])).find(Boolean) ?? null;
  const side = owner && SELLER_WORDS.test(owner) ? "seller" : owner && BUYER_WORDS.test(owner) ? "buyer" : "unknown";
  return { text, side, owner };
}

function collect(value: unknown, depth: number, out: MemoryCommitment[]) {
  if (!value || typeof value !== "object" || depth > 3) return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (COMMITMENT_KEYS.test(key) && Array.isArray(v)) {
      for (const item of v) {
        const c = toCommitment(item);
        if (c) out.push(c);
      }
    } else if (v && typeof v === "object" && !Array.isArray(v)) collect(v, depth + 1, out);
  }
}

export async function getDealMemory(dealId: string): Promise<DealMemory> {
  const operation = "read deal memory";
  const json = await graph8.get(path`/deals/${dealId}/memory`, { operation });
  const data = parseResponse(MemoryDto, json, operation).data;
  const reviews = (data.reviews ?? []).map((r, i): MemoryReview => {
    const commitments: MemoryCommitment[] = [];
    collect(r, 0, commitments);
    return {
      id: str(r.id) ?? str(r.transcript_id) ?? str(r.meeting_id) ?? `r${i + 1}`,
      title: str(r.title) ?? str(r.meeting_title) ?? str(r.subject),
      occurredAt: str(r.meeting_date) ?? str(r.start_time) ?? str(r.created_at),
      commitments,
    };
  });
  return { reviewCount: data.review_count ?? reviews.length, reviews };
}
