// Review manifest stored in a Graph8 task description (application convention, not a Graph8 field).
// Round-trip verified exactly up to 48 KB on 2026-09-26.

import { ReviewManifestSchema, summarize, type ReviewManifest } from "./schemas";

export const MANIFEST_BEGIN = "PG_MANIFEST_V1_BEGIN";
export const MANIFEST_END = "PG_MANIFEST_V1_END";
export const ISSUE_MARKER = "PG_ISSUE_V1";
export const REVIEW_TAG = "promiseguard";
export const REVIEW_TITLE_PREFIX = "[PromiseGuard]";
export const DEMO_TITLE_PREFIX = "[PromiseGuard Demo]";

export type ManifestParse =
  | { ok: true; manifest: ReviewManifest }
  | { ok: false; reason: "missing" | "unsupported_version" | "invalid"; message: string };

export function reviewTitle(m: Pick<ReviewManifest, "mode" | "quoteLabel" | "requestId">): string {
  const prefix = m.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
  return `${prefix} Review ${m.quoteLabel.replace(/^\[PromiseGuard Demo\]\s*/, "")} [${m.requestId.slice(0, 8)}]`.slice(0, 250);
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function humanSummary(m: ReviewManifest): string {
  const lines = ["PromiseGuard quotation review", `Selected quote: ${m.quoteLabel}`, `Deal: ${m.dealName}`];
  lines.push(
    m.mode === "demo"
      ? "Evidence: Sample conversation (synthetic demonstration content, not a Graph8 email or transcript)."
      : `Evidence: ${m.sourceRefs.length} selected Graph8 source record(s); see review details.`,
  );
  if (m.report) {
    const c = summarize(m.report);
    lines.push(
      `Result: ${plural(c.conflict, "conflict", "conflicts")}, ${plural(c.missing, "missing item", "missing items")}, ` +
        `${plural(c.covered, "covered commitment", "covered commitments")}, ${plural(c.needs_review, "item needing review", "items needing review")}.`,
    );
  } else {
    lines.push(`Status: ${m.runState}`);
  }
  if (!m.quoteTextComplete) lines.push("Limitation: quote text incomplete; absence of a clause is not confirmed.");
  lines.push("Decision support only; not a determination of contractual liability.");
  return lines.join("\n");
}

export function buildDescription(m: ReviewManifest): string {
  return `${humanSummary(m)}\n\n${MANIFEST_BEGIN}\n${JSON.stringify(m)}\n${MANIFEST_END}`;
}

export function parseDescription(description: string | null | undefined): ManifestParse {
  const text = description ?? "";
  const start = text.indexOf(MANIFEST_BEGIN);
  const end = text.indexOf(MANIFEST_END, start + 1);
  if (start < 0 || end < 0) return { ok: false, reason: "missing", message: "This task has no PromiseGuard manifest." };
  const body = text.slice(start + MANIFEST_BEGIN.length, end).trim();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: "invalid", message: "The stored PromiseGuard manifest is not valid JSON." };
  }
  const version = (json as { schemaVersion?: unknown })?.schemaVersion;
  if (version !== 1) {
    return {
      ok: false,
      reason: "unsupported_version",
      message: `This review was saved with manifest version ${String(version)}, which this app cannot edit. It is shown read-only.`,
    };
  }
  const parsed = ReviewManifestSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "The stored PromiseGuard manifest failed validation." };
  return { ok: true, manifest: parsed.data };
}

export function manifestBytes(m: ReviewManifest): number {
  return Buffer.byteLength(buildDescription(m), "utf8");
}

export type IssueMarker = { app: "promiseguard"; v: 1; reviewTaskId: string; findingId: string; requestId: string };

export function issueMarkerLine(marker: Omit<IssueMarker, "app" | "v">): string {
  return `${ISSUE_MARKER} ${JSON.stringify({ app: "promiseguard", v: 1, ...marker })}`;
}

export function parseIssueMarker(description: string | null | undefined): IssueMarker | null {
  const line = (description ?? "").split("\n").find((l) => l.startsWith(`${ISSUE_MARKER} `));
  if (!line) return null;
  try {
    const m = JSON.parse(line.slice(ISSUE_MARKER.length + 1));
    if (m?.app === "promiseguard" && m.v === 1 && typeof m.reviewTaskId === "string" && typeof m.findingId === "string") return m;
  } catch {
    /* ignore */
  }
  return null;
}
