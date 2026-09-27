# PromiseGuard

**Stop revenue leaking between what sales promised and what gets signed.**

An account manager tells a bakery "we'll run your TikTok too" on a call. The quote says "TikTok is not included". Nobody
notices until the work starts, and then it becomes a discount, an argument about scope, or a lost client. PromiseGuard sits on top of Graph8 and closes that gap:

1. **It reviews eligible quotes automatically.** When a quote is created or edited in Graph8, a webhook triggers a review against
   the deal's emails, meeting transcripts, deal notes, and Graph8 deal memory.
2. **It shows the exact words on both sides.** Every promise is marked **Covered**, **Missing**, **Conflict**, or
   **Needs review**, with verbatim excerpts that the server checks against the source text before showing anything.
3. **It guards sends made through PromiseGuard.** The gate stays closed while gaps are open, the review is incomplete, or
   its evidence is out of date or unreadable. Overrides need a reason, which is logged in Graph8.
4. **It fixes the gap in one click.** Either write the promise into the quote's terms (then recheck to prove it's covered), or
   save a buyer clarification as a Graph8 deal note.
5. **It hands covered promises into delivery.** After a Live quote is accepted in Graph8, Promise Handoff creates an owned,
   dated Graph8 delivery task that keeps the seller excerpt, quote clause, conditions, and scheduling decision together. The
   Delivery board surfaces overdue obligations and requires completion evidence before the task is shown as completed.

Graph8 is the only external business and AI provider. Deals, quotes, conversations, the AI comparison (a Graph8 skill inside a
Graph8 workflow), saved reviews, issues, alerts, and notes all live in Graph8. The Next.js app adds the UI, the autopilot, the
send gate, record matching, evidence verification, and access control.

> PromiseGuard is decision support. It does not determine contractual liability or whether the work can be delivered.


New to the code? Start with the short [code overview](docs/CODE-OVERVIEW.md).

## Why this matters in a crowded hackathon

Many revenue agents can discover prospects, draft outreach, qualify replies, or recommend a next step. Graph8 already does
much of that work. PromiseGuard owns the handoff where revenue becomes an obligation: what the seller said, what the quote
actually says, what was accepted, and who now owns delivery.

The product has two linked controls:

`conversation → quote`  **Quote Guard** verifies the promise before sending.

`accepted quote → delivery`  **Promise Handoff** preserves the evidence, assigns an owner, sets a date, and tracks completion.

That makes the demo measurable: one contradiction is blocked, one quote is corrected, one accepted promise becomes Graph8 work,
and one owner records completion evidence. It also gives Graph8 a reusable pattern for making autonomous revenue actions
accountable after the send, where a generic sales agent stops.

---

## The 90-second demo story

1. **Quote Guard** shows quotes with their gate state, including *Promise risks open*, *Review out of date*,
   *Review incomplete*, *Not reviewed*, and *Clear to send*.
2. A rep edits a quote in Graph8. The webhook fires, PromiseGuard waits for edits to settle, then reviews it with no clicks.
   The activity feed shows "Review started" and the row turns red.
3. The rep clicks **Send…**, and the gate blocks it: *"We'll host the website for free for the first year" conflicts with "Website
   hosting is not included"*.
4. Open the review, then **Fix it → Fix in quote**. The promise is written into the Graph8 quote's terms.
   **Recheck**, and the finding becomes *Covered* and the gate turns *Clear to send*.
5. **Send quote.** In Live mode Graph8 emails it for e-signature. In Demo mode Graph8 renders the send preview and delivers
   nothing.
6. **After acceptance, hand off the promise.** Open Promise Handoff, choose a covered promise, assign a Graph8 team member,
   acknowledge its conditions, and set a date. Delivery shows the task and lets the owner record completion evidence.

The gate does not intercept Graph8's own send button or other API clients. If someone sends directly while the gate is not
clear, a delivered `quote.sent` webhook triggers a priority-1 Graph8 alert task. This is detection after sending, not
platform-wide prevention.

---

## Two modes: Demo and Live

The switch is in the top-right of every page, and a banner always shows the active mode. **Both modes call the real Graph8
API.** They differ in the records/evidence they use and whether sending delivers an email.

