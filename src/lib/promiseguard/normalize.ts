// Canonical evidence documents. The exact `text` built here is what the model sees and what
// every citation is verified against.

import type { EmailThread, Meeting } from "@/lib/graph8/adapters/inbox";
import type { DealMemory } from "@/lib/graph8/adapters/memory";
import type { DealNote } from "@/lib/graph8/adapters/notes";
import type { QuoteRecord } from "@/lib/graph8/adapters/quotes";
import { sha256 } from "./hash";
import type { SampleSource } from "./sample-data";
import type {
  EvidenceDocument,
  QuoteDocument,
  QuotePart,
  SourceRef,
  SpeakerSide,
} from "./schemas";

export type SideContext = {
  sellerDomains: string[];
  buyerEmails: string[];
};

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Server-side HTML to plain text. Output is displayed escaped; no markup survives. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = withBreaks.replace(
    /&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi,
    (m, name: string) => {
      const lower = name.toLowerCase();
      if (lower.startsWith("#x"))
        return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith("#") && lower !== "#39")
        return String.fromCodePoint(parseInt(lower.slice(1), 10));
      return ENTITIES[lower] ?? m;
    },
  );
  return normalizeText(decoded);
}

/** Drop quoted reply history ("On ... wrote:" and "> " lines) so earlier messages are not double-counted. */
function stripQuotedHistory(text: string): string {
  const lines = text.split("\n");
  const cut = lines.findIndex(
    (l) =>
      /^On .{4,200} wrote:\s*$/.test(l.trim()) ||
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(l.trim()),
  );
  const kept = (cut >= 0 ? lines.slice(0, cut) : lines).filter(
    (l) => !l.trimStart().startsWith(">"),
  );
  return normalizeText(kept.join("\n"));
}

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at > 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : null;
}

/** Seller only when the address matches a configured seller domain; buyer only for known deal contacts. */
function sideForEmail(
  email: string | null | undefined,
  ctx: SideContext,
): SpeakerSide {
  const lower = email?.trim().toLowerCase() ?? null;
  const domain = domainOf(lower);
  if (domain && ctx.sellerDomains.includes(domain)) return "seller";
  if (lower && ctx.buyerEmails.includes(lower)) return "buyer";
  return "unknown";
}

function doc(
  id: string,
  parent: SourceRef,
  text: string,
  speaker: string | null,
  speakerSide: SpeakerSide,
  occurredAt: string | null,
  synthetic: boolean,
): EvidenceDocument {
  const canonical = normalizeText(text);
  return {
    id,
    parent,
    text: canonical,
    textHash: sha256(canonical),
    speaker,
    speakerSide,
    occurredAt,
    synthetic,
  };
}

export function sampleToDocuments(
  source: SampleSource,
  ctx: SideContext,
): EvidenceDocument[] {
  const parent: SourceRef = { kind: "sample", id: source.id };
  return source.messages.map((m, i) =>
    doc(
      `sample:${source.id}:m${i + 1}`,
      parent,
      m.text,
      `${m.speakerName} <${m.speakerEmail}>`,
      sideForEmail(m.speakerEmail, ctx),
      source.occurredAt,
      true,
    ),
  );
}

export function emailThreadToDocuments(
  thread: EmailThread,
  ctx: SideContext,
): EvidenceDocument[] {
  const parent: SourceRef = { kind: "email", id: thread.id };
  return thread.messages
    .filter((m) => !m.isDraft)
    .map((m, i) => {
      const body = stripQuotedHistory(
        /<[a-z][\s\S]*>/i.test(m.content)
          ? htmlToText(m.content)
          : normalizeText(m.content),
      );
      return { m, i, body };
    })
    .filter(({ body }) => body.length > 0)
    .map(({ m, i, body }) =>
      doc(
        `email:${thread.id}:${m.messageId ?? `m${i + 1}`}`,
        parent,
        body,
        m.from,
        sideForEmail(m.from, ctx),
        m.date,
        false,
      ),
    );
}

const UTTERANCE =
  /^(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*[-–]?\s*)?([^:\n]{1,60}):\s+(.+)$/;

/** One document per speaker turn; speaker side comes only from attendee emails and is never guessed. */
export function meetingToDocuments(
  meeting: Meeting,
  ctx: SideContext,
): EvidenceDocument[] {
  const parent: SourceRef = { kind: "meeting", id: meeting.id };
  const text = normalizeText(meeting.transcriptText ?? "");
  if (!text) return [];
  const byName = new Map<string, string>();
  for (const a of meeting.attendees)
    if (a.name && a.email) byName.set(a.name.trim().toLowerCase(), a.email);

  const turns: Array<{ speaker: string | null; lines: string[] }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = UTTERANCE.exec(line.trim());
    const speaker = match ? match[1].trim() : null;
    const content = match ? match[2] : line.trim();
    const last = turns.at(-1);
    if (last && (speaker === null || speaker === last.speaker))
      last.lines.push(content);
    else turns.push({ speaker, lines: [content] });
  }
  return turns.map((t, i) => {
    const email = t.speaker
      ? (byName.get(t.speaker.toLowerCase()) ?? null)
      : null;
    const side = email ? sideForEmail(email, ctx) : "unknown";
    return doc(
      `meeting:${meeting.id}:t${i + 1}`,
      parent,
      t.lines.join("\n"),
      t.speaker,
      side,
      meeting.startTime,
      false,
    );
  });
}

