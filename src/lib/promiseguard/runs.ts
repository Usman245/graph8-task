import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { getDeal, type Deal } from "@/lib/graph8/adapters/deals";
import { getQuote } from "@/lib/graph8/adapters/quotes";
import { createSubtask, getTask, listSubtasks, patchTask, type Task } from "@/lib/graph8/adapters/tasks";
import { executeWorkflow, getExecution, listRecentExecutions } from "@/lib/graph8/adapters/workflows";
import { Graph8Error } from "@/lib/graph8/errors";
import { withLock } from "./lock";
import { discoveryComplete, discoveryKeys, evidenceFingerprint } from "./freshness";
import { DEMO_TITLE_PREFIX, REVIEW_TAG, REVIEW_TITLE_PREFIX, issueMarkerLine, parseIssueMarker } from "./manifest";
import { assertQuoteEligible } from "./matching";
import { assertDealMatchesMode } from "./mode";
import { quoteToDocument, sourceHash } from "./normalize";
import { MODEL_OUTPUT_SCHEMA, PROMPT_VERSION } from "./prompt";
import { createReviewTask, findReviewByRequestId, loadReview, requireEditable, saveManifest } from "./repository";
import { SAMPLE_LABEL } from "./sample-data";
import { refKey, summarize, type EvidenceDocument, type Finding, type Mode, type QuoteDocument, type ReviewManifest, type SourceRef } from "./schemas";
import { findSourceCandidates, loadSource, type LoadedSource } from "./sources";
import { validateModelOutput } from "./validate-evidence";

type Evidence = {
  deal: Deal;
  quoteDoc: QuoteDocument;
  sources: LoadedSource[];
  documents: EvidenceDocument[];
};

function dedupeRefs(refs: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => (seen.has(refKey(r)) ? false : (seen.add(refKey(r)), true)));
}

/** Re-fetch and re-authorize every selected record on the server. */
async function prepareEvidence(deal: Deal, quoteId: string, refs: SourceRef[], mode: Mode, matchConfirmed: boolean): Promise<Evidence> {
  const e = env();
  assertDealMatchesMode(deal, mode);
  if (refs.length === 0) throw new AppRequestError("no_sources", "Select at least one source.", 422);
  if (refs.length > e.PROMISEGUARD_MAX_SOURCES) {
    throw new AppRequestError("too_many_sources", `Select at most ${e.PROMISEGUARD_MAX_SOURCES} sources.`, 422);
  }
  if (mode === "live" && refs.some((r) => r.kind === "sample")) {
    throw new AppRequestError("sample_in_live", "Sample evidence can never be used in a Live review.", 409);
  }
  if (mode === "demo" && refs.some((r) => r.kind !== "sample")) {
    throw new AppRequestError("live_in_demo", "Demo reviews use only the sample conversation.", 409);
  }

  const quote = await getQuote(quoteId);
  assertQuoteEligible(deal, quote, matchConfirmed);
  const quoteDoc = quoteToDocument(quote, e.PROMISEGUARD_MAX_QUOTE_CHARS);
  if (quoteDoc.parts.length === 0) {
    throw new AppRequestError("quote_insufficient", "Quotation detail is insufficient: it has no scope text or line-item descriptions.", 422);
  }

  const sources: LoadedSource[] = [];
  for (const ref of refs) sources.push(await loadSource(deal, ref, mode));
  const documents = sources.flatMap((s) => s.documents);
  const chars = documents.reduce((n, d) => n + d.text.length, 0);
  if (chars > e.PROMISEGUARD_MAX_SOURCE_CHARS) {
    throw new AppRequestError("sources_too_large", `The selected sources are too long (${chars} characters). Select fewer sources.`, 413);
  }
  return { deal, quoteDoc, sources, documents };
}

const SOURCE_TYPE: Record<SourceRef["kind"], string> = {
  sample: "sample conversation",
  email: "email",
  meeting: "meeting transcript",
  note: "internal deal note",
  memory: "deal memory (AI summary of a meeting)",
};