| | **Demo mode** | **Live mode** |
|---|---|---|
| Deals and quotes | `[PromiseGuard Demo]` deals and **draft** quotes stored in Graph8 | Your real Graph8 deals and quotes (demo records hidden) |
| Sales conversations | **Sample conversation**: synthetic text in `src/lib/promiseguard/sample-data.ts`, labeled "Sample data" everywhere | Graph8 **email threads**, **meeting transcripts**, **deal notes**, and **deal memory** (commitments Graph8 extracted from meeting reviews) |
| AI comparison | Real Graph8 skill + workflow run | Real Graph8 skill + workflow run |
| Autopilot (webhook / scan) | Reviews demo quotes on `quote.created` / `quote.updated` | Reviews real quotes on `quote.created` / `quote.updated` |
| Fix in quote | Edits the demo **draft** quote's terms in Graph8 | Edits the real quote's terms in Graph8 (a sent quote is recalled to draft only after you confirm) |
| Buyer clarification | Graph8 deal note on the demo deal | Graph8 deal note on the real deal |
| Guarded send | Graph8 **send-preview**: renders subject and recipient, **sends nothing** | Graph8 **e-signature send** to the quote's signer (explicit confirmation required) |
| Saved reviews, issues, alerts | Graph8 tasks prefixed `[PromiseGuard Demo]` | Graph8 tasks prefixed `[PromiseGuard]` |

Sample evidence can never enter a Live review: the server rejects sample sources in Live mode, and demo deals cannot be
reviewed, fixed, or sent in Live mode (and vice versa). Each review stores its own mode.

### Run it in Demo mode

1. Complete **Local setup** below, including `node scripts/setup-promiseguard.mts skill workflow records`.
2. `npm run dev`, sign in, and pick **Demo mode** in the header.
3. Open **Quote Guard**. The four demo deals' quotes are listed. Click **Scan now** (or **Review now** on a row) to review any
   quote marked *Not reviewed*.
4. Follow the 90-second story above. Every write goes to `[PromiseGuard Demo]` records in Graph8. To reset demo quotes after
   using **Fix in quote**, rerun `node scripts/setup-promiseguard.mts records`: it restores draft terms from `sample-data.ts`.

### Run it in Live mode

Live mode needs real records in your Graph8 workspace. The fastest honest ways to get them:

- **Safe hackathon fixture.** Run `node scripts/setup-live-fixture.mts`. It idempotently creates one non-demo company,
  contact, deal, seller-recap deal note, and conflicting **draft** quote in Graph8. The records are clearly labelled
  `PromiseGuard Live`, use a reserved `.example` address, and are never sent. Because the evidence is a real Graph8 deal
  note—not `sample-data.ts`—the app treats this as Live mode while the scenario remains safe to rehearse.

- **Deal notes (quickest).** In Graph8, create a deal with a contact and a quote (with a signer and billing details). Add a note
  on the deal with the call recap the rep would normally write, for example *"Confirmed 24/7 phone support for the first 6
  months."* Deal notes are real Graph8 records and are picked up immediately.
- **Email.** Connect a mailbox in Graph8 and exchange an email with the deal contact's address. Threads are matched only by
  exact contact email.
- **Meetings.** Record a meeting with a connected recorder. Transcripts, and Graph8's deal memory built from meeting reviews,
  are picked up.

Then:

1. Set `PROMISEGUARD_SELLER_DOMAINS` to your company's email domains. Only those speakers count as the seller in emails and
   transcripts.
2. Sign in and pick **Live mode**. **Quote Guard** lists your real quotes; **Review now** runs the comparison. With the webhook
   registered (below), creating or editing the quote in Graph8 is enough.
3. **Send…** runs the real Graph8 send only when the gate is clear, or with a logged override reason, and only after you tick
   the confirmation.
4. After Graph8 marks the quote **accepted**, open the review's **Promise Handoff** panel. Live handoff is intentionally gated on
   acceptance so delivery work is not created for an offer that never became a customer commitment.

### Turn on the autopilot (Graph8 webhook)

Graph8 must be able to reach your app over HTTPS. Locally, use a tunnel:

