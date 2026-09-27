import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import type { Deal } from "@/lib/graph8/adapters/deals";
import {
  getEmailThread,
  getMeeting,
  listEmailThreads,
  listMeetingsForParticipant,
  type EmailThread,
} from "@/lib/graph8/adapters/inbox";
import { getDealMemory } from "@/lib/graph8/adapters/memory";
import { listDealNotes } from "@/lib/graph8/adapters/notes";
import { Graph8Error } from "@/lib/graph8/errors";
import {
  emailThreadToDocuments,
  htmlToText,
  meetingToDocuments,
  memoryToDocuments,
  noteToDocuments,
  sampleToDocuments,
  type SideContext,
} from "./normalize";
import {
  SAMPLE_LABEL,
  SAMPLE_SELLER_DOMAIN,
  SAMPLE_SOURCES,
  SCOPE_SAMPLE_SOURCES,
  type SampleSource,
} from "./sample-data";
import type { EvidenceDocument, Mode, SourceRef } from "./schemas";

export type SourceCandidate = {
  ref: SourceRef;
  kind: SourceRef["kind"];
  originLabel: string;
  title: string;
  occurredAt: string | null;
  participants: string[];
  matchedContacts: string[];
  textAvailable: boolean;
  unavailableReason: string | null;
  synthetic: boolean;
};

export type CandidateScan = {
  candidates: SourceCandidate[];
  coverage: string[];
  errors: string[];
};

const EMAIL_PAGES = 3;
const EMAIL_PAGE_SIZE = 50;
const MEETING_PAGE_SIZE = 25;
const MAX_CONTACTS_SCANNED = 5;

/** Reviews use the before-signing sample pool; the scope check uses the after-signing pool. Live sources are shared. */
type SourcePurpose = "review" | "scope";
const samplePool = (purpose: SourcePurpose) =>
  purpose === "scope" ? SCOPE_SAMPLE_SOURCES : SAMPLE_SOURCES;

function contactEmails(deal: Deal): string[] {
  return [
    ...new Set(
      deal.contacts.map((c) => c.email).filter((e): e is string => Boolean(e)),
    ),
  ];
}

function sideContext(deal: Deal, mode: Mode): SideContext {
  const sellerDomains = [...env().sellerDomains];
  // The sample conversation's seller uses a reserved example domain; it is only honoured for sample evidence.
  if (mode === "demo" && !sellerDomains.includes(SAMPLE_SELLER_DOMAIN))
    sellerDomains.push(SAMPLE_SELLER_DOMAIN);
  return { sellerDomains, buyerEmails: contactEmails(deal) };
}

function sampleMatches(source: SampleSource, deal: Deal): string[] {
  const emails = contactEmails(deal);
  return source.participants.filter((p) => emails.includes(p.toLowerCase()));
}

function threadParticipants(t: EmailThread): string[] {
  return [
    ...new Set(
      t.messages
        .flatMap((m) => [m.from, ...m.to])
        .filter((e): e is string => Boolean(e)),
    ),
  ];
}