function buildInputData(requestId: string, mode: Mode, ev: Evidence): Record<string, string> {
  const labels = new Map(ev.sources.map((s) => [refKey(s.ref), s.label]));
  return {
    context_json: JSON.stringify({
      request_id: requestId,
      prompt_version: PROMPT_VERSION,
      max_findings: env().PROMISEGUARD_MAX_FINDINGS,
      review_date: new Date().toISOString().slice(0, 10),
      deal_name: ev.deal.name,
      evidence_origin: mode === "demo" ? "synthetic sample conversation for demonstration" : "Graph8 email, meeting, deal note, and deal memory records",
      quote_text_complete: ev.quoteDoc.textComplete,
    }),
    sources_json: JSON.stringify(
      ev.documents.map((d) => ({
        document_id: d.id,
        source_type: SOURCE_TYPE[d.parent.kind],
        source: labels.get(refKey(d.parent)) ?? refKey(d.parent),
        speaker: d.speaker,
        speaker_side: d.speakerSide,
        occurred_at: d.occurredAt,
        text: d.text,
      })),
    ),
    quote_json: JSON.stringify({
      quote_id: ev.quoteDoc.quoteId,
      label: ev.quoteDoc.label,
      text_complete: ev.quoteDoc.textComplete,
      parts: ev.quoteDoc.parts.map((p) => ({ part_id: p.id, path: p.path, text: p.text })),
    }),
    output_schema_json: JSON.stringify(MODEL_OUTPUT_SCHEMA),
  };
}

function workflowId(): string {
  const id = env().GRAPH8_WORKFLOW_ID;
  if (!id) throw new AppRequestError("workflow_missing", "The Graph8 comparison workflow is not configured. Run the setup script.", 503);
  return id;
}

type StartInput = {
  dealId: string;
  quoteId: string;
  sourceRefs: SourceRef[];
  matchConfirmed: boolean;
  requestId: string;
  mode: Mode;
  previousReviewTaskId?: string | null;
  trigger?: "user" | "manual" | "webhook" | "scan";
  triggerEvent?: string;
  /** Server-generated autopilot preflight; never accepted from the browser. */
  expectedFingerprint?: string;
};