```bash
npx cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Put the tunnel URL and a random token in `.env.local`, restart `npm run dev`, then register the webhook:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # -> PROMISEGUARD_WEBHOOK_TOKEN
node scripts/setup-promiseguard.mts webhook       # registers quote.created, quote.updated, quote.sent
node scripts/setup-promiseguard.mts webhook:off   # deactivates it
```

Quote Guard then shows **Webhook live**. Without a public URL, everything still works: **Scan now** does the same work on
demand. A quiet period (`PROMISEGUARD_AUTOPILOT_DELAY_SECONDS`, default 15) folds a burst of edits into one review. An
completed, complete review is reused only when the quote, selected source contents, discovered source IDs, mode, and prompt
version match. New replies in an existing thread or edits to an existing note therefore invalidate reuse even if the source
ID stays the same. Failed or incomplete same-input reviews require **Review now** to retry; webhook retries do not spend
credits repeatedly. The source text budget is applied before computing the review identity.

To exercise the receiver without Graph8 (Git Bash):

```bash
curl -X POST "http://localhost:3000/api/webhooks/graph8?token=$PROMISEGUARD_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" -d '{"event":"quote.updated","data":{"id":"<quote id>"}}'
```

---

## How the pieces fit

1. **Sources.** Demo uses the sample conversation. Live uses emails and meetings matched by exact contact email (never by
   name), plus the deal's notes and deal memory. PromiseGuard's own notes (prefixed `[PromiseGuard]`) are never used as
   evidence. Up to 5 sources per review. The autopilot selects the most recent readable ones and drops the oldest if the text
   is too long.
2. **Comparison.** The server rebuilds the evidence from Graph8 and runs the `PromiseGuard Compare v1` skill (prompt `pg-v4`)
   inside `PromiseGuard Compare Workflow v1`. It then verifies every quoted excerpt against the exact source text. Unverifiable
   findings are rejected and listed. The same Graph8 AI run also assesses each promise for guarantees, undefined success
   metrics, open-ended scope, dependencies, risky timing, and unclear pricing. It cannot invent internal cost or capacity.
3. **Gate.** The newest completed review of *that exact quote version* is checked against current evidence. The board, send
   dialog, and server-side send each verify freshness; a prior green dialog is not trusted by the send endpoint. Selected
   sources are reloaded and content-hashed, and the current bounded discovery set is compared with the saved source IDs.
   Added/removed sources or changed selected content require another review. Discovery/read failures, rejected findings,
   truncated findings, and incomplete quote text cannot produce *Clear to send*, even with zero open findings. A finding
   stays open until a reviewer **dismisses** it or **records a resolution**. "Fix in quote" changes the quote; a recheck must
   verify the new version. A logged override is available for blocked sends.
4. **Persistence.** Everything is saved in Graph8: one review task per comparison (with a readable summary and a versioned
   `PG_MANIFEST_V1` block), one subtask per assigned issue, alert tasks, and deal notes. A refresh, a closed tab, or a server
   restart recovers the same state. Reviews also finalize on the server, so they complete even with no page open.

## Promise Handoff: from signed quote to accountable delivery

Quote review prevents a mismatch. Promise Handoff closes the next operational gap: a promise can be covered in the quote and
still be forgotten after the customer accepts it.

For each **Covered** finding, the reviewer can create one Graph8 task with:

- the exact seller excerpt and quote excerpt;
- the extracted conditions and the reviewer’s scheduling reason;
- a Graph8 team-member owner and an explicit UTC target date;
- a stable idempotency marker so repeated clicks do not create duplicate work.

The Delivery page reads those Graph8 tasks, groups them into scheduled, overdue, and completion states, and links back to the
source review. Completing a task requires a human evidence note and a conditional Graph8 update. The note proves that a
reviewer recorded completion; it does not prove contractual performance automatically.

Live handoff requires all of the following: the quote is accepted in Graph8, the review is the latest review of the current
quote version, the evidence is current, the review has complete coverage, and no promise risks remain open. Demo mode supports a
clearly labeled rehearsal on a draft quote and never accepts a quote, sends email, or creates billing.

