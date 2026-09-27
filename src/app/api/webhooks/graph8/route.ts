import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { env } from "@/lib/env";
import { alertIfSentWithGaps, settleThenReview } from "@/lib/promiseguard/guard";

// Public Graph8 webhook receiver (the only route without a session). Authenticated by the secret token in
// the registered URL. The payload is only a hint: the quote is always re-read from Graph8 before acting,
// so a forged event can at most trigger a review of a real quote. Responds quickly; work runs afterwards.

const MAX_BYTES = 256_000;

// Background work runs in after(): the quiet-period wait, the review start, and a bounded finalize watcher.
export const maxDuration = 60;

function tokenMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function parseEvent(payload: unknown, headerEvent: string | null): { event: string | null; quoteId: string | null } {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data = (p.data && typeof p.data === "object" ? p.data : {}) as Record<string, unknown>;
  const nested = (data.quote && typeof data.quote === "object" ? data.quote : data.object && typeof data.object === "object" ? data.object : {}) as Record<string, unknown>;
  const event = headerEvent ?? str(p.event) ?? str(p.type) ?? str(p.event_type);
  const quoteId = str(data.quote_id) ?? str(nested.id) ?? str(p.quote_id) ?? (event?.startsWith("quote.") ? str(data.id) ?? str(p.resource_id) ?? str(p.id) : null);
  return { event, quoteId };
}

export async function POST(req: Request) {
  const expected = env().PROMISEGUARD_WEBHOOK_TOKEN;
  if (!expected) return Response.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  if (!tokenMatches(new URL(req.url).searchParams.get("token"), expected)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { event, quoteId } = parseEvent(payload, req.headers.get("x-graph8-event") ?? req.headers.get("x-webhook-event"));
  if (!event || !quoteId) {
    // Shape diagnostics only: top-level keys, never values.
    const keys = payload && typeof payload === "object" ? Object.keys(payload as object).join(",") : typeof payload;
    console.warn(`[promiseguard] webhook ignored: event=${event ?? "?"} keys=${keys}`);
    return Response.json({ ok: true, handled: false });
  }

  if (event === "quote.created" || event === "quote.updated") after(() => settleThenReview(quoteId, event));
  else if (event === "quote.sent" || event === "quote.resent") after(() => alertIfSentWithGaps(quoteId));
  else return Response.json({ ok: true, handled: false });

  return Response.json({ ok: true, handled: true, event });
}