export async function startReview(input: StartInput): Promise<{ reviewTaskId: string; executionId: string | null; recovered: boolean }> {
  return withLock(`deal:${input.dealId}`, async () => {
    const existing = await findReviewByRequestId(input.dealId, input.requestId);
    if (existing?.manifest) {
      return { reviewTaskId: existing.task.id, executionId: existing.manifest.executionId, recovered: true };
    }

    const deal = await getDeal(input.dealId);
    const refs = dedupeRefs(input.sourceRefs);
    const scan = await findSourceCandidates(deal, input.mode);
    const ev = await prepareEvidence(deal, input.quoteId, refs, input.mode, input.matchConfirmed);
    const hashes = Object.fromEntries(ev.sources.map((s) => [refKey(s.ref), sourceHash(s.documents)]));
    const discoveredSourceKeys = discoveryKeys(scan);
    if (input.expectedFingerprint && (!discoveryComplete(scan) || input.expectedFingerprint !== evidenceFingerprint(ev.quoteDoc.versionHash, hashes, discoveredSourceKeys, input.mode))) {
      throw new AppRequestError("evidence_changed", "Evidence changed while the review was starting. Review again using the current sources.", 409);
    }
    const wf = workflowId();

    const initial: ReviewManifest = {
      schemaVersion: 1,
      app: "promiseguard",
      mode: input.mode,
      revision: 0,
      requestId: input.requestId,
      reviewTaskId: "",
      dealId: deal.id,
      dealName: deal.name,
      quoteId: ev.quoteDoc.quoteId,
      quoteLabel: ev.quoteDoc.label,
      sourceRefs: refs,
      sourceLabels: Object.fromEntries(ev.sources.map((s) => [refKey(s.ref), s.label])),
      sourceHashes: hashes,
      discoveredSourceKeys,
      discoveryComplete: discoveryComplete(scan),
      quoteHash: ev.quoteDoc.versionHash,
      quoteTextComplete: ev.quoteDoc.textComplete,
      quoteIncludedFields: ev.quoteDoc.includedFields,
      promptVersion: PROMPT_VERSION,
      workflowId: wf,
      executionId: null,
      runState: "preparing",
      runError: null,
      report: null,
      rejected: [],
      truncated: false,
      documents: {},
      humanDecisions: [],
      issueTaskIds: {},
      matchConfirmed: input.matchConfirmed,
      coverageComplete: false,
      coverageNotes: ev.quoteDoc.limitations,
      previousReviewTaskId: input.previousReviewTaskId ?? null,
      trigger: input.trigger ?? "user",
      ...(input.triggerEvent ? { triggerEvent: input.triggerEvent } : {}),
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    let task: Task;
    try {
      task = await createReviewTask(initial);
    } catch (err) {
      // An uncertain create may have succeeded: search for the exact request marker before reporting.
      if (err instanceof Graph8Error && (err.code === "timeout" || err.code === "network" || err.code === "server_error")) {
        const found = await findReviewByRequestId(deal.id, input.requestId).catch(() => null);
        if (found?.manifest) return { reviewTaskId: found.task.id, executionId: found.manifest.executionId, recovered: true };
        throw new AppRequestError(
          "create_uncertain",
          "Graph8 did not confirm the review task. Retry with the same selection; PromiseGuard will look for it before creating another.",
          502,
        );
      }
      throw err;
    }

    let saved = await saveManifest(task, initial);
    saved = await launch(saved.task, saved.manifest, ev);
    return { reviewTaskId: saved.task.id, executionId: saved.manifest.executionId, recovered: false };
  });
}

async function launch(task: Task, manifest: ReviewManifest, ev: Evidence) {
  try {
    const { executionId } = await executeWorkflow(manifest.workflowId, buildInputData(manifest.requestId, manifest.mode, ev));
    return await saveManifest(task, { ...manifest, executionId, runState: "running" });
  } catch (err) {
    if (!(err instanceof Graph8Error)) throw err;
    const uncertain = err.code === "timeout" || err.code === "network" || err.code === "server_error";
    return await saveManifest(task, {
      ...manifest,
      runState: uncertain ? "start_unknown" : "failed",
      runError: {
        code: uncertain ? "start_unknown" : `graph8_${err.code}`,
        message: uncertain
          ? "Graph8 did not confirm that the comparison started. PromiseGuard will look for it in Graph8's execution history; it will not start a second run automatically."
          : err.message,
      },
    });
  }
}

/** Match a lost execution by the request ID embedded in its input. */
async function reconcileExecution(m: ReviewManifest): Promise<string | null> {
  const recent = await listRecentExecutions(m.workflowId, 50);
  const hit = recent.find((x) => typeof x.inputData?.context_json === "string" && x.inputData.context_json.includes(`"request_id":"${m.requestId}"`));
  return hit?.executionId ?? null;
}

function friendlyRunError(message: string | null): string {
  if (!message) return "The Graph8 workflow failed.";
  if (/credit balance is too low|insufficient.*credit/i.test(message)) {
    return "Graph8 could not run the model because its AI provider credits are unavailable. Your review was saved; retry later or switch GRAPH8_MODEL_ID.";
  }
  return `The Graph8 workflow failed: ${message.slice(0, 300)}`;
}

export type FinalizeResult = { state: ReviewManifest["runState"]; message: string | null };

/** Idempotent and serialized per review. Never starts a new AI run. */
export async function finalizeReview(taskId: string): Promise<FinalizeResult> {
  return withLock(`review:${taskId}`, async () => {
    let { task, manifest: m } = requireEditable(await loadReview(taskId));
    if (m.runState === "completed" || m.runState === "stale" || m.runState === "failed") {
      return { state: m.runState, message: m.runError?.message ?? null };
    }

    if (!m.executionId) {
      const found = await reconcileExecution(m);
      if (!found) {
        return {
          state: m.runState,
          message:
            m.runState === "start_unknown"
              ? "No matching Graph8 execution was found yet. Check the workflow's execution history in Graph8 before starting a new comparison."
              : "The comparison has not started yet.",
        };
      }
      ({ task, manifest: m } = await saveManifest(task, { ...m, executionId: found, runState: "running", runError: null }));
    }

    const ex = await getExecution(m.executionId!);
    if (!ex.terminal) return { state: "running", message: null };
    if (ex.status !== "completed") {
      const saved = await saveManifest(task, { ...m, runState: "failed", runError: { code: `workflow_${ex.status}`, message: friendlyRunError(ex.errorMessage) } });
      return { state: saved.manifest.runState, message: saved.manifest.runError?.message ?? null };
    }

    // Re-fetch evidence and confirm it is unchanged before trusting citations.
    const deal = await getDeal(m.dealId);
    let ev: Evidence;
    try {
      ev = await prepareEvidence(deal, m.quoteId, m.sourceRefs, m.mode, m.matchConfirmed);
    } catch (err) {
      if (err instanceof AppRequestError) {
        const saved = await saveManifest(task, { ...m, runState: "stale", runError: { code: "evidence_unavailable", message: err.message } });
        return { state: saved.manifest.runState, message: err.message };
      }
      throw err;
    }
    const changed =
      ev.quoteDoc.versionHash !== m.quoteHash || ev.sources.some((s) => sourceHash(s.documents) !== m.sourceHashes[refKey(s.ref)]);
    if (changed) {
      const message = "The quote or a selected source changed while the comparison ran. Run a new comparison against the current versions.";
      const saved = await saveManifest(task, { ...m, runState: "stale", runError: { code: "evidence_changed", message } });
      return { state: saved.manifest.runState, message };
    }

    const v = validateModelOutput({
      raw: ex.rawResult,
      fallbackParsed: ex.parsedResult,
      documents: ev.documents,
      quote: ev.quoteDoc,
      maxFindings: env().PROMISEGUARD_MAX_FINDINGS,
    });
    if (!v.ok) {
      const saved = await saveManifest(task, {
        ...m,
        runState: "failed",
        runError: { code: v.code, message: `${v.message} No findings are shown. You can run the comparison again (uses AI credits).` },
      });
      return { state: saved.manifest.runState, message: saved.manifest.runError?.message ?? null };
    }

    const cited = new Set(v.findings.flatMap((f) => f.salesEvidence.map((c) => c.documentId)));
    const labels = m.sourceLabels;
    const documents: ReviewManifest["documents"] = {};
    for (const d of ev.documents) {
      if (!cited.has(d.id)) continue;
      documents[d.id] = { source: labels[refKey(d.parent)] ?? refKey(d.parent), speaker: d.speaker, side: d.speakerSide, at: d.occurredAt, synthetic: d.synthetic };
    }
    const notes = [...ev.quoteDoc.limitations];
    if (!m.discoveryComplete) notes.push("Source discovery was incomplete. Recheck when all evidence can be read.");
    if (v.truncated) notes.push("The model reported more findings than could be included.");
    if (v.rejected.length) notes.push(`${v.rejected.length} finding(s) were rejected because their evidence could not be verified.`);
    if (m.mode === "demo") notes.push(`Sales evidence is the ${SAMPLE_LABEL.toLowerCase()} (synthetic), not a Graph8 email or transcript.`);

    await saveManifest(task, {
      ...m,
      runState: "completed",
      runError: null,
      report: v.findings,
      rejected: v.rejected,
      truncated: v.truncated,
      documents,
      coverageComplete: m.discoveryComplete === true && ev.quoteDoc.textComplete && !v.truncated && v.rejected.length === 0,
      coverageNotes: notes,
      completedAt: new Date().toISOString(),
    });
    return { state: "completed", message: null };
  });
}

export type IssueView = {
  taskId: string;
  findingId: string;
  title: string;
  status: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  priority: number | null;
};

export type ReviewView = {
  taskId: string;
  taskStatus: string | null;
  taskTitle: string;
  manifest: ReviewManifest | null;
  readOnlyReason: string | null;
  execution: { status: string; terminal: boolean; error: string | null } | null;
  issues: Record<string, IssueView>;
  freshness: "current" | "changed" | "unknown" | null;
  counts: ReturnType<typeof summarize> | null;
  awaitingReview: number;
  assignees: Array<{ id: string; name: string }>;
};

/** Read-only view: never mutates Graph8 tasks. */
export async function getReviewView(taskId: string, opts: { checkFreshness?: boolean } = {}): Promise<ReviewView> {
  const r = await loadReview(taskId);
  const m = r.manifest;
  let execution: ReviewView["execution"] = null;
  if (m?.executionId && (m.runState === "running" || m.runState === "preparing")) {
    const ex = await getExecution(m.executionId);
    execution = { status: ex.status, terminal: ex.terminal, error: ex.errorMessage ? friendlyRunError(ex.errorMessage) : null };
  }

  const issues: Record<string, IssueView> = {};
  if (m && Object.keys(m.issueTaskIds).length) {
    const children = await listSubtasks(taskId);
    for (const [findingId, issueId] of Object.entries(m.issueTaskIds)) {
      const t = children.find((c) => c.id === issueId) ?? (await getTask(issueId).catch(() => null));
      if (!t) continue;
      issues[findingId] = {
        taskId: t.id,
        findingId,
        title: t.title,
        status: t.status,
        assigneeId: t.assigneeId,
        assigneeName: env().assignees.find((a) => a.id === t.assigneeId)?.name ?? t.assigneeName,
        dueDate: t.dueDate,
        priority: t.priority,
      };
    }
  }

  let freshness: ReviewView["freshness"] = null;
  if (m?.runState === "completed" && opts.checkFreshness) {
    try {
      const deal = await getDeal(m.dealId);
      const ev = await prepareEvidence(deal, m.quoteId, m.sourceRefs, m.mode, m.matchConfirmed);
      const scan = await findSourceCandidates(deal, m.mode);
      if (!discoveryComplete(scan)) throw new AppRequestError("discovery_incomplete", "Source discovery is incomplete.", 409);
      const hashes = Object.fromEntries(ev.sources.map((s) => [refKey(s.ref), sourceHash(s.documents)]));
      const same = m.discoveredSourceKeys && m.discoveryComplete && m.promptVersion === PROMPT_VERSION &&
        evidenceFingerprint(ev.quoteDoc.versionHash, hashes, discoveryKeys(scan), m.mode) === evidenceFingerprint(m.quoteHash, m.sourceHashes, m.discoveredSourceKeys, m.mode);
      freshness = same ? "current" : "changed";
    } catch {
      freshness = "unknown";
    }
  }

  const decided = new Set(m?.humanDecisions.map((d) => d.findingId) ?? []);
  const awaitingReview = (m?.report ?? []).filter((f) => !decided.has(f.id) && !m?.issueTaskIds[f.id]).length;

  return {
    taskId: r.task.id,
    taskStatus: r.task.status,
    taskTitle: r.task.title,
    manifest: m,
    readOnlyReason: r.readOnlyReason,
    execution,
    issues,
    freshness,
    counts: m?.report ? summarize(m.report) : null,
    awaitingReview,
    assignees: env().assignees,
  };
}

export function findFinding(m: ReviewManifest, findingId: string): Finding {
  const f = m.report?.find((x) => x.id === findingId);
  if (!f) throw new AppRequestError("finding_not_found", "This finding is not part of the review.", 404);
  return f;
}

export function checkRevision(m: ReviewManifest, expected: number) {
  if (m.revision !== expected) {
    throw new AppRequestError("stale_revision", "This review changed since you loaded it. Refresh and try again.", 409);
  }
}

export async function recordDecision(
  taskId: string,
  findingId: string,
  input: { decision: "confirmed" | "dismissed" | "resolved"; reason: string; expectedRevision: number },
) {
  return withLock(`review:${taskId}`, async () => {
    const { task, manifest: m } = requireEditable(await loadReview(taskId));
    checkRevision(m, input.expectedRevision);
    findFinding(m, findingId);
    const reason = input.reason.trim();
    if (input.decision !== "confirmed" && !reason) {
      throw new AppRequestError("reason_required", input.decision === "dismissed" ? "Give a reason for dismissing." : "Explain the resolution.", 422);
    }
    const decision = { findingId, decision: input.decision, reason, actorLabel: "Workspace reviewer", at: new Date().toISOString() };
    const saved = await saveManifest(task, { ...m, humanDecisions: [...m.humanDecisions, decision] });
    return { revision: saved.manifest.revision };
  });
}

function issueDescription(m: ReviewManifest, f: Finding, reviewTaskId: string, requestId: string): string {
  const lines = [
    `PromiseGuard issue from review ${reviewTaskId}`,
    `Commitment: ${f.commitment}`,
    `Coverage (AI finding): ${f.coverage.replace("_", " ")}`,
    `Reason: ${f.reason}`,
    "",
    "Sales evidence:",
    ...f.salesEvidence.map((c) => {
      const d = m.documents[c.documentId];
      return `- "${c.excerpt}" (${d?.speaker ?? "unknown speaker"}; ${d?.source ?? c.documentId}${d?.synthetic ? "; synthetic sample" : ""})`;
    }),
  ];
  if (f.quoteEvidence.length) {
    lines.push("", `Quote evidence (${m.quoteLabel}):`, ...f.quoteEvidence.map((c) => `- "${c.excerpt}" (${c.documentId})`));
  }
  if (f.conditions.length) lines.push("", "Conditions:", ...f.conditions.map((c) => `- ${c}`));
  lines.push("", `Required clarification: ${f.suggestedAction}`, "", "Decision support only; not a determination of contractual liability.");
  lines.push("", issueMarkerLine({ reviewTaskId, findingId: f.id, requestId }));
  return lines.join("\n");
}

export async function assignIssue(
  taskId: string,
  findingId: string,
  input: { title: string; assigneeId: string | null; dueDate: string | null; priority: number; requestId: string },
) {
  return withLock(`review:${taskId}`, async () => {
    let { task, manifest: m } = requireEditable(await loadReview(taskId));
    const f = findFinding(m, findingId);
    if (m.issueTaskIds[findingId]) return { issueTaskId: m.issueTaskIds[findingId], recovered: true };
    if (input.assigneeId && !env().assignees.some((a) => a.id === input.assigneeId)) {
      throw new AppRequestError("assignee_not_allowed", "Choose an assignee from the verified list.", 422);
    }

    const findExisting = async () => (await listSubtasks(taskId)).find((t) => parseIssueMarker(t.description)?.findingId === findingId) ?? null;
    let issue = await findExisting();
    if (!issue) {
      const prefix = m.mode === "demo" ? DEMO_TITLE_PREFIX : REVIEW_TITLE_PREFIX;
      try {
        issue = await createSubtask(taskId, {
          title: `${prefix} ${input.title.trim()} [${findingId.slice(2, 10)}]`.slice(0, 250),
          description: issueDescription(m, f, taskId, input.requestId),
          entity_type: "deal",
          entity_id: m.dealId,
          priority: input.priority,
          tags: [REVIEW_TAG, "promiseguard-issue", ...(m.mode === "demo" ? ["promiseguard-demo"] : [])],
          ...(input.dueDate ? { due_date: input.dueDate } : {}),
          ...(input.assigneeId ? { assignee_id: input.assigneeId } : {}),
        });
      } catch (err) {
        if (err instanceof Graph8Error && (err.code === "timeout" || err.code === "network" || err.code === "server_error")) {
          issue = await findExisting().catch(() => null);
          if (!issue) {
            throw new AppRequestError("create_uncertain", "Graph8 did not confirm the issue task. Retry; PromiseGuard will look for it before creating another.", 502);
          }
        } else throw err;
      }
    }

    const decisions = m.humanDecisions.some((d) => d.findingId === findingId)
      ? m.humanDecisions
      : [...m.humanDecisions, { findingId, decision: "confirmed" as const, reason: "Issue assigned for resolution.", actorLabel: "Workspace reviewer", at: new Date().toISOString() }];
    ({ task, manifest: m } = await saveManifest(task, { ...m, issueTaskIds: { ...m.issueTaskIds, [findingId]: issue.id }, humanDecisions: decisions }));
    return { issueTaskId: issue.id, recovered: false };
  });
}

/** Completing an issue records a resolution; it never changes the AI's coverage verdict. */
export async function updateIssue(
  issueTaskId: string,
  input: { reviewTaskId: string; requestedStatus: "open" | "completed"; resolution: string; expectedRevision: number },
) {
  return withLock(`review:${input.reviewTaskId}`, async () => {
    const issue = await getTask(issueTaskId);
    const marker = parseIssueMarker(issue.description);
    if (!marker || marker.reviewTaskId !== input.reviewTaskId || issue.parentTaskId !== input.reviewTaskId) {
      throw new AppRequestError("issue_not_found", "This task is not an issue of the selected review.", 404);
    }
    const { task, manifest: m } = requireEditable(await loadReview(input.reviewTaskId));
    if (m.issueTaskIds[marker.findingId] !== issueTaskId) {
      throw new AppRequestError("issue_not_found", "This issue is not recorded on the review.", 404);
    }
    checkRevision(m, input.expectedRevision);
    const resolution = input.resolution.trim();
    if (input.requestedStatus === "completed" && !resolution) {
      throw new AppRequestError("reason_required", "Explain how the issue was resolved.", 422);
    }
    await patchTask(issueTaskId, { status: input.requestedStatus }, issue.updatedAt);
    const decision =
      input.requestedStatus === "completed"
        ? { findingId: marker.findingId, decision: "resolved" as const, reason: resolution, actorLabel: "Workspace reviewer", at: new Date().toISOString() }
        : null;
    const saved = await saveManifest(task, { ...m, humanDecisions: decision ? [...m.humanDecisions, decision] : m.humanDecisions });
    return { revision: saved.manifest.revision };
  });
}

export async function recheckReview(taskId: string, requestId: string) {
  const { manifest: m } = requireEditable(await loadReview(taskId));
  return startReview({
    dealId: m.dealId,
    quoteId: m.quoteId,
    sourceRefs: m.sourceRefs,
    matchConfirmed: m.matchConfirmed,
    requestId,
    mode: m.mode,
    previousReviewTaskId: taskId,
  });
}
