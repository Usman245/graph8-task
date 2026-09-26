"use client";

import { useRef, useState } from "react";
import { COVERAGE_LABEL, CoverageBadge, SampleBadge } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { formatDate } from "@/components/ui/format";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { ReviewView } from "@/lib/promiseguard/runs";
import type { Finding } from "@/lib/promiseguard/schemas";

type Panel = "none" | "confirm" | "dismiss" | "resolve" | "assign" | "complete_issue";

const fieldClass = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";

export function FindingDrawer({
  reviewTaskId,
  view,
  finding,
  onClose,
  onChanged,
}: {
  reviewTaskId: string;
  view: ReviewView;
  finding: Finding | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Drawer
      open={Boolean(finding)}
      onClose={onClose}
      title={
        finding && (
          <span className="flex flex-wrap items-center gap-2">
            {finding.commitment} <CoverageBadge coverage={finding.coverage} />
          </span>
        )
      }
    >
      {finding && <FindingBody key={finding.id} reviewTaskId={reviewTaskId} view={view} f={finding} onChanged={onChanged} />}
    </Drawer>
  );
}

function FindingBody({ reviewTaskId, view, f, onChanged }: { reviewTaskId: string; view: ReviewView; f: Finding; onChanged: () => void }) {
  const m = view.manifest!;
  const issue = view.issues[f.id];
  const decisions = m.humanDecisions.filter((d) => d.findingId === f.id);
  const [panel, setPanel] = useState<Panel>("none");
  const [text, setText] = useState("");
  const [title, setTitle] = useState(`Resolve ${f.category}: ${f.commitment}`.slice(0, 120));
  const [assignee, setAssignee] = useState<string>("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignRequest = useRef<string | null>(null);
  const base = `/api/reviews/${encodeURIComponent(reviewTaskId)}/findings/${encodeURIComponent(f.id)}`;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPanel("none");
      setText("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }

  const decide = (decision: "confirmed" | "dismissed" | "resolved") =>
    run(() => api(`${base}/decision`, { method: "POST", body: JSON.stringify({ decision, reason: text, expectedRevision: m.revision }) }));

  const assign = () => {
    assignRequest.current ??= crypto.randomUUID();
    return run(() =>
      api(`${base}/assign`, {
        method: "POST",
        body: JSON.stringify({ title, assigneeId: assignee || null, dueDate: due || null, priority, requestId: assignRequest.current }),
      }),
    );
  };

  const setIssueStatus = (requestedStatus: "open" | "completed") =>
    run(() =>
      api(`/api/issues/${encodeURIComponent(issue!.taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ reviewTaskId, requestedStatus, resolution: text, expectedRevision: m.revision }),
      }),
    );

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-2">
        <h3 className="font-semibold">What the seller said</h3>
        {f.salesEvidence.map((c, i) => {
          const d = m.documents[c.documentId];
          return (
            <figure key={i} className="rounded-md border-l-4 border-primary bg-background p-3">
              <blockquote className="whitespace-pre-wrap">&ldquo;{c.excerpt}&rdquo;</blockquote>
              <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-medium text-foreground">{d?.speaker ?? "Unknown speaker"}</span>
                <Badge tone={d?.side === "seller" ? "primary" : d?.side === "buyer" ? "neutral" : "review"}>{d?.side ?? "unknown"}</Badge>
                {d?.synthetic && <SampleBadge />}
                <span>{d?.source ?? "Unknown source"}</span>
                <span>{formatDate(d?.at, true)}</span>
                <span className="font-mono">{c.documentId}</span>
              </figcaption>
            </figure>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">What the quotation says</h3>
        {f.quoteEvidence.length === 0 ? (
          <p className="rounded-md bg-background p-3 text-muted">
            {f.coverage === "missing"
              ? `No supporting clause was found in the supplied quote text (${m.quoteIncludedFields.join(", ") || "no fields"}).`
              : "No quote excerpt was cited."}
          </p>
        ) : (
          f.quoteEvidence.map((c, i) => (
            <figure key={i} className="rounded-md border-l-4 border-border bg-background p-3">
              <blockquote className="whitespace-pre-wrap">&ldquo;{c.excerpt}&rdquo;</blockquote>
              <figcaption className="mt-2 text-xs text-muted">
                {m.quoteLabel} · <span className="font-mono">{c.documentId.split(":").slice(2).join(":")}</span>
              </figcaption>
            </figure>
          ))
        )}
      </section>

      <section className="space-y-1">
        <h3 className="font-semibold">Assessment</h3>
        <p>{f.reason}</p>
        {f.adjustment && (
          <p className="text-missing">
            PromiseGuard adjusted the AI verdict from {COVERAGE_LABEL[f.modelCoverage ?? f.coverage]} to {COVERAGE_LABEL[f.coverage]}: {f.adjustment}
          </p>
        )}
        {f.conditions.length > 0 && (
          <div>
            <p className="font-medium">Conditions</p>
            <ul className="list-disc pl-5">
              {f.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <span className="font-medium">Suggested action:</span> {f.suggestedAction}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Review history</h3>
        {decisions.length === 0 && !issue ? (
          <p className="text-muted">No human decision yet. The AI finding above is unchanged by any action below.</p>
        ) : (
          <ul className="space-y-1">
            {decisions.map((d, i) => (
              <li key={i} className="text-muted">
                <span className="font-medium capitalize text-foreground">{d.decision}</span> · {formatDate(d.at, true)}
                {d.reason && ` · ${d.reason}`}
              </li>
            ))}
          </ul>
        )}
        {issue && (
          <div className="rounded-md border border-border p-3">
            <p className="font-medium">{issue.title}</p>
            <p className="text-xs text-muted">
              Graph8 task {issue.status ?? "unknown"} · {issue.assigneeName ?? (issue.assigneeId ? issue.assigneeId : "Unassigned")} · due{" "}
              {formatDate(issue.dueDate)}
            </p>
            <p className="mt-1 text-xs text-muted">Completing the issue records a resolution; it does not change the AI verdict.</p>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap gap-2">
          {!issue && (
            <>
              <Button variant="secondary" onClick={() => setPanel("confirm")}>
                Confirm finding
              </Button>
              <Button onClick={() => setPanel("assign")}>Assign issue</Button>
              <Button variant="secondary" onClick={() => setPanel("dismiss")}>
                Dismiss
              </Button>
              <Button variant="secondary" onClick={() => setPanel("resolve")}>
                Record resolution
              </Button>
            </>
          )}
          {issue && issue.status !== "completed" && <Button onClick={() => setPanel("complete_issue")}>Mark issue resolved</Button>}
          {issue && issue.status === "completed" && (
            <Button variant="secondary" disabled={busy} onClick={() => setIssueStatus("open")}>
              Reopen issue
            </Button>
          )}
        </div>

        {(panel === "confirm" || panel === "dismiss" || panel === "resolve" || panel === "complete_issue") && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (panel === "confirm") decide("confirmed");
              else if (panel === "dismiss") decide("dismissed");
              else if (panel === "resolve") decide("resolved");
              else setIssueStatus("completed");
            }}
          >
            <label htmlFor="decision-text" className="block font-medium">
              {panel === "confirm" ? "Note (optional)" : panel === "dismiss" ? "Reason for dismissing (required)" : "How was it resolved? (required)"}
            </label>
            <textarea id="decision-text" className={fieldClass} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || (panel !== "confirm" && !text.trim())}>
                {busy ? "Saving…" : "Save to Graph8"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPanel("none")}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {panel === "assign" && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              assign();
            }}
          >
            <div>
              <label htmlFor="issue-title" className="block font-medium">
                Task title
              </label>
              <input id="issue-title" className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="issue-assignee" className="block font-medium">
                  Assignee
                </label>
                <select id="issue-assignee" className={fieldClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {view.assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="issue-due" className="block font-medium">
                  Due date
                </label>
                <input id="issue-due" type="date" className={fieldClass} value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div>
                <label htmlFor="issue-priority" className="block font-medium">
                  Priority
                </label>
                <select id="issue-priority" className={fieldClass} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                  <option value={1}>Graph8 priority 1</option>
                  <option value={2}>Graph8 priority 2</option>
                  <option value={3}>Graph8 priority 3</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted">Creates a Graph8 task under this review, linked to the deal.</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || title.trim().length < 3}>
                {busy ? "Creating…" : "Create Graph8 task"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPanel("none")}>
                Cancel
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="text-conflict">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