This is the product boundary: PromiseGuard protects the transition from sales promise to signed scope, then carries that scope
into Graph8 work with an owner and deadline. It does not determine legal liability or independently verify that delivery occurred.

## Promise Feasibility: test the Graph8 AI risk layer

Update the existing Graph8 skill and workflow after pulling this version:

```bash
node scripts/setup-promiseguard.mts skill workflow
```

For a deterministic three-deal Live-mode walkthrough, add each **seller recap** below as a Graph8 deal note, then create a
draft quote with the matching **quote terms**. Link the quote to the deal and give it a signer and billing details.

| Deal | Seller recap (Graph8 deal note) | Quote terms | Expected AI result |
|---|---|---|---|
| Holiday Marketing Campaign | `We guarantee at least 30 qualified leads in the first month. The paid advertising budget is included in our $20,000 fee. We will send a report every Friday.` | `Three-month marketing campaign. Weekly reports are included. Advertising media spend is excluded. Results are not guaranteed.` | Conflicts on the guarantee and ad budget; **high risk** for a guarantee and undefined “qualified lead”; approval recommended with safer measurable wording. |
| Customer Appreciation Event | `We will manage an event for up to 200 guests. Photography is included. If the venue cancels, we will give the customer a full refund.` | `Event planning for up to 200 guests. Photography is excluded. All deposits are non-refundable.` | Photography and refund conflicts; dependency/pricing risk; the model should ask who carries venue-cancellation cost. |
| Customer Service Training Program | `We will deliver three workshops for 25 employees, provide printed handbooks, and hold one follow-up coaching session within 30 days.` | `Three workshops for up to 25 employees, printed handbooks, and one follow-up coaching session within 30 days are included.` | All promises covered and mostly **low risk** because quantity, audience, deliverables, and timing are bounded. |

In PromiseGuard, switch to **Live mode**, open a deal, select its draft quote and deal note, and choose **Check promises**.
Open the completed review and inspect **Promise feasibility**. High and medium items show risk factors, facts to clarify,
safer wording, and whether approval is recommended. A high-risk promise keeps the send gate closed until a reviewer records a
resolution or dismissal with a reason. **Fix in quote** starts with the safer wording, but a person must review it and remove
any conflicting unsafe clause.
Existing `pg-v3` reviews remain readable; use **Recheck** to obtain the new feasibility assessment. Each check or recheck uses
Graph8 AI credits.

### Updating an existing installation

Older `PG_MANIFEST_V1` reviews remain readable. Reviews without the new source-discovery baseline show *Review out of date*
and require **Review now** or **Recheck** before the gate can clear. No data migration, demo reset, or Graph8 skill/workflow
update is required for this gate change. Rechecks run the Graph8 workflow and use credits.

*Clear to send* means no unresolved findings in the selected, verified review scope. It does not establish that every
historical conversation was searched or that the model found every promise.

---

## Prerequisites

- Node.js 24 (developed on 24.19) and npm
- A Graph8 workspace API key with access to deals, quotes, inbox, meetings, notes, skills, workflows, tasks, and webhooks
- Graph8 AI credits for the chosen model

The Graph8 API contract observed with the development key is in `docs/graph8-contract-check.md`.

---

## Local setup

```bash
npm install
```

