import "server-only";
import { env } from "@/lib/env";
import { graph8, path } from "@/lib/graph8/client";
import { Graph8Error } from "@/lib/graph8/errors";

export type CheckStatus = "ok" | "failed" | "skipped";

export type CapabilityCheck = {
  id: "config" | "deals" | "quotes" | "inbox" | "meetings" | "models" | "tasks" | "workflow";
  label: string;
  status: CheckStatus;
  message: string;
  operation: string;
};

export type ConnectionStatus = {
  graph8Configured: boolean;
  demoEnabled: boolean;
  checkedAt: string;
  checks: CapabilityCheck[];
  /** True when a Graph8 comparison can be started. */
  comparisonReady: boolean;
  modelId: string | null;
  sellerDomains: string[];
  assigneeCount: number;
};

const CACHE_MS = 30_000;
let cache: { at: number; value: ConnectionStatus } | null = null;

export async function getConnectionStatus(force = false): Promise<ConnectionStatus> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const value = await computeStatus();
  cache = { at: Date.now(), value };
  return value;
}

async function computeStatus(): Promise<ConnectionStatus> {
  const e = env();
  const base = {
    graph8Configured: Boolean(e.GRAPH8_API_KEY),
    demoEnabled: e.PROMISEGUARD_DEMO_ENABLED,
    checkedAt: new Date().toISOString(),
    modelId: e.GRAPH8_MODEL_ID ?? null,
    sellerDomains: e.sellerDomains,
    assigneeCount: e.assignees.length,
  };

  if (!e.GRAPH8_API_KEY) {
    return {
      ...base,
      comparisonReady: false,
      checks: [
        { id: "config", label: "Graph8 API key", status: "failed", message: "GRAPH8_API_KEY is not set on the server.", operation: "configure" },
      ],
    };
  }

  const checks = await Promise.all([
    probe("deals", "Read deals", "list deals", () => graph8.get("/deals", { operation: "list deals", query: { page: 1, limit: 1 } })),
    probe("quotes", "Read quotes", "list quotes", () => graph8.get("/quotes", { operation: "list quotes", query: { page: 1, limit: 1 } })),
    probe("inbox", "Read email inbox", "list inbox", () =>
      graph8.get("/inbox", { operation: "list inbox", query: { channel: "email", page: 1, page_size: 1 } }),
    ),
    probe("meetings", "Read meetings", "list meetings", () =>
      graph8.get("/inbox/meetings", { operation: "list meetings", query: { page: 1, page_size: 1 } }),
    ),
    probe("models", "List Graph8 LLM models", "list models", () => graph8.get("/skills/models", { operation: "list models" })),
    probe("tasks", "Read tasks", "list tasks", () => graph8.get("/tasks", { operation: "list tasks", query: { limit: 1, offset: 0 } })),
    e.GRAPH8_WORKFLOW_ID
      ? probe("workflow", "PromiseGuard workflow", "read workflow", () =>
          graph8.get(path`/workflows/${e.GRAPH8_WORKFLOW_ID!}`, { operation: "read workflow" }),
        )
      : Promise.resolve<CapabilityCheck>({
          id: "workflow",
          label: "PromiseGuard workflow",
          status: "failed",
          message: "GRAPH8_WORKFLOW_ID is not set. Run: node scripts/setup-promiseguard.mts skill workflow",
          operation: "configure",
        }),
  ]);

  const ok = (id: CapabilityCheck["id"]) => checks.find((c) => c.id === id)?.status === "ok";
  return {
    ...base,
    checks,
    comparisonReady: ok("deals") && ok("quotes") && ok("tasks") && ok("workflow"),
  };
}

async function probe(
  id: CapabilityCheck["id"],
  label: string,
  operation: string,
  run: () => Promise<unknown>,
): Promise<CapabilityCheck> {
  try {
    await run();
    return { id, label, status: "ok", message: "Available.", operation };
  } catch (err) {
    const message = err instanceof Graph8Error ? err.message : "Unexpected failure.";
    return { id, label, status: "failed", message, operation };
  }
}
