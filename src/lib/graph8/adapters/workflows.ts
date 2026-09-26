import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// Verified 2026-09-26:
// POST /workflows/{action_id}/execute -> { success, execution_id, status: "pending", message }
// GET /workflows/executions/{id} -> { status, error_message, output_data.node_results.<node>.output }
//   compare_1.output.result is the raw model string; parse_1.output.result is Graph8's parsed object.
// GET /workflows/executions?action_id= -> { executions: [...incl. input_data], total_count }

export const COMPARE_NODE = "compare_1";
export const PARSE_NODE = "parse_1";

export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "paused" | "pending_approval" | "stopped";
export const TERMINAL_STATUSES: ExecutionStatus[] = ["completed", "failed", "stopped"];

const NodeResult = z.object({
  status: z.string().nullish(),
  error: z.string().nullish(),
  output: z.record(z.string(), z.unknown()).nullish(),
});

const ExecutionDto = z.object({
  execution_id: z.string(),
  action_id: z.string().nullish(),
  status: z.string(),
  error_message: z.string().nullish(),
  input_data: z.record(z.string(), z.unknown()).nullish(),
  output_data: z
    .object({
      node_results: z.record(z.string(), NodeResult).nullish(),
      failed_at_node: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
  tokens_input: z.number().nullish(),
  tokens_output: z.number().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
  created_at: z.string().nullish(),
});

export type Execution = {
  executionId: string;
  status: ExecutionStatus | string;
  terminal: boolean;
  errorMessage: string | null;
  /** Raw model text from the comparison node, if it completed. */
  rawResult: string | null;
  /** Graph8's parse_json output, used only as a fallback when the raw text is not strict JSON. */
  parsedResult: unknown;
  inputData: Record<string, unknown> | null;
  tokens: { input: number | null; output: number | null };
  completedAt: string | null;
  createdAt: string | null;
};

function toExecution(e: z.infer<typeof ExecutionDto>): Execution {
  const nodes = e.output_data?.node_results ?? {};
  const raw = nodes[COMPARE_NODE]?.output?.result;
  return {
    executionId: e.execution_id,
    status: e.status,
    terminal: (TERMINAL_STATUSES as string[]).includes(e.status),
    errorMessage: e.error_message ?? null,
    rawResult: typeof raw === "string" ? raw : raw != null ? JSON.stringify(raw) : null,
    parsedResult: nodes[PARSE_NODE]?.output?.result ?? null,
    inputData: e.input_data ?? null,
    tokens: { input: e.tokens_input ?? null, output: e.tokens_output ?? null },
    completedAt: e.completed_at ?? null,
    createdAt: e.created_at ?? null,
  };
}

/** Not retried automatically: an uncertain start must be reconciled through execution history. */
export async function executeWorkflow(workflowId: string, inputData: Record<string, string>): Promise<{ executionId: string }> {
  const operation = "start Graph8 workflow";
  const json = await graph8.post(path`/workflows/${workflowId}/execute`, {
    operation,
    body: { input_data: inputData },
    timeoutMs: 30_000,
  });
  const res = parseResponse(z.object({ execution_id: z.string() }), json, operation);
  return { executionId: res.execution_id };
}

export async function getExecution(executionId: string): Promise<Execution> {
  const operation = "read workflow execution";
  const json = await graph8.get(path`/workflows/executions/${executionId}`, { operation });
  return toExecution(parseResponse(ExecutionDto, json, operation));
}

export async function listRecentExecutions(workflowId: string, limit = 25): Promise<Execution[]> {
  const operation = "list workflow executions";
  const json = await graph8.get("/workflows/executions", { operation, query: { action_id: workflowId, limit } });
  return parseResponse(z.object({ executions: z.array(ExecutionDto) }), json, operation).executions.map(toExecution);
}
