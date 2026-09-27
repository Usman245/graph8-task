// Runs one tiny synthetic comparison through the saved Graph8 workflow and prints the
// execution envelope shape plus the parsed result. Consumes a small amount of AI credit.
// Usage: node scripts/smoke-compare.mts [--skill]   (--skill runs the skill directly instead)

import { readFileSync } from "node:fs";
import { describeError, g8, sleep } from "./lib/g8.mts";
import { MODEL_OUTPUT_SCHEMA } from "../src/lib/promiseguard/prompt.ts";

const state = JSON.parse(readFileSync("graph8/promiseguard-setup.json", "utf8"));
const input_data = {
  context_json: JSON.stringify({ max_findings: 3, evidence_label: "synthetic smoke test" }),
  sources_json: JSON.stringify([
    {
      document_id: "sample:smoke:m1",
      speaker: "Maya (seller)",
      speaker_side: "seller",
      occurred_at: "2026-09-10T15:00:00Z",
      text: "We'll run your TikTok as well as your Instagram and Facebook.",
    },
  ]),
  quote_json: JSON.stringify({
    text_complete: true,
    parts: [{ part_id: "quote:smoke:field:terms_content", text: "TikTok is not included." }],
  }),
  output_schema_json: JSON.stringify(MODEL_OUTPUT_SCHEMA),
};

function shape(v: unknown, d = 0): unknown {
  if (d > 4) return "…";
  if (v === null) return null;
  if (Array.isArray(v)) return v.length ? [`array(${v.length})`, shape(v[0], d + 1)] : "array(0)";
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x, d + 1)]));
  return typeof v === "string" ? `string(${v.length})` : typeof v;
}

try {
  if (process.argv.includes("--skill")) {
    const res = await g8("POST", `/skills/${state.skillId}/execute`, { operation: "execute skill", body: { input_data } });
    console.log("skill execute shape:", JSON.stringify(shape(res), null, 1));
    console.log(JSON.stringify(res, null, 1).slice(0, 3000));
    process.exit(0);
  }
  const start = await g8("POST", `/workflows/${state.workflowId}/execute`, { operation: "execute workflow", body: { input_data } });
  console.log("execute response:", JSON.stringify(start));
  const id = start?.execution_id ?? start?.id;
  for (let i = 0; i < 60; i++) {
    await sleep(i < 5 ? 3000 : 5000);
    const ex = await g8("GET", `/workflows/executions/${id}`, { operation: "read execution" });
    process.stdout.write(`status=${ex?.status} `);
    if (["completed", "failed", "stopped"].includes(ex?.status)) {
      console.log("\n\nexecution shape:", JSON.stringify(shape(ex), null, 1));
      console.log("\nexecution body:", JSON.stringify(ex, null, 1).slice(0, 6000));
      break;
    }
  }
} catch (err) {
  console.error("Smoke test stopped:", describeError(err));
  process.exit(1);
}
