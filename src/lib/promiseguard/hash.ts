import { createHash } from "node:crypto";

/** JSON with object keys sorted, so equal data always hashes equally. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function sha256(value: unknown): string {
  const text = typeof value === "string" ? value : stableStringify(value);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const shortHash = (value: unknown, length = 12) => sha256(value).slice(0, length);
