import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { getDeal } from "@/lib/graph8/adapters/deals";
import { getQuote } from "@/lib/graph8/adapters/quotes";
import { listDeliveryOwners } from "@/lib/graph8/adapters/team";
import {
  createTask,
  getTask,
  listDealTasks,
  listDeliveryTasks,
  patchTask,
  type Task,
} from "@/lib/graph8/adapters/tasks";
import { quoteToDocument } from "./normalize";
import { env } from "@/lib/env";
import { openFindings } from "./gate-rules";
import { sha256 } from "./hash";
import { withLock } from "./lock";
import { assertDealMatchesMode } from "./mode";
import { getReviewView } from "./runs";
import { loadReview, listReviewSummaries, requireEditable } from "./repository";
import {
  deliveryDescription,
  deliveryState,
  parseDelivery,
  type DeliveryMarker,
  type DeliveryState,
} from "./delivery-schema";
import type { Mode } from "./schemas";

const TAG = "promiseguard-delivery";
function validMarker(task: Task) {
  const m = parseDelivery(task.description);
  if (
    !m ||
    !task.tags.includes(TAG) ||
    task.entityType !== "deal" ||
    task.entityId !== m.dealId ||
    task.parentTaskId
  ) {
    throw new AppRequestError(
      "not_delivery",
      "This task is not a PromiseGuard delivery obligation.",
      404,
    );
  }
  return m;
}
function row(task: Task, m: DeliveryMarker) {
  return {
    taskId: task.id,
    updatedAt: task.updatedAt,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    dueDate: task.dueDate,
    state: deliveryState(task.status, task.dueDate, Boolean(m.completion)),
    marker: m,
  };
}
export type DeliveryRow = ReturnType<typeof row>;

