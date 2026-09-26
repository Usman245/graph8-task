/* eslint-disable @typescript-eslint/no-explicit-any -- setup scripts read untyped Graph8 JSON */
// Verifies Graph8 task storage for PromiseGuard: description round-trip size, tags, search,
// conditional PATCH (expected_updated_at), subtasks, and assignee acceptance.
// Creates "[PromiseGuard Demo] Storage check" tasks on the demo deal and completes them afterwards.
// Usage: node scripts/check-task-storage.mts

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { G8Error, describeError, g8 } from "./lib/g8.mts";

const setup = JSON.parse(readFileSync("graph8/promiseguard-setup.json", "utf8"));
const state = { dealId: setup.scenarios.acme.dealId as string, ownerUserId: setup.ownerUserId as string };
const marker = `pgcheck-${randomUUID().slice(0, 8)}`;

function manifestBlock(bytes: number): string {
  const payload = { schemaVersion: 1, app: "promiseguard", marker, filler: "x".repeat(Math.max(0, bytes - 120)), unicode: "“quotes” — dash ✓" };
  return `PromiseGuard storage check\nThis task verifies description round-trip.\n\nPG_MANIFEST_V1_BEGIN\n${JSON.stringify(payload)}\nPG_MANIFEST_V1_END`;
}

const results: Record<string, string> = {};
async function step(name: string, fn: () => Promise<string>) {
  try {
    results[name] = await fn();
  } catch (err) {
    results[name] = `FAILED ${describeError(err)}`;
  }
  console.log(`${name}: ${results[name]}`);
}

let taskId = "";
let updatedAt = "";

await step("create", async () => {
  const res = await g8("POST", "/tasks", {
    operation: "create storage-check task",
    headers: { "idempotency-key": randomUUID() },
    body: {
      title: `[PromiseGuard Demo] Storage check [${marker}]`,
      description: manifestBlock(1000),
      entity_type: "deal",
      entity_id: state.dealId,
      priority: 3,
      tags: ["promiseguard", "promiseguard-check"],
    },
  });
  taskId = res.data.id;
  updatedAt = res.data.updated_at;
  return `id=${taskId} status=${res.data.status} entity=${res.data.entity_type}:${res.data.entity_id} tags=${JSON.stringify(res.data.tags)}`;
});

for (const size of [8000, 24000, 48000]) {
  await step(`roundtrip_${size}`, async () => {
    const desc = manifestBlock(size);
    const res = await g8("PATCH", `/tasks/${taskId}`, { operation: "patch description", body: { description: desc } });
    updatedAt = res.data.updated_at;
    const back = await g8("GET", `/tasks/${taskId}`, { operation: "read task" });
    const got: string = back.data.description ?? "";
    return got === desc ? `exact (${Buffer.byteLength(desc)} bytes)` : `MISMATCH sent=${desc.length} got=${got.length}`;
  });
}

await step("conditional_patch_stale", async () => {
  try {
    await g8("PATCH", `/tasks/${taskId}`, {
      operation: "stale patch",
      body: { title: `[PromiseGuard Demo] Storage check [${marker}] stale`, expected_updated_at: "2020-01-01T00:00:00Z" },
    });
    return "ACCEPTED (no conditional-write protection)";
  } catch (err) {
    return err instanceof G8Error ? `rejected HTTP ${err.status}` : String(err);
  }
});

await step("conditional_patch_current", async () => {
  const res = await g8("PATCH", `/tasks/${taskId}`, {
    operation: "current patch",
    body: { priority: 2, expected_updated_at: updatedAt },
  });
  updatedAt = res.data.updated_at;
  return `accepted priority=${res.data.priority}`;
});

await step("list_by_deal", async () => {
  const res = await g8("GET", "/tasks", { operation: "list deal tasks", query: { entity_type: "deal", entity_id: state.dealId, limit: 100, offset: 0 } });
  const found = (res.data ?? []).some((t: any) => t.id === taskId);
  return `found=${found} count=${res.data?.length} pagination=${JSON.stringify(res.pagination)} descIncluded=${typeof res.data?.[0]?.description}`;
});

await step("search_marker", async () => {
  const res = await g8("GET", "/tasks", { operation: "search tasks", query: { search: marker, limit: 20 } });
  return `found=${(res.data ?? []).some((t: any) => t.id === taskId)}`;
});

let subId = "";
await step("subtask_create", async () => {
  const res = await g8("POST", `/tasks/${taskId}/subtasks`, {
    operation: "create subtask",
    body: { entity_type: "deal", entity_id: state.dealId, title: `[PromiseGuard Demo] Storage check child [${marker}]`, description: "child", priority: 2 },
  });
  subId = res.data?.id ?? res.data?.task?.id ?? "";
  return `id=${subId} keys=${Object.keys(res.data ?? {}).join(",")}`;
});

await step("subtask_read", async () => {
  const res = await g8("GET", `/tasks/${subId}`, { operation: "read subtask" });
  return `parent=${res.data.parent_task_id} matches=${res.data.parent_task_id === taskId}`;
});

await step("subtask_list", async () => {
  const res = await g8("GET", `/tasks/${taskId}/subtasks`, { operation: "list subtasks" });
  const rows = Array.isArray(res.data) ? res.data : res.data?.items ?? res.data?.subtasks ?? [];
  return `count=${rows.length} keys=${Object.keys(res.data ?? {}).slice(0, 6).join(",")}`;
});

await step("subtask_in_top_level_list", async () => {
  const res = await g8("GET", "/tasks", { operation: "list deal tasks", query: { entity_type: "deal", entity_id: state.dealId, limit: 100 } });
  return `childListed=${(res.data ?? []).some((t: any) => t.id === subId)}`;
});

await step("assignee_team_member", async () => {
  const res = await g8("PATCH", `/tasks/${subId}`, { operation: "assign subtask", body: { assignee_id: state.ownerUserId } });
  return `assignee_id=${res.data.assignee_id} name=${res.data.assignee_name}`;
});

await step("complete", async () => {
  const a = await g8("PATCH", `/tasks/${subId}`, { operation: "complete subtask", body: { status: "completed" } });
  const b = await g8("PATCH", `/tasks/${taskId}`, { operation: "complete task", body: { status: "completed" } });
  return `child=${a.data.status} parent=${b.data.status}`;
});

console.log("\nSUMMARY", JSON.stringify({ marker, taskId, subId, results }, null, 1));
