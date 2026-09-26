// Phase-zero read-only Graph8 capability check.
// Usage: node scripts/check-graph8.ts [--raw-dir <dir>]
// Prints response *shapes* only (keys, types, lengths). Record contents are never printed.
// With --raw-dir, raw responses are written there for local inspection; keep that dir outside the repo.

import nextEnv from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

nextEnv.loadEnvConfig(process.cwd());

const BASE = process.env.GRAPH8_BASE_URL || "https://be.graph8.com/api/v1";
const KEY = process.env.GRAPH8_API_KEY;
if (!KEY) {
  console.error("GRAPH8_API_KEY is not set.");
  process.exit(1);
}

const rawIdx = process.argv.indexOf("--raw-dir");
const rawDir = rawIdx > 0 ? process.argv[rawIdx + 1] : null;
if (rawDir) mkdirSync(rawDir, { recursive: true });

type Probe = { name: string; path: string; query?: Record<string, string | number> };

export async function get(p: Probe): Promise<{ status: number; json: unknown }> {
  const url = new URL(BASE.replace(/\/$/, "") + p.path);
  for (const [k, v] of Object.entries(p.query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (rawDir) writeFileSync(join(rawDir, `${p.name}.json`), JSON.stringify({ status: res.status, url: url.pathname + url.search, body: json }, null, 2));
  return { status: res.status, json };
}

/** Structural summary: replaces values with type descriptors. */
export function shape(value: unknown, depth = 0): unknown {
  if (depth > 5) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return value.length ? [`array(${value.length})`, shape(value[0], depth + 1)] : "array(0)";
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

const probes: Probe[] = [
  { name: "deals", path: "/deals", query: { page: 1, limit: 5 } },
  { name: "inbox_email", path: "/inbox", query: { channel: "email", page: 1, page_size: 5 } },
  { name: "meetings", path: "/inbox/meetings", query: { page: 1, page_size: 5 } },
  { name: "meetings_with_transcript", path: "/inbox/meetings", query: { has_transcript: "true", page: 1, page_size: 5 } },
  { name: "skills_models", path: "/skills/models" },
  { name: "skills", path: "/skills" },
  { name: "workflows", path: "/workflows" },
  { name: "workflow_node_schema", path: "/workflows/node-types/schema", query: { detail: "full" } },
  { name: "tasks", path: "/tasks", query: { limit: 5, offset: 0 } },
];

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

for (const p of probes.filter((x) => !only || only.includes(x.name))) {
  try {
    const { status, json } = await get(p);
    console.log(`\n### ${p.name}  GET ${p.path}  -> ${status}`);
    console.log(JSON.stringify(status < 300 ? shape(json) : json, null, 1).slice(0, 4000));
  } catch (err) {
    console.log(`\n### ${p.name}  GET ${p.path}  -> ERROR ${(err as Error).name}`);
  }
}
