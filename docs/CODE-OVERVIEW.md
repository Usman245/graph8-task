# Code overview

A short map of the codebase. For setup and running, see the [README](../README.md).

## Folders

| Folder | What lives there |
|---|---|
| `src/app/page.tsx`, `src/app/login` | Public landing page and sign-in |
| `src/app/(protected)` | Signed-in pages: Deals, deal workspace, Review, Quote Guard, Delivery, Connection |
| `src/app/api` | Internal API routes (session-protected), plus the public Graph8 webhook |
| `src/components` | React components, one per file, named after the component (`ReviewWorkspace.tsx`) |
| `src/components/ui` | Small shared UI pieces: `Button`, `Badge`, `Drawer`, `PageHeader`, formatting helpers |
| `src/lib/graph8` | The only code that talks to Graph8: a server-only client and one adapter per resource |
| `src/lib/promiseguard` | Product logic: reviews, evidence checks, send gate, fixes, delivery |
| `src/lib/auth`, `src/lib/api` | Login session, route guard, and the `{ ok, data \| error }` response envelope |
| `scripts` | `setup-promiseguard.mts` (Graph8 skill, workflow, demo data, webhook) and `setup-live-fixture.mts` |

## How a review works

1. The user picks a quote and conversations on the deal page (`DealWorkspace`).
2. `runs.ts` re-reads everything from Graph8, saves a review task, and starts the Graph8 workflow.
3. The Graph8 AI skill (`prompt.ts`) compares the promises with the quote.
4. `validate-evidence.ts` keeps only findings whose quoted words really exist in the sources.
5. The result is saved back into the Graph8 review task (`repository.ts`, `manifest.ts`).
6. `ReviewWorkspace` shows the findings; actions write decisions, issues, and fixes to Graph8.

## Key modules in `src/lib/promiseguard`

| File | Role |
|---|---|
| `runs.ts` | Start, finish, and recheck a review; decisions and issue tasks |
| `sources.ts`, `normalize.ts` | Find and read emails, meetings, notes, deal memory, or sample conversations as plain text |
| `matching.ts` | Which quotes belong to a deal |
| `prompt.ts`, `schemas.ts` | AI prompt, expected AI output, and all app data shapes (Zod) |
| `validate-evidence.ts` | Rejects findings whose excerpts cannot be found; applies risk rules |
| `repository.ts`, `manifest.ts` | Store and load reviews inside Graph8 task descriptions |
| `guard.ts`, `gate-rules.ts`, `freshness.ts` | Quote Guard: automatic reviews, the send gate, and "is this review still current?" |
| `fixes.ts` | Fix in quote, and buyer clarification notes |
| `delivery.ts`, `delivery-schema.ts` | Promise Handoff and the Delivery board |
| `mode.ts`, `sample-data.ts` | Demo vs Live mode, and the labeled demo scenarios |
| `context.ts`, `capabilities.ts`, `example.ts` | Data for the deal page, the Connection checks, and the demo example link |

## Rules the code follows

- Graph8 is the only source of data and AI; nothing is stored outside Graph8.
- The Graph8 key stays on the server; the browser only sends IDs and choices.
- Writes to Graph8 are never retried blindly; saves are conditional (Graph8 returns 409 on conflict).
- A human decision never changes the AI's original finding.
- Sample data is always labeled and never used in Live mode.

## Where to change things

| To change | Edit |
|---|---|
| Demo deals, quotes, or conversations | `sample-data.ts`, then `node scripts/setup-promiseguard.mts records` |
| What the AI checks | `prompt.ts`, then `node scripts/setup-promiseguard.mts skill` |
| When sending is blocked | `gate-rules.ts` |
| A Graph8 endpoint or response shape | the matching file in `src/lib/graph8/adapters` |
| Page layout or wording | the component in `src/components` |