Put the Graph8 settings in `.env` and the app secrets in `.env.local` (both gitignored; an empty variable in `.env.local`
overrides `.env`, so don't repeat `GRAPH8_*` there):

```dotenv
GRAPH8_BASE_URL=https://be.graph8.com/api/v1
GRAPH8_API_KEY=your_graph8_key
GRAPH8_WORKFLOW_ID=        # printed by the setup script
GRAPH8_SKILL_ID=           # printed by the setup script
GRAPH8_MODEL_ID=gpt-4o

PROMISEGUARD_APP_PASSWORD=choose-a-strong-password
PROMISEGUARD_SESSION_SECRET=   # 32+ random characters
PROMISEGUARD_SELLER_DOMAINS=agency.example
PROMISEGUARD_ASSIGNEES=        # teamMemberId:Name,teamMemberId2:Name2
PROMISEGUARD_DEMO_ENABLED=true

# Quote Guard autopilot (optional)
PROMISEGUARD_PUBLIC_URL=       # https URL Graph8 can reach, e.g. your tunnel
PROMISEGUARD_WEBHOOK_TOKEN=    # 32+ random characters
PROMISEGUARD_AUTOPILOT_DELAY_SECONDS=15

PROMISEGUARD_MAX_SOURCES=5
PROMISEGUARD_MAX_SOURCE_CHARS=40000
PROMISEGUARD_MAX_QUOTE_CHARS=12000
PROMISEGUARD_MAX_FINDINGS=12
PROMISEGUARD_MAX_REPORT_BYTES=24000
```

Generate secrets (PowerShell or bash): `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

| Variable | Purpose |
|---|---|
| `GRAPH8_API_KEY` | Server-side Graph8 key. Never exposed to the browser; never use a `NEXT_PUBLIC_` prefix. |
| `PROMISEGUARD_APP_PASSWORD` | Login password for the app. Without it, anyone with the URL could read deals and spend AI credits through the server's key. |
| `PROMISEGUARD_SESSION_SECRET` | Signs the HttpOnly session cookie (12-hour sessions). |
| `PROMISEGUARD_SELLER_DOMAINS` | Your company's email domains. Only speakers on these domains count as the seller; unknown speakers are flagged for review. |
| `PROMISEGUARD_ASSIGNEES` | Graph8 **team-member IDs** offered as issue assignees (`node scripts/setup-promiseguard.mts users`). |
| `PROMISEGUARD_DEMO_ENABLED` | Shows the Demo mode option. |
| `PROMISEGUARD_PUBLIC_URL` | Public HTTPS base URL for the Graph8 webhook. Optional; without it, use **Scan now**. |
| `PROMISEGUARD_WEBHOOK_TOKEN` | Secret in the webhook URL that authenticates Graph8's calls (24+ characters). The webhook route returns 503 without it. |
| `PROMISEGUARD_AUTOPILOT_DELAY_SECONDS` | Quiet period after a quote edit before the automatic review starts. |
| `PROMISEGUARD_MAX_*` | Conservative app limits (not Graph8 limits). Oversized reviews are refused, never silently truncated. |

### Create the Graph8 skill, workflow, demo records, and webhook

```bash
node scripts/setup-promiseguard.mts skill workflow   # comparison skill (prompt pg-v4) + workflow, validated before saving
node scripts/setup-promiseguard.mts records          # demo companies, contacts, deals, draft quotes (with billing details)
node scripts/setup-promiseguard.mts records:bakery   # one scenario only (bakery, cafe, gym, dental, yoga)
node scripts/setup-promiseguard.mts users            # team-member IDs for PROMISEGUARD_ASSIGNEES
node scripts/setup-promiseguard.mts webhook          # Quote Guard autopilot (needs PUBLIC_URL + WEBHOOK_TOKEN)
```

Reruns reuse existing records and only edit demo quotes that are still drafts. The records step never sends anything. Rerun
`skill` after changing `prompt.ts` so Graph8 uses the new prompt. Copy the printed `GRAPH8_SKILL_ID` and `GRAPH8_WORKFLOW_ID`
into `.env`.

### Run

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
npm run lint
```

Sign in with `PROMISEGUARD_APP_PASSWORD`, then open **Connection** to confirm every Graph8 check shows "Available".

### Demo scenarios

The seller in every scenario is **Brightside Marketing**, a small digital marketing agency (account manager Maya Brooks),
selling to five local businesses. The language is deliberately everyday, so non-technical viewers can follow each gap.
Created in Graph8 by the setup script. Expected results are in `sample-data.ts` (`expected`).

| Deal | What it demonstrates |
|---|---|
| **Bloom Bakery social media** (headline example) | "We'll run your TikTok" **conflicts** with "TikTok is not included"; a monthly photographer is **missing**; the monthly likes/followers report is **covered**; the owner's logo request is not treated as a promise |
| **Green Leaf Café Google search** | Two quote versions (choosing the right one matters); "first page of Google in 2 months" **conflicts** with "no ranking guarantee"; "first month free if you sign by October 15" keeps its condition; a later email withdraws "we'll reply to your reviews" |
| **Summit Fitness online ads** | "50 new members a month guaranteed" and "same fee for 2 years" **conflict** with the quote; weekly updates are **missing**; a freelance videographer's promise should be **needs review**; a one-month trial quote not linked to the deal needs confirming |
| **Rivera Family Dental new website** | Pages, changes, and booking button **covered**; "free hosting for the first year" **conflicts**. The best quote for the fix-and-send story: fix hosting, recheck, clear, send |
| **Harbor Yoga email newsletter** | A clean quote: every promise **covered**, Quote Guard **Clear to send**. Its covered promises were handed to delivery, so the **Delivery** page shows owners, due dates, one overdue task, and one completed with evidence |

---

## What is live and what is sample (for judges)

- **Live Graph8, in both modes:** deal and quote records, the LLM execution (Graph8 skill inside a Graph8 workflow), the webhook
  subscription, review tasks, issue subtasks, sent-with-gaps alert tasks, deal notes, quote term edits, the send
  (e-signature in Live, send-preview in Demo), Promise Handoff tasks, and completion evidence.
- **Sample:** only the sales conversation text in Demo mode. It is never presented as a Graph8 email or transcript. Graph8 has
  no API to create inbox messages or transcripts; those arrive through connected mailboxes and recorders.
- **Verified end to end against the live API (2026-09-26):**
  - Demo: webhook event → debounced auto-review → gate blocks send → Fix in quote → recheck shows Covered → gate clears →
    Graph8 send-preview.
  - Live: a real deal with a deal note → auto-review found a conflict → gate blocked the send → clarification saved as a deal
    note and excluded from later evidence.
- **Not yet exercised with real data:** email and meeting-transcript adapters, deal memory with populated meeting reviews, the
  live `POST /quotes/{id}/send`, a delivery from Graph8's webhook service (the receiver was tested with the same payload
  shape posted locally), and an accepted Live quote followed by a real Promise Handoff completion.