export async function deliveryBoard(mode: Mode) {
  const res = await listDeliveryTasks();
  const rows: DeliveryRow[] = [];
  for (const task of res.items) {
    try {
      const m = validMarker(task);
      if (m.mode === mode) rows.push(row(task, m));
    } catch {
      /* unrelated task */
    }
  }
  // Graph8 tasks carry assignee_id but often no assignee_name, so names come from the team list.
  const names = new Map(
    (await listDeliveryOwners().catch(() => [])).map((o) => [o.id, o.name]),
  );
  for (const r of rows)
    r.assigneeName ??= (r.assigneeId && names.get(r.assigneeId)) || null;
  const order: Record<DeliveryState, number> = {
    overdue: 0,
    needs_evidence: 1,
    open: 2,
    completed: 3,
  };
  rows.sort(
    (a, b) =>
      order[a.state] - order[b.state] ||
      (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
  );
  return { rows, partial: res.partial, mode };
}

export async function handoffContext(reviewId: string, mode: Mode) {
  const { manifest: m } = requireEditable(await loadReview(reviewId));
  if (m.mode !== mode)
    throw new AppRequestError(
      "mode_mismatch",
      "Switch to the review's mode to manage delivery.",
      409,
    );
  const deal = await getDeal(m.dealId);
  assertDealMatchesMode(deal, mode);
  const q = await getQuote(m.quoteId);
  const owners = await listDeliveryOwners();
  let reason: string | null = null;
  if (q.dealId !== m.dealId)
    reason = "The quote no longer belongs to this deal.";
  else if (mode === "live" && q.status !== "accepted")
    reason = "Delivery handoff opens when Graph8 marks this quote accepted.";
  else if (mode === "demo" && !["draft", "accepted"].includes(q.status ?? ""))
    reason = "Use a draft demo quote for the delivery rehearsal.";
  else if (
    m.runState !== "completed" ||
    !m.coverageComplete ||
    openFindings(m).length
  )
    reason =
      "Finish a complete review and resolve all open promise risks first.";
  else if (
    quoteToDocument(q, env().PROMISEGUARD_MAX_QUOTE_CHARS).versionHash !==
    m.quoteHash
  )
    reason = "The quote changed. Recheck before creating delivery work.";
  else {
    const latest = (await listReviewSummaries(m.dealId)).items.find(
      (r) =>
        r.quoteId === m.quoteId &&
        r.quoteHash === m.quoteHash &&
        r.runState === "completed",
    );
    if (latest?.taskId !== reviewId)
      reason =
        "Open the latest completed review of this quote version to create delivery work.";
    else if (
      (await getReviewView(reviewId, { checkFreshness: true })).freshness !==
      "current"
    )
      reason =
        "The review evidence is out of date or unavailable. Recheck first.";
  }
  const latestDecision = new Map(
    m.humanDecisions.map((d) => [d.findingId, d.decision]),
  );
  const findings = (m.report ?? []).filter(
    (f) => f.coverage === "covered" && latestDecision.get(f.id) !== "dismissed",
  );
  return { mode, quoteStatus: q.status, reason, owners, findings, manifest: m };
}

export async function createDelivery(
  reviewId: string,
  mode: Mode,
  input: {
    findingId: string;
    assigneeId: string;
    dueDate: string;
    scheduleReason: string;
    conditionsAcknowledged: true;
  },
) {
  return withLock(`handoff:${reviewId}`, async () => {
    const ctx = await handoffContext(reviewId, mode);
    if (ctx.reason)
      throw new AppRequestError("handoff_blocked", ctx.reason, 409);
    const f = ctx.findings.find((v) => v.id === input.findingId);
    if (!f)
      throw new AppRequestError(
        "finding_ineligible",
        "Only verified, covered promises can become delivery obligations.",
        422,
      );
    if (!ctx.owners.some((o) => o.id === input.assigneeId))
      throw new AppRequestError(
        "owner_invalid",
        "Choose a current Graph8 team member.",
        422,
      );
    const m = ctx.manifest;
    const hash = sha256({
      quote: m.quoteId,
      version: m.quoteHash,
      finding: f.id,
    });
    const key = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    const existing = (
      await listDealTasks(m.dealId, { search: key.slice(0, 8), limit: 100 })
    ).items.find(
      (t) => parseDelivery(t.description)?.key === key && t.tags.includes(TAG),
    );
    if (existing)
      return { row: row(existing, validMarker(existing)), reused: true };
    const marker: DeliveryMarker = {
      version: 1,
      key,
      mode,
      dealId: m.dealId,
      dealName: m.dealName,
      quoteId: m.quoteId,
      quoteLabel: m.quoteLabel,
      quoteHash: m.quoteHash,
      reviewTaskId: reviewId,
      findingId: f.id,
      commitment: f.commitment,
      conditions: f.conditions,
      salesEvidence: f.salesEvidence,
      quoteEvidence: f.quoteEvidence,
      scheduleReason: input.scheduleReason,
      createdAt: new Date().toISOString(),
      completion: null,
    };
    const prefix = mode === "demo" ? "[PromiseGuard Demo]" : "[PromiseGuard]";
    const task = await createTask(
      {
        title: `${prefix} Delivery: ${f.commitment.slice(0, 150)} [${key.slice(0, 8)}]`,
        description: deliveryDescription(marker),
        entity_type: "deal",
        entity_id: m.dealId,
        assignee_id: input.assigneeId,
        due_date: input.dueDate,
        priority: 2,
        tags: [TAG, ...(mode === "demo" ? ["promiseguard-demo"] : [])],
      },
      key,
    );
    return { row: row(task, validMarker(task)), reused: false };
  });
}

export async function completeDelivery(
  taskId: string,
  mode: Mode,
  evidence: string,
  expectedUpdatedAt: string,
) {
  return withLock(`delivery:${taskId}`, async () => {
    const task = await getTask(taskId);
    const m = validMarker(task);
    if (m.mode !== mode)
      throw new AppRequestError(
        "mode_mismatch",
        "Switch to the delivery task's mode.",
        409,
      );
    assertDealMatchesMode(await getDeal(m.dealId), mode);
    if (!task.updatedAt || task.updatedAt !== expectedUpdatedAt)
      throw new AppRequestError(
        "delivery_changed",
        "This task changed. Refresh before recording completion.",
        409,
      );
    if (task.status === "completed" && m.completion) return row(task, m);
    const next = {
      ...m,
      completion: { evidence, at: new Date().toISOString() },
    };
    const saved = await patchTask(
      task.id,
      { status: "completed", description: deliveryDescription(next) },
      task.updatedAt,
    );
    return row(saved, next);
  });
}
