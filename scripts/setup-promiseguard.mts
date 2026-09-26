/* eslint-disable @typescript-eslint/no-explicit-any -- setup scripts read untyped Graph8 JSON */
// Creates or reuses the PromiseGuard demo records, comparison skill, and workflow in Graph8.
//
// Usage: node scripts/setup-promiseguard.mts <step...>
//   users     list org users (for PROMISEGUARD_ASSIGNEES and the demo deal owner)
//   records   demo company, contact, deal, and draft quote ("[PromiseGuard Demo]" prefix)
//   skill     comparison LLM skill
//   workflow  workflow that runs the skill (validated before save)
//   all       records + skill + workflow
//
// Reruns reuse existing records (by stored ID, then by name). Nothing is sent: no emails, no quote sends.
// Non-secret IDs are written to graph8/promiseguard-setup.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describeError, g8 } from "./lib/g8.mts";
import {
  PROMPT_TEMPLATE,
  PROMPT_VARIABLES,
  SKILL_NAME,
  WORKFLOW_NAME,
} from "../src/lib/promiseguard/prompt.ts";
import { DEMO_COMPANY, DEMO_CONTACT, DEMO_DEAL, DEMO_QUOTE } from "../src/lib/promiseguard/sample-data.ts";

const STATE_FILE = "graph8/promiseguard-setup.json";
const WORKFLOW_FILE = "graph8/promiseguard-workflow.json";
const PREFERRED_MODELS = ["claude-sonnet-4-6", "gpt-4o", "claude-3-5-sonnet-20241022"];

type State = {
  ownerUserId?: string;
  companyId?: number;
  contactId?: number;
  dealId?: string;
  quoteId?: string;
  skillId?: string;
  modelId?: string;
  workflowId?: string | number;
  updatedAt?: string;
};

