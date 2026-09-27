import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// OpenAPI: GET /deals/{id}/notes -> { data: Note[] }; POST /deals/{id}/notes { content } -> { data: Note }.
// Verified 2026-09-26: an empty deal returns { data: [], pagination: null }.

const NoteDto = z.object({
  id: z.string(),
  entity_type: z.string().nullish(),
  entity_id: z.string().nullish(),
  content: z.string(),
  created_by: z.string().nullish(),
  created_by_name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type DealNote = {
  id: string;
  content: string;
  authorName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function toNote(n: z.infer<typeof NoteDto>): DealNote {
  return {
    id: n.id,
    content: n.content,
    authorName: n.created_by_name ?? null,
    createdAt: n.created_at ?? null,
    updatedAt: n.updated_at ?? n.created_at ?? null,
  };
}

export async function listDealNotes(dealId: string): Promise<DealNote[]> {
  const operation = "list deal notes";
  const json = await graph8.get(path`/deals/${dealId}/notes`, { operation });
  return parseResponse(
    z.object({ data: z.array(NoteDto) }),
    json,
    operation,
  ).data.map(toNote);
}

/** Not retried: a note with an uncertain outcome is reported, never written twice. */
export async function createDealNote(
  dealId: string,
  content: string,
): Promise<DealNote> {
  const operation = "create deal note";
  const json = await graph8.post(path`/deals/${dealId}/notes`, {
    operation,
    body: { content },
  });
  return toNote(
    parseResponse(z.object({ data: NoteDto }), json, operation).data,
  );
}