---

## Deploying privately

Target: **one long-running Node instance** (Railway, Render, Fly, or Docker on a VPS running `npm run build && npm start`). Set
every variable in the host's environment settings, then run `node scripts/setup-promiseguard.mts webhook` with
`PROMISEGUARD_PUBLIC_URL` set to the deployed URL.

The autopilot's quiet-period timers, the activity feed, the login rate limit, and the per-review mutation queue are
**in-memory**. On serverless hosting (e.g. Vercel) they don't span instances. The Quote Guard page and **Scan now** still work,
and Graph8's conditional task writes (`expected_updated_at`, 409 on conflict) still prevent lost updates.

`GET /api/health` returns `{ "status": "ok" }` without touching Graph8. Cookies are `Secure` in production.

---

## Security

- The Graph8 key stays on the server; the browser only sends IDs and decisions, never evidence text or AI output.
- Every page and API route checks the signed session; mutations also check `Origin`. The one exception is
  `POST /api/webhooks/graph8`, which requires the secret URL token (constant-time compare). Its payload is only a hint: the quote
  is always re-read from Graph8, so a forged event can at most trigger a review of a real quote.
- Every mutation re-validates that the task is a PromiseGuard review (or an issue of that review) for the same deal, that the
  deal matches the review's mode, and that notes and memory belong to the deal being reviewed.
- Live sends require the gate to be clear (or a logged override reason) plus an explicit confirmation. Demo never calls the
  real send endpoint. PromiseGuard never emails a buyer itself; clarifications are saved as notes for the rep.
- Source text is rendered as escaped plain text; email HTML is converted to text on the server. Record contents and
  credentials are never logged.

---

## Known limitations

- **Enforcement is app-local.** Direct Graph8 sends bypass this gate; the webhook alert is retrospective. The freshness reads
  and Graph8's send are separate API calls, so an external edit between them cannot be prevented atomically by this app.
- **Promise Handoff is accountability, not proof of work.** It creates and tracks Graph8 tasks with human-entered completion
  evidence. It does not inspect a ticketing system, deploy, file, or customer acceptance to verify delivery.
- **Source-only changes do not trigger the registered quote webhooks.** The next board refresh, gate check, or send detects
  changed selected content or a changed discovery set. Use **Scan now** or **Review now** to run the new comparison.