const state: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
function save() {
  mkdirSync("graph8", { recursive: true });
  state.updatedAt = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

async function users() {
  // Deal owner_id accepts a team member id, email, or PropelAuth uid (verified 422 message).
  const res = await g8("GET", "/team-members", { operation: "list team members" });
  const items: any[] = res?.data?.items ?? [];
  console.log("Team members (id | propelauth_user_id | name | status):");
  for (const u of items) console.log(`  ${u.id} | ${u.propelauth_user_id} | ${u.name} | ${u.status}`);
  return items;
}

async function records() {
  // Owner: explicit env, else the first team member.
  if (!state.ownerUserId) {
    const items = await users();
    const owner = process.env.PROMISEGUARD_DEMO_OWNER_ID || items[0]?.id;
    if (!owner) throw new Error("No team member found for the demo deal owner");
    state.ownerUserId = owner;
    save();
  }

  // Company: Graph8 dedups by domain.
  if (!state.companyId) {
    const res = await g8("POST", "/companies", { operation: "create demo company", body: DEMO_COMPANY });
    state.companyId = res?.data?.company_id;
    console.log(`company: ${res?.data?.status} id=${state.companyId} merged=${res?.data?.merged}`);
    save();
  } else console.log(`company: reuse id=${state.companyId}`);

  // Contact: reuse stored ID; Graph8 may also merge by email.
  if (!state.contactId) {
    const res = await g8("POST", "/contacts", {
      operation: "create demo contact",
      body: { ...DEMO_CONTACT, company_id: state.companyId, company_domain: DEMO_COMPANY.domain },
    });
    state.contactId = res?.data?.contact_id ?? undefined;
    console.log(`contact: ${res?.data?.status} id=${state.contactId} merged=${res?.data?.merged} attached=${res?.data?.company_attached}`);
    if (res?.data?.validation_errors?.length) console.log("  validation:", res.data.validation_errors);
    save();
  } else console.log(`contact: reuse id=${state.contactId}`);

  // Deal: stored ID, else search by exact name.
  if (state.dealId && !(await exists(`/deals/${state.dealId}`, "read demo deal"))) state.dealId = undefined;
  if (!state.dealId) {
    const list = await g8("GET", "/deals", { operation: "search deals", query: { page: 1, limit: 100, search: DEMO_DEAL.name } });
    const found = (list?.data ?? []).find((d: any) => d.name === DEMO_DEAL.name);
    if (found) {
      state.dealId = found.id;
      console.log(`deal: found id=${state.dealId}`);
    } else {
      const res = await g8("POST", "/deals", {
        operation: "create demo deal",
        body: { ...DEMO_DEAL, owner_id: state.ownerUserId, contact_ids: [state.contactId] },
      });
      state.dealId = res?.data?.id;
      console.log(`deal: created id=${state.dealId} stage=${res?.data?.stage_name}`);
    }
    save();
  } else console.log(`deal: reuse id=${state.dealId}`);

  // Quote: stored ID, else company quotes by exact title. Always a draft; never sent.
  if (state.quoteId && !(await exists(`/quotes/${state.quoteId}`, "read demo quote"))) state.quoteId = undefined;
  if (!state.quoteId) {
    const list = await g8("GET", "/quotes", { operation: "list deal quotes", query: { deal_id: state.dealId!, page: 1, limit: 50 } });
    const rows: any[] = list?.data?.items ?? [];
    const found = Array.isArray(rows) ? rows.find((q) => q.title === DEMO_QUOTE.title) : undefined;
    if (found) {
      state.quoteId = found.id;
      console.log(`quote: found id=${state.quoteId}`);
    } else {
      const res = await g8("POST", "/quotes", {
        operation: "create demo draft quote",
        body: {
          ...DEMO_QUOTE,
          deal_id: state.dealId,
          mashup_company_id: state.companyId,
          signer_contact_id: state.contactId,
          signer_email: DEMO_CONTACT.work_email,
          signer_name: "Jordan Reyes",
          owner_id: state.ownerUserId,
        },
      });
      state.quoteId = res?.data?.id;
      console.log(`quote: created id=${state.quoteId} number=${res?.data?.quote_number} status=${res?.data?.status}`);
    }
    save();
  } else console.log(`quote: reuse id=${state.quoteId}`);
}

async function exists(path: string, operation: string): Promise<boolean> {
  try {
    await g8("GET", path, { operation });
    return true;
  } catch {
    return false;
  }
}

async function skill() {
  const models = await g8("GET", "/skills/models", { operation: "list models" });
  const available: string[] = (models?.models ?? []).map((m: any) => m.id);
  const modelId = process.env.GRAPH8_MODEL_ID || PREFERRED_MODELS.find((m) => available.includes(m)) || available[0];
  if (!modelId) throw new Error("No Graph8 LLM model available");

  const llm_config = { model: modelId, prompt_template: PROMPT_TEMPLATE, temperature: 0.1 };
  const validation = await g8("POST", "/skills/validate", { operation: "validate skill", body: { runtime_type: "llm", llm_config } });
  console.log("skill validate:", JSON.stringify(validation));
  const vars: string[] = validation?.variables ?? [];
  const expected = [...PROMPT_VARIABLES].sort().join(",");
  if ([...vars].sort().join(",") !== expected) {
    throw new Error(`Prompt variables mismatch. Expected ${expected}, Graph8 extracted ${vars.join(",")}`);
  }

  const list = await g8("GET", "/skills", { operation: "list skills", query: { runtime_type: "llm" } });
  const existing = (list?.actions ?? []).find((s: any) => s.name === SKILL_NAME && s.org_id !== "system");
  const body = {
    name: SKILL_NAME,
    description: "PromiseGuard: compare seller commitments with the selected quotation evidence.",
    runtime_type: "llm",
    object_type: "Deal",
    category: "Analysis",
    requires_approval: false,
    llm_config,
  };
  if (existing) {
    state.skillId = existing.action_id;
    // Always re-apply llm_config so model/prompt changes take effect; the update is idempotent.
    await g8("PUT", `/skills/${existing.action_id}`, { operation: "update skill", body: { llm_config } });
    console.log(`skill: reuse ${state.skillId}, llm_config applied (model ${modelId})`);
  } else {
    const res = await g8("POST", "/skills", { operation: "create skill", body });
    state.skillId = res?.action_id ?? res?.data?.action_id ?? res?.id;
    console.log(`skill: created ${state.skillId} (response keys: ${Object.keys(res ?? {}).join(",")})`);
  }
  state.modelId = modelId;
  save();
}

function workflowConfig(skillId: string) {
  return {
    start_node_id: "trigger_1",
    metadata: { name: WORKFLOW_NAME, version: 1 },
    settings: { stop_on_failure: true },
    nodes: [
      {
        node_id: "trigger_1",
        node_type: "trigger",
        name: "Run comparison on request",
        position: { x: 0, y: 0 },
        connections: ["compare_1"],
        config: {
          trigger_type: "tool_call",
          input_schema: PROMPT_VARIABLES.map((name) => ({
            name,
            type: "string",
            required: true,
            description: `Serialized ${name.replace(/_json$/, "")} JSON`,
          })),
        },
      },
      {
        node_id: "compare_1",
        node_type: "action",
        name: "PromiseGuard comparison",
        position: { x: 0, y: 160 },
        connections: ["parse_1"],
        config: {
          action_id: skillId,
          action_name: SKILL_NAME,
          action_type: "llm",
          input_mappings: PROMPT_VARIABLES.map((name) => ({ target_field: name, source_expression: `\${input.${name}}` })),
          on_error: "stop",
          timeout: 240,
        },
      },
      {
        node_id: "parse_1",
        node_type: "parse_json",
        name: "Parse comparison JSON",
        position: { x: 0, y: 320 },
        connections: [],
        config: { input: "${compare_1.result}", on_error: "continue", detected_keys: ["findings", "truncated"] },
      },
    ],
    // The executor follows node.connections; edges mirror them for the canvas.
    edges: [
      { id: "e1", source: "trigger_1", target: "compare_1", edge_type: "default" },
      { id: "e2", source: "compare_1", target: "parse_1", edge_type: "default" },
    ],
  };
}

async function workflow() {
  if (!state.skillId) throw new Error("Run the skill step first");
  const config = workflowConfig(state.skillId);
  const validation = await g8("POST", "/workflows/validate", { operation: "validate workflow", body: { config } });
  console.log("workflow validate:", JSON.stringify(validation));
  if (validation?.errors?.length) throw new Error("Workflow validation failed; not saving");

  const list = await g8("GET", "/workflows", { operation: "list workflows" });
  const existing = (list?.actions ?? []).find((w: any) => w.name === WORKFLOW_NAME);
  const body = {
    name: WORKFLOW_NAME,
    description: "PromiseGuard: runs the comparison skill on supplied evidence and returns parsed JSON.",
    category: "Analysis",
    object_type: "Deal",
    config,
  };
  if (existing) {
    await g8("PUT", `/workflows/${existing.action_id ?? existing.id}`, { operation: "update workflow", body: { config } });
    state.workflowId = existing.action_id ?? existing.id;
    console.log(`workflow: updated ${state.workflowId}`);
  } else {
    const res = await g8("POST", "/workflows", { operation: "create workflow", body });
    state.workflowId = res?.action_id ?? res?.id;
    console.log(`workflow: created ${state.workflowId} (response keys: ${Object.keys(res ?? {}).join(",")})`);
  }
  writeFileSync(WORKFLOW_FILE, JSON.stringify(config, null, 2) + "\n");
  save();
}

const steps = process.argv.slice(2);
if (!steps.length) {
  console.log("Usage: node scripts/setup-promiseguard.mts users|records|skill|workflow|all");
  process.exit(1);
}
try {
  for (const step of steps) {
    if (step === "users") await users();
    else if (step === "records") await records();
    else if (step === "skill") await skill();
    else if (step === "workflow") await workflow();
    else if (step === "all") {
      await records();
      await skill();
      await workflow();
    } else throw new Error(`Unknown step ${step}`);
  }
  console.log("\nState:", JSON.stringify(state));
  if (state.workflowId) {
    console.log("\nAdd to .env:\n" + `GRAPH8_SKILL_ID=${state.skillId}\nGRAPH8_WORKFLOW_ID=${state.workflowId}\nGRAPH8_MODEL_ID=${state.modelId}`);
  }
} catch (err) {
  console.error("\nSetup stopped:", describeError(err));
  process.exit(1);
}