/** Notes PromiseGuard itself writes (clarifications, override logs) are never evidence. */
export const PROMISEGUARD_NOTE_PREFIX = "[PromiseGuard]";
const isPromiseGuardNote = (content: string) =>
  content.trimStart().startsWith(PROMISEGUARD_NOTE_PREFIX);

/** Deal notes are written by the seller's team, so their author is on the seller side. */
export function noteToDocuments(note: DealNote): EvidenceDocument[] {
  const parent: SourceRef = { kind: "note", id: note.id };
  const text = /<[a-z][\s\S]*>/i.test(note.content)
    ? htmlToText(note.content)
    : normalizeText(note.content);
  if (!text || isPromiseGuardNote(text)) return [];
  const author = note.authorName
    ? `${note.authorName} (deal note)`
    : "Seller team (deal note)";
  return [
    doc(
      `note:${note.id}`,
      parent,
      text,
      author,
      "seller",
      note.createdAt,
      false,
    ),
  ];
}

/** One document per commitment Graph8 extracted from a meeting review. Side is never guessed. */
export function memoryToDocuments(
  dealId: string,
  memory: DealMemory,
): EvidenceDocument[] {
  const parent: SourceRef = { kind: "memory", id: dealId };
  return memory.reviews.flatMap((r) =>
    r.commitments.map((c, j) =>
      doc(
        `memory:${dealId}:${r.id}:c${j + 1}`,
        parent,
        c.text,
        `Graph8 meeting review${r.title ? `: ${r.title}` : ""}${c.owner ? ` (owner: ${c.owner})` : ""}`,
        c.side,
        r.occurredAt,
        false,
      ),
    ),
  );
}

export function sourceHash(docs: EvidenceDocument[]): string {
  return sha256(
    docs.map((d) => ({
      id: d.id,
      text: d.textHash,
      speaker: d.speaker,
      side: d.speakerSide,
      at: d.occurredAt,
    })),
  );
}

function money(minor: number | null, currency: string | null): string | null {
  if (minor == null) return null;
  return `${(minor / 100).toFixed(2)} ${currency ?? ""}`.trim();
}

/** Quote parts use only returned, customer-facing fields; attachments or truncation mark the text incomplete. */
export function quoteToDocument(
  q: QuoteRecord,
  maxChars: number,
): QuoteDocument {
  const parts: QuotePart[] = [];
  const included: string[] = [];
  const limitations: string[] = [];

  for (const li of q.lineItems) {
    const lines = [
      li.productName,
      li.description,
      li.quantity != null ? `Quantity: ${li.quantity}` : null,
      li.lineTotalMinor != null
        ? `Line total: ${money(li.lineTotalMinor, q.currency)}`
        : null,
      li.billingFrequency ? `Billing: ${li.billingFrequency}` : null,
    ].filter(Boolean);
    if (lines.length)
      parts.push({
        id: `quote:${q.id}:line:${li.id}`,
        path: `line_items[${li.id}]`,
        text: normalizeText(lines.join("\n")),
      });
  }
  if (q.lineItems.length) included.push("line items");

  if (q.termsContent?.trim()) {
    parts.push({
      id: `quote:${q.id}:field:terms_content`,
      path: "terms_content",
      text: normalizeText(q.termsContent),
    });
    included.push("terms");
  }
  if (q.publicNotes?.trim()) {
    parts.push({
      id: `quote:${q.id}:field:public_notes`,
      path: "public_notes",
      text: normalizeText(q.publicNotes),
    });
    included.push("public notes");
  }
  const contract = [
    q.contractStartDate
      ? `Contract start date: ${q.contractStartDate.slice(0, 10)}`
      : null,
    q.contractDuration ? `Contract duration: ${q.contractDuration}` : null,
    q.contractEndDate
      ? `Contract end date: ${q.contractEndDate.slice(0, 10)}`
      : null,
    q.paymentTerms ? `Payment terms: ${q.paymentTerms}` : null,
    q.totalMinor != null
      ? `Quote total: ${money(q.totalMinor, q.currency)}`
      : null,
  ].filter(Boolean);
  if (contract.length) {
    parts.push({
      id: `quote:${q.id}:field:contract`,
      path: "contract fields",
      text: contract.join("\n"),
    });
    included.push("contract fields");
  }

  let textComplete = parts.some(
    (p) => p.path === "terms_content" || p.path.startsWith("line_items"),
  );
  if (!textComplete)
    limitations.push("The quote has no scope text or line-item descriptions.");
  if (q.attachmentCount > 0) {
    textComplete = false;
    limitations.push(
      `The quote references ${q.attachmentCount} attached document(s) that PromiseGuard cannot read.`,
    );
  }

  let total = 0;
  const bounded: QuotePart[] = [];
  for (const p of parts) {
    if (total + p.text.length > maxChars) {
      textComplete = false;
      limitations.push(
        "Quote text exceeded the review size limit; some parts were not included.",
      );
      break;
    }
    total += p.text.length;
    bounded.push(p);
  }

  const label =
    [q.number, q.title].filter(Boolean).join(" · ") ||
    `Quote ${q.id.slice(0, 8)}`;
  return {
    quoteId: q.id,
    customerId: q.companyId,
    label,
    // Content-only: a status change (e.g. draft -> sent) does not make a comparison stale.
    versionHash: sha256({ parts: bounded, textComplete }),
    parts: bounded,
    textComplete,
    includedFields: included,
    limitations,
  };
}
