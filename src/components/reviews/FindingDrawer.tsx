"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { COVERAGE_LABEL, CoverageBadge, RiskBadge, SampleBadge } from "@/components/Status";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { formatDate } from "@/components/ui/format";
import { ApiError, api } from "@/lib/api/client-fetch";
import type { ReviewQuote } from "@/lib/promiseguard/fixes";
import { BLOCKING_COVERAGE } from "@/lib/promiseguard/gate-rules";
import type { ReviewView } from "@/lib/promiseguard/runs";
import type { Finding } from "@/lib/promiseguard/schemas";

type Panel = "none" | "confirm" | "dismiss" | "resolve" | "assign" | "complete_issue";

const fieldClass = "pg-field mt-1.5";

export function FindingDrawer({
  reviewTaskId,
  view,
  finding,
  onClose,
  onChanged,
  onRecheck,
}: {
  reviewTaskId: string;
  view: ReviewView;
  finding: Finding | null;
  onClose: () => void;
  onChanged: () => void;
  onRecheck: () => void;
}) {
  return (
    <Drawer
      open={Boolean(finding)}
      onClose={onClose}
      title={
        finding && (
          <span className="block">
            <span className="flex flex-wrap items-center gap-2">
              <span className="pg-eyebrow">Finding</span>
              <CoverageBadge coverage={finding.coverage} />
            </span>
            <span className="mt-1.5 block">{finding.commitment}</span>
          </span>
        )
      }
    >
      {finding && (
        <>
          <FindingBody key={finding.id} reviewTaskId={reviewTaskId} view={view} f={finding} onChanged={onChanged} />
          {(BLOCKING_COVERAGE.includes(finding.coverage) || ["medium", "high"].includes(finding.commercialRisk?.level ?? "")) && (
            <FixPanel key={`fix-${finding.id}`} reviewTaskId={reviewTaskId} view={view} f={finding} onChanged={onChanged} onRecheck={onRecheck} />
          )}
        </>
      )}
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
        <h3 className="pg-eyebrow">What the seller said</h3>
        {f.salesEvidence.map((c, i) => {
          const d = m.documents[c.documentId];
          return (
            <figure key={i} className="rounded-xl border-l-4 border-primary bg-primary-soft/40 p-4">
              <blockquote className="whitespace-pre-wrap text-[15px] leading-relaxed">&ldquo;{c.excerpt}&rdquo;</blockquote>
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
        <h3 className="pg-eyebrow">What the quotation says</h3>
        {f.quoteEvidence.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background p-4 text-muted">
            {f.coverage === "missing"
              ? `No supporting clause was found in the supplied quote text (${m.quoteIncludedFields.join(", ") || "no fields"}).`
              : "No quote excerpt was cited."}
          </p>
        ) : (
          f.quoteEvidence.map((c, i) => (
            <figure key={i} className="rounded-xl border-l-4 border-foreground/25 bg-background p-4">
              <blockquote className="whitespace-pre-wrap text-[15px] leading-relaxed">&ldquo;{c.excerpt}&rdquo;</blockquote>
              <figcaption className="mt-2 text-xs text-muted">
                {m.quoteLabel} · <span className="font-mono">{c.documentId.split(":").slice(2).join(":")}</span>
              </figcaption>
            </figure>
          ))
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="pg-eyebrow">Assessment</h3>
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

      {f.commercialRisk && (
        <section className="space-y-3 rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="pg-eyebrow">Commercial feasibility</h3>
            <RiskBadge level={f.commercialRisk.level} />
            {f.commercialRisk.requiresApproval && <Badge tone="conflict">Approval recommended</Badge>}
          </div>
          <p>{f.commercialRisk.reason}</p>
          {f.commercialRisk.riskTypes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {f.commercialRisk.riskTypes.map((type) => <Badge key={type}>{type.replaceAll("_", " ")}</Badge>)}
            </div>
          )}
          {f.commercialRisk.missingInformation.length > 0 && (
            <div>
              <p className="font-medium">Information to clarify</p>
              <ul className="list-disc pl-5">{f.commercialRisk.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          )}
          {f.commercialRisk.recommendedClause && (
            <div>
              <p className="font-medium">Safer measurable wording</p>
              <blockquote className="mt-1 rounded-lg border-l-4 border-covered bg-covered-soft/60 p-3">{f.commercialRisk.recommendedClause}</blockquote>
            </div>
          )}
          <p className="text-xs text-muted">AI decision support based only on this review’s evidence. It does not calculate actual cost, margin, capacity, or legal liability.</p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="pg-eyebrow">Review history</h3>
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
          <div className="rounded-xl border border-border p-4">
            <p className="font-semibold">{issue.title}</p>
            <p className="text-xs text-muted">
              Graph8 task {issue.status ?? "unknown"} · {issue.assigneeName ?? (issue.assigneeId ? issue.assigneeId : "Unassigned")} · due{" "}
              {formatDate(issue.dueDate)}
            </p>
            <p className="mt-1 text-xs text-muted">Completing the issue records a resolution; it does not change the AI verdict.</p>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl bg-background p-4">
        <p className="pg-eyebrow">Your decision</p>
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
            className="pg-fade space-y-3 rounded-xl border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (panel === "confirm") decide("confirmed");
              else if (panel === "dismiss") decide("dismissed");
              else if (panel === "resolve") decide("resolved");
              else setIssueStatus("completed");
            }}
          >
            <label htmlFor="decision-text" className="pg-label">
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
            className="pg-fade grid gap-4 rounded-xl border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              assign();
            }}
          >
            <div>
              <label htmlFor="issue-title" className="pg-label">
                Task title
              </label>
              <input id="issue-title" className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="issue-assignee" className="pg-label">
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
                <label htmlFor="issue-due" className="pg-label">
                  Due date
                </label>
                <input id="issue-due" type="date" className={fieldClass} value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
              <div>
                <label htmlFor="issue-priority" className="pg-label">
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

const CONFIRMED_HEADING = "Commitments confirmed in sales conversations";

/** The current terms plus the commitment as a new clause, for the reviewer to edit before saving. */
function proposedTerms(current: string, f: Finding): string {
  const wording = f.commercialRisk?.recommendedClause.trim() || `${f.commitment.trim().replace(/\.$/, "")}${f.conditions.length ? ` (${f.conditions.join("; ")})` : ""}.`;
  const line = `- ${wording.replace(/^[-•]\s*/, "")}`;
  const base = current.replace(/\r\n?/g, "\n").trimEnd();
  if (base.includes(CONFIRMED_HEADING)) return `${base}\n${line}`;
  return `${base}${base ? "\n\n" : ""}${CONFIRMED_HEADING}\n${line}`;
}

function clarificationDraft(f: Finding, quoteLabel: string): string {
  const said = f.salesEvidence[0]?.excerpt;
  const quoted = f.quoteEvidence[0]?.excerpt;
  return [
    "Hi,",
    "",
    `Before you review our quote (${quoteLabel.replace(/^\[PromiseGuard Demo\]\s*/, "")}), one clarification on: ${f.commitment}.`,
    "",
    said ? `In our conversation we said: "${said}"` : null,
    f.coverage === "conflict" && quoted ? `The quote states: "${quoted}"` : "The quote as written does not include this.",
    "",
    f.suggestedAction,
    "",
    "Could you confirm how you would like us to proceed?",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function FixPanel({
  reviewTaskId,
  view,
  f,
  onChanged,
  onRecheck,
}: {
  reviewTaskId: string;
  view: ReviewView;
  f: Finding;
  onChanged: () => void;
  onRecheck: () => void;
}) {
  const m = view.manifest!;
  const [panel, setPanel] = useState<"none" | "terms" | "note">("none");
  const [terms, setTerms] = useState<string | null>(null);
  const [note, setNote] = useState(() => clarificationDraft(f, m.quoteLabel));
  const [ackRecall, setAckRecall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"terms" | "note" | null>(null);
  const quote = useQuery({
    queryKey: ["review-quote", reviewTaskId],
    queryFn: () => api<ReviewQuote>(`/api/reviews/${encodeURIComponent(reviewTaskId)}/quote`),
    enabled: panel === "terms",
  });
  const draftTerms = terms ?? (quote.data ? proposedTerms(quote.data.termsContent, f) : "");
  const url = `/api/reviews/${encodeURIComponent(reviewTaskId)}/findings/${encodeURIComponent(f.id)}/fix`;

  async function submit(body: Record<string, unknown>, kind: "terms" | "note") {
    setBusy(true);
    setError(null);
    try {
      await api(url, { method: "POST", body: JSON.stringify({ ...body, expectedRevision: m.revision }) });
      setDone(kind);
      setPanel("none");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The fix could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-primary/20 bg-primary-soft/30 p-4 text-sm">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="m10.5 2.5 3 3-8 8H2.5v-3l8-8Z" strokeLinejoin="round" />
          </svg>
          Fix it
        </h3>
        <p className="text-muted">
          Either put the promise into the quote, or tell the buyer what the quote actually covers. Both are saved in Graph8
          {m.mode === "demo" ? " (on the demo deal and its draft quote)" : ""}.
        </p>
      </div>

      {done === "terms" && (
        <div className="space-y-3 rounded-xl border border-covered/25 bg-covered-soft p-4 text-covered">
          <p>Quote terms updated in Graph8. Run a recheck: the gate clears once a review of the new quote version shows it covered.</p>
          <Button onClick={onRecheck}>Recheck against the updated quote</Button>
        </div>
      )}
      {done === "note" && (
        <p className="rounded-xl border border-covered/25 bg-covered-soft p-4 text-covered">
          Clarification saved as a Graph8 deal note. Send it to the buyer, then record a resolution once they agree.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant={panel === "terms" ? "primary" : "secondary"} onClick={() => setPanel(panel === "terms" ? "none" : "terms")}>
          Fix in quote
        </Button>
        <Button variant={panel === "note" ? "primary" : "secondary"} onClick={() => setPanel(panel === "note" ? "none" : "note")}>
          Draft buyer clarification
        </Button>
      </div>

      {panel === "terms" &&
        (quote.isPending ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
        ) : quote.isError ? (
          <p className="text-conflict">{quote.error.message}</p>
        ) : !quote.data.editable ? (
          <p className="text-conflict">{quote.data.reason}</p>
        ) : (
          <form
            className="pg-fade space-y-3 rounded-xl border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit({ kind: "quote_terms", termsContent: draftTerms, acknowledgeRecall: ackRecall }, "terms");
            }}
          >
            <label htmlFor="fix-terms" className="pg-label">
              Quote terms (saved to the Graph8 quote&apos;s terms)
            </label>
            {f.coverage === "conflict" && f.quoteEvidence[0] && (
              <p className="rounded-lg bg-conflict-soft p-3 text-conflict">
                Also edit or remove the conflicting clause: &ldquo;{f.quoteEvidence[0].excerpt}&rdquo;
              </p>
            )}
            {f.commercialRisk?.recommendedClause && (
              <p className="rounded-lg bg-missing-soft p-3 text-missing">
                Graph8 AI supplied safer wording below. Review it and remove or edit any existing guarantee or ambiguous clause before saving.
              </p>
            )}
            <textarea id="fix-terms" className={fieldClass + " font-mono text-xs"} rows={12} maxLength={20000} value={draftTerms} onChange={(e) => setTerms(e.target.value)} />
            {quote.data.recallsSentQuote && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-conflict/25 bg-conflict-soft p-3 text-conflict">
                <input type="checkbox" className="pg-check mt-0.5" checked={ackRecall} onChange={(e) => setAckRecall(e.target.checked)} />
                <span>This quote was already sent. Saving recalls it to draft and voids the buyer&apos;s signing link.</span>
              </label>
            )}
            <p className="text-xs text-muted">Only the terms change. Line items and prices are untouched; adjust pricing in Graph8 if the promise has a cost.</p>
            <Button type="submit" disabled={busy || (quote.data.recallsSentQuote && !ackRecall)}>
              {busy ? "Saving…" : "Update quote in Graph8"}
            </Button>
          </form>
        ))}

      {panel === "note" && (
        <form
          className="pg-fade space-y-3 rounded-xl border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ kind: "clarification_note", content: note }, "note");
          }}
        >
          <label htmlFor="fix-note" className="pg-label">
            Clarification for the buyer
          </label>
          <textarea id="fix-note" className={fieldClass} rows={10} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted">Saved as a deal note in Graph8 for the rep to send. PromiseGuard never emails the buyer itself.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || note.trim().length < 10}>
              {busy ? "Saving…" : "Save as Graph8 deal note"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(note)}>
              Copy text
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
  );
}
