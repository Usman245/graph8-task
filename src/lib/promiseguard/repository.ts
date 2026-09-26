import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { createTask, getTask, listDealTasks, patchTask, type Task } from "@/lib/graph8/adapters/tasks";
import { Graph8Error } from "@/lib/graph8/errors";
import { REVIEW_TAG, buildDescription, manifestBytes, parseDescription, reviewTitle } from "./manifest";
import { summarize, type ReviewManifest, type SummaryCounts } from "./schemas";

export type LoadedReview = { task: Task; manifest: ReviewManifest | null; readOnlyReason: string | null };

const isReviewTask = (t: Task) => t.tags.includes("promiseguard-review") || /^\[PromiseGuard( Demo)?\] Review /.test(t.title);

/** Load a review task and validate that it is ours and consistent with its manifest. */
export async function loadReview(taskId: string): Promise<LoadedReview> {
  let task: Task;
  try {
    task = await getTask(taskId);
  } catch (err) {
    if (err instanceof Graph8Error && err.code === "not_found") {
      throw new AppRequestError("review_not_found", "This review task does not exist or is not accessible.", 404);
    }
    throw err;
  }
  if (!isReviewTask(task) || task.entityType !== "deal" || !task.entityId || task.parentTaskId) {
    throw new AppRequestError("not_a_review", "This Graph8 task is not a PromiseGuard review.", 404);
  }
  const parsed = parseDescription(task.description);
  if (!parsed.ok) {
    if (parsed.reason === "missing") throw new AppRequestError("not_a_review", parsed.message, 404);
    return { task, manifest: null, readOnlyReason: parsed.message };
  }
  const m = parsed.manifest;
  if (m.dealId !== task.entityId || (m.reviewTaskId && m.reviewTaskId !== task.id)) {
    throw new AppRequestError("manifest_mismatch", "The stored review does not match its Graph8 task.", 409);
  }
  return { task, manifest: m, readOnlyReason: null };
}

export function requireEditable(r: LoadedReview): { task: Task; manifest: ReviewManifest } {
  if (!r.manifest) throw new AppRequestError("read_only", r.readOnlyReason ?? "This review is read-only.", 409);
  return { task: r.task, manifest: r.manifest };
}

/**
 * Conditional save: Graph8 rejects with 409 if the task changed since `task.updatedAt`.
 * Refuses (rather than truncating) when the report exceeds the configured size limit.
 */
export async function saveManifest(task: Task, next: ReviewManifest): Promise<{ task: Task; manifest: ReviewManifest }> {
  const manifest: ReviewManifest = { ...next, reviewTaskId: task.id, revision: next.revision + 1 };
  const bytes = manifestBytes(manifest);
  if (bytes > env().PROMISEGUARD_MAX_REPORT_BYTES) {
    throw new AppRequestError(
      "report_too_large",
      `The review (${bytes} bytes) exceeds the storage limit. Select fewer sources and run a new comparison.`,
      413,
    );
  }
  const updated = await patchTask(task.id, { description: buildDescription(manifest) }, task.updatedAt);
  return { task: updated, manifest };
}

export async function createReviewTask(m: ReviewManifest): Promise<Task> {
  const tags = [REVIEW_TAG, "promiseguard-review", ...(m.mode === "demo" ? ["promiseguard-demo"] : [])];
  return createTask(
    { title: reviewTitle(m), description: buildDescription(m), entity_type: "deal", entity_id: m.dealId, priority: 3, tags },
    m.requestId,
  );
}

/** Find a review created for this exact request (duplicate submission or uncertain create). */
export async function findReviewByRequestId(dealId: string, requestId: string): Promise<LoadedReview | null> {
  const res = await listDealTasks(dealId, { search: requestId.slice(0, 8), limit: 50 });
  for (const task of res.items) {
    if (!isReviewTask(task)) continue;
    const parsed = parseDescription(task.description);
    if (parsed.ok && parsed.manifest.requestId === requestId && parsed.manifest.dealId === dealId) {
      return { task, manifest: parsed.manifest, readOnlyReason: null };
    }
  }
  return null;
}

export type ReviewSummary = {
  taskId: string;
  taskStatus: string | null;
  mode: ReviewManifest["mode"] | null;
  runState: ReviewManifest["runState"] | null;
  quoteLabel: string | null;
  sourceCount: number;
  createdAt: string | null;
  counts: SummaryCounts | null;
  readOnly: boolean;
};

export async function listReviewSummaries(dealId: string): Promise<{ items: ReviewSummary[]; partial: boolean }> {
  const res = await listDealTasks(dealId, { limit: 100 });
  const items: ReviewSummary[] = [];
  for (const task of res.items) {
    if (!isReviewTask(task) || task.parentTaskId) continue;
    const parsed = parseDescription(task.description);
    if (!parsed.ok && parsed.reason === "missing") continue;
    const m = parsed.ok ? parsed.manifest : null;
    items.push({
      taskId: task.id,
      taskStatus: task.status,
      mode: m?.mode ?? null,
      runState: m?.runState ?? null,
      quoteLabel: m?.quoteLabel ?? null,
      sourceCount: m?.sourceRefs.length ?? 0,
      createdAt: m?.createdAt ?? task.createdAt,
      counts: m?.report ? summarize(m.report) : null,
      readOnly: !m,
    });
  }
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return { items, partial: res.hasNext };
}
