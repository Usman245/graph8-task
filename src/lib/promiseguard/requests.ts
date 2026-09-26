import { z } from "zod";
import { ModeSchema, SourceRefSchema } from "./schemas";

// Request bodies for internal routes. The browser sends IDs and decisions only, never evidence text.

export const StartReviewBody = z
  .object({
    dealId: z.string().min(1).max(100),
    quoteId: z.string().min(1).max(100),
    sourceRefs: z.array(SourceRefSchema).min(1).max(10),
    matchConfirmed: z.boolean(),
    requestId: z.uuid(),
    mode: ModeSchema,
  })
  .strict();

export const DecisionBody = z
  .object({
    decision: z.enum(["confirmed", "dismissed", "resolved"]),
    reason: z.string().max(1000),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const AssignBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    assigneeId: z.string().max(100).nullable(),
    dueDate: z.iso.date().nullable(),
    priority: z.number().int().min(0).max(4),
    requestId: z.uuid(),
  })
  .strict();

export const IssueUpdateBody = z
  .object({
    reviewTaskId: z.string().min(1).max(100),
    requestedStatus: z.enum(["open", "completed"]),
    resolution: z.string().max(1000),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();

export const RecheckBody = z.object({ requestId: z.uuid() }).strict();

export const ModeBody = z.object({ mode: ModeSchema }).strict();
