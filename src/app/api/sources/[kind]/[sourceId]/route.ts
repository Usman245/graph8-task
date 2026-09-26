import { ok } from "@/lib/api/result";
import { AppRequestError, withSession } from "@/lib/auth/guard";
import { getDeal } from "@/lib/graph8/adapters/deals";
import { currentMode } from "@/lib/promiseguard/mode";
import { SourceKindSchema } from "@/lib/promiseguard/schemas";
import { loadSource } from "@/lib/promiseguard/sources";

// Preview of one authorized source as plain text documents (rendered escaped by React).
export const GET = withSession(async (req, ctx: RouteContext<"/api/sources/[kind]/[sourceId]">) => {
  const { kind, sourceId } = await ctx.params;
  const parsedKind = SourceKindSchema.safeParse(kind);
  const dealId = new URL(req.url).searchParams.get("dealId");
  if (!parsedKind.success || !dealId) throw new AppRequestError("invalid_request", "Unknown source or missing deal.", 422);
  const deal = await getDeal(dealId);
  const loaded = await loadSource(deal, { kind: parsedKind.data, id: sourceId }, await currentMode());
  return ok({
    label: loaded.label,
    synthetic: loaded.ref.kind === "sample",
    documents: loaded.documents.map((d) => ({ id: d.id, speaker: d.speaker, speakerSide: d.speakerSide, occurredAt: d.occurredAt, text: d.text })),
  });
});
