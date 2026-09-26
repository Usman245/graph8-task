import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import type { Deal } from "@/lib/graph8/adapters/deals";
import { getEmailThread, getMeeting, listEmailThreads, listMeetingsForParticipant, type EmailThread } from "@/lib/graph8/adapters/inbox";
import { Graph8Error } from "@/lib/graph8/errors";
import { emailThreadToDocuments, meetingToDocuments, sampleToDocuments, type SideContext } from "./normalize";
import { SAMPLE_LABEL, SAMPLE_SELLER_DOMAIN, SAMPLE_SOURCES, type SampleSource } from "./sample-data";
import type { EvidenceDocument, Mode, SourceRef } from "./schemas";

export type SourceCandidate = {
  ref: SourceRef;
  kind: SourceRef["kind"];
  /** "Sample conversation", "Graph8 email", or "Graph8 meeting transcript". */
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
  /** Human-readable description of how far the bounded scan went. */
  coverage: string[];
  errors: string[];
};

const EMAIL_PAGES = 3;
const EMAIL_PAGE_SIZE = 50;
const MEETING_PAGE_SIZE = 25;
const MAX_CONTACTS_SCANNED = 5;

export function contactEmails(deal: Deal): string[] {
  return [...new Set(deal.contacts.map((c) => c.email).filter((e): e is string => Boolean(e)))];
}

export function sideContext(deal: Deal, mode: Mode): SideContext {
  const sellerDomains = [...env().sellerDomains];
  // The sample conversation's seller uses a reserved example domain; it is only honoured for sample evidence.
  if (mode === "demo" && !sellerDomains.includes(SAMPLE_SELLER_DOMAIN)) sellerDomains.push(SAMPLE_SELLER_DOMAIN);
  return { sellerDomains, buyerEmails: contactEmails(deal) };
}

function sampleMatches(source: SampleSource, deal: Deal): string[] {
  const emails = contactEmails(deal);
  return source.participants.filter((p) => emails.includes(p.toLowerCase()));
}

function threadParticipants(t: EmailThread): string[] {
  return [...new Set(t.messages.flatMap((m) => [m.from, ...m.to]).filter((e): e is string => Boolean(e)))];
}

export async function findSourceCandidates(deal: Deal, mode: Mode): Promise<CandidateScan> {
  const emails = contactEmails(deal);
  if (mode === "demo") {
    const candidates = SAMPLE_SOURCES.map((s): SourceCandidate | null => {
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
    }).filter((c): c is SourceCandidate => c !== null);
    return {
      candidates,
      coverage: ["Demo mode offers only the labeled sample conversation. No Graph8 inbox or meeting records are used."],
      errors: [],
    };
  }

  const candidates: SourceCandidate[] = [];
  const coverage: string[] = [];
  const errors: string[] = [];
  if (!emails.length) {
    return { candidates, coverage: ["This deal has no contact email addresses, so no sources can be matched."], errors };
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
          textAvailable: t.messages.some((m) => !m.isDraft && m.content.trim().length > 0),
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
        const participants = [...new Set([m.organizerEmail, ...m.attendees.map((a) => a.email)].filter((e): e is string => Boolean(e)))];
        candidates.push({
          ref: { kind: "meeting", id: m.id },
          kind: "meeting",
          originLabel: "Graph8 meeting transcript",
          title: m.subject || "(untitled meeting)",
          occurredAt: m.startTime,
          participants,
          matchedContacts: participants.filter((p) => emails.includes(p)),
          textAvailable: !m.transcriptRedacted,
          unavailableReason: m.transcriptRedacted ? "Transcript hidden by Graph8 permissions." : null,
          synthetic: false,
        });
      }
      if (res.hasNext) coverage.push(`Meetings for ${email}: showing the first ${MEETING_PAGE_SIZE}; more exist.`);
    } catch (err) {
      if (!(err instanceof Graph8Error)) throw err;
      errors.push(`Meetings for ${email} could not be read: ${err.message}`);
    }
  }
  if (emails.length > MAX_CONTACTS_SCANNED) coverage.push(`Meetings: checked the first ${MAX_CONTACTS_SCANNED} deal contacts only.`);
  coverage.push("Only sources with an exact contact email match are listed. Nothing is matched on names alone.");

  candidates.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  return { candidates, coverage, errors };
}

export type LoadedSource = { ref: SourceRef; label: string; documents: EvidenceDocument[] };

/** Re-fetch and authorize one source on the server. Sample evidence is refused outside Demo mode. */
export async function loadSource(deal: Deal, ref: SourceRef, mode: Mode): Promise<LoadedSource> {
  const emails = contactEmails(deal);
  const ctx = sideContext(deal, mode);

  if (ref.kind === "sample") {
    if (mode !== "demo") throw new AppRequestError("sample_in_live", "Sample evidence can never be used in a Live review.", 409);
    const source = SAMPLE_SOURCES.find((s) => s.id === ref.id);
    if (!source || !sampleMatches(source, deal).length) {
      throw new AppRequestError("source_unrelated", "This sample conversation does not involve the deal's contacts.", 409);
    }
    return { ref, label: `${SAMPLE_LABEL}: ${source.title.replace(/^Sample conversation:\s*/, "")}`, documents: sampleToDocuments(source, ctx) };
  }

  if (mode !== "live") throw new AppRequestError("live_in_demo", "Demo mode uses only the sample conversation.", 409);

  if (ref.kind === "email") {
    const thread = await getEmailThread(ref.id);
    if (!threadParticipants(thread).some((p) => emails.includes(p))) {
      throw new AppRequestError("source_unrelated", "This email thread does not include any of the deal's contacts.", 409);
    }
    const documents = emailThreadToDocuments(thread, ctx);
    if (!documents.length) throw new AppRequestError("source_empty", "This email thread has no readable message text.", 422);
    return { ref, label: `Graph8 email: ${thread.subject || "(no subject)"}`, documents };
  }

  const meeting = await getMeeting(ref.id);
  const participants = [meeting.organizerEmail, ...meeting.attendees.map((a) => a.email)];
  if (!participants.some((p) => p && emails.includes(p))) {
    throw new AppRequestError("source_unrelated", "This meeting does not include any of the deal's contacts.", 409);
  }
  if (meeting.transcriptRedacted) throw new AppRequestError("source_redacted", "This transcript is hidden by Graph8 permissions.", 403);
  const documents = meetingToDocuments(meeting, ctx);
  if (!documents.length) throw new AppRequestError("source_empty", "This meeting has no transcript text.", 422);
  return { ref, label: `Graph8 meeting: ${meeting.subject || "(untitled)"}`, documents };
}
