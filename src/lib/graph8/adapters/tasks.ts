import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// Verified 2026-09-26: descriptions round-trip exactly up to at least 48 KB; PATCH honours
// expected_updated_at (409 when stale); subtasks link via parent_task_id and are NOT returned by
// the top-level list, only by GET /tasks/{id}/subtasks -> { data: { items } }.

const TaskDto = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  entity_type: z.string().nullish(),
  entity_id: z.string().nullish(),
  status: z.string().nullish(),
  priority: z.number().nullish(),
  due_date: z.string().nullish(),
  assignee_id: z.string().nullish(),
  assignee_name: z.string().nullish(),
  parent_task_id: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type Task = {
  id: string;
  title: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  status: string | null;
  priority: number | null;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  parentTaskId: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

function toTask(t: z.infer<typeof TaskDto>): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    entityType: t.entity_type ?? null,
    entityId: t.entity_id ?? null,
    status: t.status ?? null,
    priority: t.priority ?? null,
    dueDate: t.due_date ?? null,
    assigneeId: t.assignee_id ?? null,
    assigneeName: t.assignee_name ?? null,
    parentTaskId: t.parent_task_id ?? null,
    tags: t.tags ?? [],
    createdAt: t.created_at ?? null,
    updatedAt: t.updated_at ?? null,
  };
}

const One = z.object({ data: TaskDto });

export type TaskCreate = {
  title: string;
  description: string;
  entity_type: "deal";
  entity_id: string;
  priority?: number;
  tags?: string[];
  due_date?: string;
  assignee_id?: string;
};

/** POST /tasks. Graph8 documents idempotency-key on this endpoint; callers still reconcile on uncertain results. */
export async function createTask(body: TaskCreate, idempotencyKey: string): Promise<Task> {
  const operation = "create task";
  const json = await graph8.post("/tasks", { operation, body, idempotencyKey });
  return toTask(parseResponse(One, json, operation).data);
}

export async function createSubtask(parentId: string, body: TaskCreate): Promise<Task> {
  const operation = "create issue task";
  const json = await graph8.post(path`/tasks/${parentId}/subtasks`, { operation, body });
  return toTask(parseResponse(One, json, operation).data);
}

export async function getTask(taskId: string): Promise<Task> {
  const operation = "read task";
  const json = await graph8.get(path`/tasks/${taskId}`, { operation });
  return toTask(parseResponse(One, json, operation).data);
}

export type TaskPatch = Partial<{
  title: string;
  description: string;
  status: "open" | "completed";
  priority: number;
  due_date: string | null;
  assignee_id: string | null;
  tags: string[];
}>;

/** Conditional update: Graph8 rejects with 409 when expectedUpdatedAt is stale. */
export async function patchTask(taskId: string, patch: TaskPatch, expectedUpdatedAt?: string | null): Promise<Task> {
  const operation = "update task";
  const body = expectedUpdatedAt ? { ...patch, expected_updated_at: expectedUpdatedAt } : patch;
  const json = await graph8.patch(path`/tasks/${taskId}`, { operation, body });
  return toTask(parseResponse(One, json, operation).data);
}

export async function listDealTasks(dealId: string, opts: { search?: string; limit?: number; offset?: number } = {}) {
  const operation = "list deal tasks";
  const json = await graph8.get("/tasks", {
    operation,
    query: { entity_type: "deal", entity_id: dealId, search: opts.search, limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
  });
  const res = parseResponse(
    z.object({ data: z.array(TaskDto), pagination: z.object({ has_next: z.boolean(), total: z.number() }).nullish() }),
    json,
    operation,
  );
  return { items: res.data.map(toTask), hasNext: res.pagination?.has_next ?? false, total: res.pagination?.total ?? res.data.length };
}

export async function listSubtasks(parentId: string): Promise<Task[]> {
  const operation = "list issue tasks";
  const json = await graph8.get(path`/tasks/${parentId}/subtasks`, { operation });
  return parseResponse(z.object({ data: z.object({ items: z.array(TaskDto) }) }), json, operation).data.items.map(toTask);
}