- **Graph8's webhook signing scheme is undocumented**, so deliveries are authenticated by the URL token rather than a signature.
  The receiver accepts `{ event, data: { id } }` and common variants, and logs only top-level keys for unknown shapes.
- **Deal memory review items have an open schema.** Commitments are read only from fields named like `commitments`, `promises`,
  or `next_steps`. They are AI summaries, not verbatim quotes, so they are labeled that way and default to *needs review*
  unless Graph8 marks the owner as the seller.
- **Model judgement varies.** Findings whose excerpts don't match the source are rejected. The model can miss a promise (in live
  testing it caught "24/7 support" but not "two workshops vs one"). A superseded promise may still be listed; reviewers can
  dismiss it with a reason.
- **Fix in quote edits terms only.** Line items and prices are untouched, so if a promise has a cost, adjust pricing in Graph8.
- **Scans are bounded.** Quote Guard lists the 50 most recent quotes. Email candidates come from the 150 most recent inbox
  threads, and meetings from the first 25 per contact for up to 5 contacts. Only selected sources (at most 5 by default) are
  compared and content-hashed. Edits to unselected sources are outside that review's scope. Source IDs newly appearing in
  or disappearing from the bounded discovery set invalidate the baseline, even when the change is due to pagination.
- **Graph8 skill defaults to `max_tokens: 1000`**; the setup script sets 4000. The skill uses `gpt-4o` (executed and billed by
  Graph8) because Graph8's Anthropic models reported low provider credit on the development workspace.
- Quote attachments cannot be read; a quote with attachments is marked "Quote text incomplete", and "missing" verdicts are
  downgraded to "needs review".

---

## Project structure

```
src/app/(protected)/guard            Quote Guard: gate board, autopilot status and activity, scan, guarded send
src/app/(protected)/deals            Deal list and deal workspace (quote + source selection)
src/app/(protected)/reviews/[id]     Review: send gate, main conflict, findings, evidence drawer with Fix it
src/app/(protected)/settings         Connection and capability checks
src/app/api/webhooks/graph8          Public Graph8 webhook receiver (token-authenticated)
src/app/api/*                        Internal, session-protected route handlers
src/lib/graph8/client.ts             Server-only Graph8 client (fixed origin, timeouts, safe errors, GET-only retries)
src/lib/graph8/adapters/*            Deals, quotes (incl. terms edit, send, send-preview), inbox, notes, memory, tasks,
                                     workflows, webhooks
src/lib/promiseguard/guard.ts        Autopilot (auto-review, debounce, server-side finalize), gate, guarded send, board
src/lib/promiseguard/gate-rules.ts   Open-finding and gate-state rules shared by server and UI
src/lib/promiseguard/freshness.ts    Request-scoped source reads, discovery baseline, and content fingerprint
src/lib/promiseguard/delivery.ts  Promise Handoff eligibility, Graph8 task creation, board, and completion
src/lib/promiseguard/delivery-schema.ts  Handoff marker, evidence schema, and delivery states
src/lib/promiseguard/fixes.ts        Fix in quote (terms) and buyer clarification (deal note)
src/lib/promiseguard/sources.ts      Source discovery and authorized loading (sample, email, meeting, note, memory)
src/lib/promiseguard/normalize.ts    Canonical evidence text and quote parts
src/lib/promiseguard/validate-evidence.ts   Citation verification and verdict adjustments
src/lib/promiseguard/runs.ts         Start / poll / finalize / decisions / issues lifecycle
src/lib/promiseguard/repository.ts   Review persistence in Graph8 tasks
src/lib/promiseguard/prompt.ts       Versioned comparison + feasibility prompt (pg-v4) and model output schema
src/lib/promiseguard/sample-data.ts  Demo scenarios and the synthetic sample conversations
src/proxy.ts                         Optimistic session redirect (Next.js 16 "proxy", formerly middleware)
scripts/*                            Setup (records, skill, workflow, webhook) and diagnostic scripts
docs/graph8-contract-check.md        Observed Graph8 API contract
```

Built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, TanStack Query, and Zod.