export async function findSourceCandidates(
  deal: Deal,
  mode: Mode,
  purpose: SourcePurpose = "review",
): Promise<CandidateScan> {
  const emails = contactEmails(deal);
  if (mode === "demo") {
    const candidates = samplePool(purpose)
      .map((s): SourceCandidate | null => {
        const matched = sampleMatches(s, deal);
        if (!matched.length) return null;
        return {
          ref: { kind: "sample", id: s.id },
          kind: "sample",
          originLabel: SAMPLE_LABEL,
          title: s.title,
          occurredAt: s.occurredAt,
          participants: s.participants,
          matchedContacts: matched,
          textAvailable: true,
          unavailableReason: null,
          synthetic: true,
        };
      })
      .filter((c): c is SourceCandidate => c !== null);
    return {
      candidates,
      coverage: [
        "Demo mode offers only the labeled sample conversation. No Graph8 inbox or meeting records are used.",
      ],
      errors: [],
    };
  }

  const candidates: SourceCandidate[] = [];
  const coverage: string[] = [];
  const errors: string[] = [];

  // Deal notes and deal memory are attached to the deal itself, so they need no contact matching.
  await scanDealRecords(deal, candidates, coverage, errors);

  if (!emails.length) {
    coverage.push(
      "This deal has no contact email addresses, so no emails or meetings can be matched.",
    );
    candidates.sort((a, b) =>
      (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
    );
    return { candidates, coverage, errors };
  }

  // Email: bounded scan of recent inbox pages, matched on exact participant addresses only.
  try {
    let page = 1;
    let hasNext = true;
    let scanned = 0;
    while (hasNext && page <= EMAIL_PAGES) {
      const res = await listEmailThreads(page, EMAIL_PAGE_SIZE);
      scanned += res.items.length;
      for (const t of res.items) {
        const participants = threadParticipants(t);
        const matched = participants.filter((p) => emails.includes(p));
        if (!matched.length) continue;
        candidates.push({
          ref: { kind: "email", id: t.id },
          kind: "email",
          originLabel: "Graph8 email",
          title: t.subject || "(no subject)",
          occurredAt: t.updatedAt,
          participants,
          matchedContacts: matched,
          textAvailable: t.messages.some(
            (m) => !m.isDraft && m.content.trim().length > 0,
          ),
          unavailableReason: null,
          synthetic: false,
        });
      }
      hasNext = res.hasNext;
      page += 1;
    }
    coverage.push(
      hasNext
        ? `Email: scanned the ${scanned} most recent inbox threads; older threads were not checked.`
        : `Email: scanned all ${scanned} inbox thread(s).`,
    );
  } catch (err) {
    if (!(err instanceof Graph8Error)) throw err;
    errors.push(`Email could not be scanned: ${err.message}`);
  }

  // Meetings: Graph8 filters by participant email and transcript availability.
  const seen = new Set<string>();
  for (const email of emails.slice(0, MAX_CONTACTS_SCANNED)) {
    try {
      const res = await listMeetingsForParticipant(email, 1, MEETING_PAGE_SIZE);
      for (const m of res.items) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const participants = [
          ...new Set(
            [m.organizerEmail, ...m.attendees.map((a) => a.email)].filter(
              (e): e is string => Boolean(e),
            ),
          ),
        ];
        candidates.push({
          ref: { kind: "meeting", id: m.id },
          kind: "meeting",
          originLabel: "Graph8 meeting transcript",
          title: m.subject || "(untitled meeting)",
          occurredAt: m.startTime,
          participants,
          matchedContacts: participants.filter((p) => emails.includes(p)),
          textAvailable: !m.transcriptRedacted,
          unavailableReason: m.transcriptRedacted
            ? "Transcript hidden by Graph8 permissions."
            : null,
          synthetic: false,
        });
      }
      if (res.hasNext)
        coverage.push(
          `Meetings for ${email}: showing the first ${MEETING_PAGE_SIZE}; more exist.`,
        );
    } catch (err) {
      if (!(err instanceof Graph8Error)) throw err;
      errors.push(`Meetings for ${email} could not be read: ${err.message}`);
    }
  }
  if (emails.length > MAX_CONTACTS_SCANNED)
    coverage.push(
      `Meetings: checked the first ${MAX_CONTACTS_SCANNED} deal contacts only.`,
    );
  coverage.push(
    "Emails and meetings are listed only with an exact contact email match. Nothing is matched on names alone.",
  );

  candidates.sort((a, b) =>
    (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
  );
  return { candidates, coverage, errors };
}

async function scanDealRecords(
  deal: Deal,
  candidates: SourceCandidate[],
  coverage: string[],
  errors: string[],
) {
  try {
    const notes = (await listDealNotes(deal.id)).filter(
      (n) => noteToDocuments(n).length > 0,
    );
    for (const n of notes) {
      candidates.push({
        ref: { kind: "note", id: n.id },
        kind: "note",
        originLabel: "Graph8 deal note",
        title: noteTitle(n.content),
        occurredAt: n.createdAt,
        participants: n.authorName ? [n.authorName] : [],
        matchedContacts: ["attached to this deal"],
        textAvailable: true,
        unavailableReason: null,
        synthetic: false,
      });
    }
    coverage.push(
      `Deal notes: ${notes.length} note(s) on this deal (PromiseGuard's own notes are excluded).`,
    );
  } catch (err) {
    if (!(err instanceof Graph8Error)) throw err;
    errors.push(`Deal notes could not be read: ${err.message}`);
  }

  try {
    const memory = await getDealMemory(deal.id);
    const count = memory.reviews.reduce((n, r) => n + r.commitments.length, 0);
    if (count > 0) {
      const latest =
        memory.reviews
          .map((r) => r.occurredAt)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;
      candidates.push({
        ref: { kind: "memory", id: deal.id },
        kind: "memory",
        originLabel: "Graph8 deal memory",
        title: `Commitments from ${memory.reviews.length} meeting review(s) (${count} item(s))`,
        occurredAt: latest,
        participants: [],
        matchedContacts: ["attached to this deal"],
        textAvailable: true,
        unavailableReason: null,
        synthetic: false,
      });
    }
    coverage.push(
      count > 0
        ? `Deal memory: ${count} commitment(s) Graph8 extracted from ${memory.reviewCount} meeting review(s). These are AI summaries, not verbatim quotes.`
        : `Deal memory: Graph8 has ${memory.reviewCount} meeting review(s) for this deal and no extracted commitments.`,
    );
  } catch (err) {
    if (!(err instanceof Graph8Error)) throw err;
    errors.push(`Deal memory could not be read: ${err.message}`);
  }
}

function noteTitle(content: string): string {
  const first =
    (/<[a-z][\s\S]*>/i.test(content) ? htmlToText(content) : content)
      .split("\n")
      .find((l) => l.trim()) ?? "";
  return `Deal note: ${first.trim().slice(0, 80)}${first.trim().length > 80 ? "…" : ""}`;
}

export type LoadedSource = {
  ref: SourceRef;
  label: string;
  documents: EvidenceDocument[];
};

/** Re-fetch and authorize one source on the server. Sample evidence is refused outside Demo mode. */
export async function loadSource(
  deal: Deal,
  ref: SourceRef,
  mode: Mode,
  purpose: SourcePurpose = "review",
): Promise<LoadedSource> {
  const emails = contactEmails(deal);
  const ctx = sideContext(deal, mode);

  if (ref.kind === "sample") {
    if (mode !== "demo")
      throw new AppRequestError(
        "sample_in_live",
        "Sample evidence can never be used in a Live review.",
        409,
      );
    const source = samplePool(purpose).find((s) => s.id === ref.id);
    if (!source || !sampleMatches(source, deal).length) {
      throw new AppRequestError(
        "source_unrelated",
        "This sample conversation does not involve the deal's contacts.",
        409,
      );
    }
    return {
      ref,
      label: `${SAMPLE_LABEL}: ${source.title.replace(/^Sample conversation:\s*/, "")}`,
      documents: sampleToDocuments(source, ctx),
    };
  }

  if (mode !== "live")
    throw new AppRequestError(
      "live_in_demo",
      "Demo mode uses only the sample conversation.",
      409,
    );

  if (ref.kind === "note") {
    // Listed through the deal, so a note from another deal can never be loaded by ID.
    const note = (await listDealNotes(deal.id)).find((n) => n.id === ref.id);
    if (!note)
      throw new AppRequestError(
        "source_unrelated",
        "This note is not attached to the deal.",
        409,
      );
    const documents = noteToDocuments(note);
    if (!documents.length)
      throw new AppRequestError(
        "source_empty",
        "This note has no usable text.",
        422,
      );
    return {
      ref,
      label: `Graph8 deal note${note.authorName ? ` by ${note.authorName}` : ""}`,
      documents,
    };
  }

  if (ref.kind === "memory") {
    if (ref.id !== deal.id)
      throw new AppRequestError(
        "source_unrelated",
        "Deal memory belongs to a different deal.",
        409,
      );
    const documents = memoryToDocuments(deal.id, await getDealMemory(deal.id));
    if (!documents.length)
      throw new AppRequestError(
        "source_empty",
        "Graph8 has no extracted commitments for this deal.",
        422,
      );
    return {
      ref,
      label: "Graph8 deal memory (AI summary of meeting reviews)",
      documents,
    };
  }

  if (ref.kind === "email") {
    const thread = await getEmailThread(ref.id);
    if (!threadParticipants(thread).some((p) => emails.includes(p))) {
      throw new AppRequestError(
        "source_unrelated",
        "This email thread does not include any of the deal's contacts.",
        409,
      );
    }
    const documents = emailThreadToDocuments(thread, ctx);
    if (!documents.length)
      throw new AppRequestError(
        "source_empty",
        "This email thread has no readable message text.",
        422,
      );
    return {
      ref,
      label: `Graph8 email: ${thread.subject || "(no subject)"}`,
      documents,
    };
  }

  const meeting = await getMeeting(ref.id);
  const participants = [
    meeting.organizerEmail,
    ...meeting.attendees.map((a) => a.email),
  ];
  if (!participants.some((p) => p && emails.includes(p))) {
    throw new AppRequestError(
      "source_unrelated",
      "This meeting does not include any of the deal's contacts.",
      409,
    );
  }
  if (meeting.transcriptRedacted)
    throw new AppRequestError(
      "source_redacted",
      "This transcript is hidden by Graph8 permissions.",
      403,
    );
  const documents = meetingToDocuments(meeting, ctx);
  if (!documents.length)
    throw new AppRequestError(
      "source_empty",
      "This meeting has no transcript text.",
      422,
    );
  return {
    ref,
    label: `Graph8 meeting: ${meeting.subject || "(untitled)"}`,
    documents,
  };
}
