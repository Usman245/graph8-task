import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// Email and meeting adapters follow the OpenAPI response schemas. The demo workspace has no
// inbox or meeting records yet, so these shapes are documented but not yet observed live.

const EmailMessageDto = z.object({
  message_id: z.string().nullish(),
  from_address: z.string().nullish(),
  to_addresses: z.array(z.string()).nullish(),
  content: z.string().nullish(),
  responder: z.string().nullish(),
  date: z.string().nullish(),
  is_draft: z.boolean().nullish(),
});

const EmailThreadDto = z.object({
  id: z.union([z.string(), z.number()]),
  channel: z.string().nullish(),
  subject: z.string().nullish(),
  contact: z.record(z.string(), z.unknown()).nullish(),
  messages: z.array(EmailMessageDto).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const PageEnvelope = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  has_next: z.boolean(),
});

export type EmailMessage = {
  messageId: string | null;
  from: string | null;
  to: string[];
  content: string;
  responder: string | null;
  date: string | null;
  isDraft: boolean;
};

export type EmailThread = {
  id: string;
  subject: string | null;
  updatedAt: string | null;
  messages: EmailMessage[];
};

function toThread(t: z.infer<typeof EmailThreadDto>): EmailThread {
  return {
    id: String(t.id),
    subject: t.subject ?? null,
    updatedAt: t.updated_at ?? t.created_at ?? null,
    messages: (t.messages ?? []).map((m) => ({
      messageId: m.message_id ?? null,
      from: m.from_address?.toLowerCase() ?? null,
      to: (m.to_addresses ?? []).map((a) => a.toLowerCase()),
      content: m.content ?? "",
      responder: m.responder ?? null,
      date: m.date ?? null,
      isDraft: Boolean(m.is_draft),
    })),
  };
}

export async function listEmailThreads(page: number, pageSize: number) {
  const operation = "list email inbox";
  const json = await graph8.get("/inbox", {
    operation,
    query: { channel: "email", page, page_size: pageSize },
  });
  const res = parseResponse(
    z.object({
      data: z.array(EmailThreadDto),
      pagination: PageEnvelope.nullish(),
    }),
    json,
    operation,
  );
  return {
    items: res.data.map(toThread),
    hasNext: res.pagination?.has_next ?? false,
    total: res.pagination?.total ?? res.data.length,
  };
}

export async function getEmailThread(replyId: string): Promise<EmailThread> {
  const operation = "read email thread";
  const json = await graph8.get(path`/inbox/${replyId}`, {
    operation,
    query: { channel: "email" },
  });
  return toThread(
    parseResponse(z.object({ data: EmailThreadDto }), json, operation).data,
  );
}

const AttendeeDto = z.object({
  email: z.string().nullish(),
  name: z.string().nullish(),
  organizer: z.boolean().nullish(),
});

const MeetingDto = z.object({
  id: z.union([z.string(), z.number()]),
  subject: z.string().nullish(),
  organizer_email: z.string().nullish(),
  start_time: z.string().nullish(),
  attendees: z.array(AttendeeDto).nullish(),
  transcript_status: z.string().nullish(),
  transcript_id: z.string().nullish(),
  transcript_text: z.string().nullish(),
  transcript_redacted: z.boolean().nullish(),
  is_internal_only: z.boolean().nullish(),
  updated_at: z.string().nullish(),
});

export type Meeting = {
  id: string;
  subject: string | null;
  startTime: string | null;
  organizerEmail: string | null;
  attendees: Array<{ email: string | null; name: string | null }>;
  transcriptStatus: string | null;
  transcriptText: string | null;
  transcriptRedacted: boolean;
  internalOnly: boolean;
  updatedAt: string | null;
};

function toMeeting(m: z.infer<typeof MeetingDto>): Meeting {
  return {
    id: String(m.id),
    subject: m.subject ?? null,
    startTime: m.start_time ?? null,
    organizerEmail: m.organizer_email?.toLowerCase() ?? null,
    attendees: (m.attendees ?? []).map((a) => ({
      email: a.email?.toLowerCase() ?? null,
      name: a.name ?? null,
    })),
    transcriptStatus: m.transcript_status ?? null,
    transcriptText: m.transcript_text ?? null,
    transcriptRedacted: Boolean(m.transcript_redacted),
    internalOnly: Boolean(m.is_internal_only),
    updatedAt: m.updated_at ?? null,
  };
}

export async function listMeetingsForParticipant(
  email: string,
  page: number,
  pageSize: number,
) {
  const operation = "list meetings";
  const json = await graph8.get("/inbox/meetings", {
    operation,
    query: {
      participant_email: email,
      has_transcript: true,
      page,
      page_size: pageSize,
    },
  });
  const res = parseResponse(
    z.object({ data: z.array(MeetingDto), pagination: PageEnvelope.nullish() }),
    json,
    operation,
  );
  return {
    items: res.data.map(toMeeting),
    hasNext: res.pagination?.has_next ?? false,
    total: res.pagination?.total ?? res.data.length,
  };
}

export async function getMeeting(meetingId: string): Promise<Meeting> {
  const operation = "read meeting";
  const json = await graph8.get(path`/inbox/meetings/${meetingId}`, {
    operation,
  });
  return toMeeting(
    parseResponse(z.object({ data: MeetingDto }), json, operation).data,
  );
}
