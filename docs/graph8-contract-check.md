# Graph8 contract check

Observed against the configured workspace on 2026-09-26 with `node scripts/check-graph8.mts`.
Contains response shapes only. No credentials or customer content.

## Workspace contents

| Resource | Endpoint | Status | Records |
|---|---|---|---|
| Deals | `GET /deals?page=1&limit=5` | 200 | 0 |
| Companies | `GET /companies?page=1&limit=5` | 200 | 0 |
| Contacts | `GET /contacts?page=1&limit=5` | 200 | 0 |
| Quotes | `GET /quotes?page=1&limit=5` | 200 | 0 |
| Email inbox | `GET /inbox?channel=email&page=1&page_size=5` | 200 | 0 |
| Meetings | `GET /inbox/meetings?page=1&page_size=5` (also `has_transcript=true`) | 200 | 0 |
| Meeting transcripts | `GET /meeting-transcripts?limit=5` | 200 | 0 |
| Tasks | `GET /tasks?limit=5&offset=0` | 200 | 0 |
| LLM models | `GET /skills/models` | 200 | 9 |
| Skills | `GET /skills` | 200 | 14 (none owned by PromiseGuard) |
| Workflows | `GET /workflows` | 200 | 0 |
| Node schema | `GET /workflows/node-types/schema?detail=full` | 200 | 67 node types |
| OpenAPI | `GET /openapi.json` (with Bearer key) | 200 | 2701 paths |

**Blocker:** the workspace has no deals, quotes, emails, or transcripts, so the live read path cannot be verified yet.

## Response envelopes (they differ — no universal `data` assumption)

| Endpoint | Envelope |
|---|---|
| `/deals`, `/inbox`, `/inbox/meetings`, `/tasks`, `/companies`, `/contacts` | `{ data: T[], pagination: { page, limit, total, has_next, next_cursor } }` |
| `/quotes` | `{ data: { items: T[], total, page, limit }, pagination: null }` |
| `/meeting-transcripts` | `{ data: { transcripts: T[], total, limit, offset }, pagination: null }` |
| `/skills` | `{ actions: Skill[], total_count }` |
| `/workflows` | `{ actions: Workflow[], total_count }` |
| `/skills/models` | `{ models: Array<{ id, provider, label }>, total }` |
| `/notes` | error envelope on `GET` without required params: `{ error, message, detail, type, code, param, request_id }` |

## Skills

Skill objects: `id` (number), `action_id` (UUID string), `org_id`, `name`, `description`, `category`,
`object_type`, `enabled`, `runtime_type` (`"llm"`), `requires_approval`, `is_template`, `prompt_template`,
`created_at`, `updated_at`, `capability_summary { node_count, mutating_operations, spends_credits, runs_custom_code, required_inputs[] }`, `managed_by`.

`capability_summary.required_inputs` lists the template variables Graph8 extracted from the prompt.

Available models include `claude-sonnet-4-6`, `gpt-4o`, `gpt-4o-mini` (all executed by Graph8).

## Workflow authoring rules (from the live node schema)

- Exactly one `trigger` node, first in `nodes`; `start_node_id` equals its `node_id`. `start`/`end` nodes are deprecated.
- snake_case keys only (`node_id`, `node_type`, `start_node_id`, `edge_type`, `input_mappings`).
- Interpolation: `${node_id.field}`, `${input.field}` (= `${trigger.field}`, the execute `input_data`). Unresolved placeholders resolve to None / pass through verbatim.
- `trigger.config.trigger_type` includes `tool_call` with `config.input_schema` defining accepted inputs — the candidate for an API-executed workflow.
- `action` node runs a saved skill: `config.action_id` (required), `action_type` (`llm`), `input_mappings: [{ target_field, source_expression }]`, `on_error`, `timeout` (seconds). Output: `${node_id.result}` (string or object), `tokens_input`, `tokens_output`, `status`. There is **no** `output` field.
- `parse_json` node: `config.input` (e.g. `${compare.result}`), `on_error`. Output `${node.result}`, `${node.error}`.

Planned graph (to validate with `POST /workflows/validate`): `trigger(tool_call)` → `action(PromiseGuard Compare v1)` → `parse_json`.

## Endpoints present in OpenAPI (not yet exercised)

- Create: `POST /companies`, `POST /contacts`, `POST /deals`, `POST /quotes`, `POST /tasks`, `POST /skills`, `POST /workflows`.
- Tasks: `GET|PATCH|DELETE /tasks/{task_id}`, `GET|POST /tasks/{task_id}/subtasks`, `GET /tasks/records/{entity_type}/{entity_id}`, `POST|DELETE /tasks/{task_id}/resolve`.
- Workflows: `POST /workflows/validate`, `POST /workflows/{action_id}/execute`, `GET /workflows/executions/{execution_id}`, `GET /workflows/executions` (recover lost execution IDs).
- Skills: `POST /skills/validate`, `POST /skills/{action_id}/execute`.
- Transcripts: read-only (`/meeting-transcripts`, `/inbox/meetings/{id}`); links only via `transcript-link`. **No documented endpoint creates an email or a transcript** — these arrive through connected mailboxes / recorders.

## Still to verify

- Deal detail, quote detail fields (scope/terms/line descriptions), email thread and meeting detail shapes — need records.
- Skill create/validate, workflow validate/save/execute, execution result nesting.
- Task create with `entity_type=deal`, description round-trip size, `parent_task_id`/subtasks.
- Required scopes per operation.

## Verified for Quote Guard (2026-09-26, live calls from the app)

| Capability | Endpoint | Observed |
|---|---|---|
| Deal notes | `GET /deals/{id}/notes` | `{ data: Note[], pagination: null }`; Note has `id, content, created_by_name, created_at` |
| Create note | `POST /deals/{id}/notes` `{ content }` | `{ data: Note }` |
| Deal memory | `GET /deals/{id}/memory` | `{ data: { deal_id, review_count, average_score, reviews: [] } }`. Review items are an open shape; not yet observed with meetings |
| Webhooks | `GET /webhooks` | `{ data: Webhook[] }`. `POST` returns the signing secret once; the signing header scheme is undocumented |
| Webhook events | `GET /webhooks/events` | includes `quote.created`, `quote.updated`, `quote.sent`, `quote.resent`, `deal.stage_changed` |
| Quote terms edit | `PATCH /quotes/{id}` `{ terms_content }` | draft edited in place; `sent`/`viewed` are recalled to draft (voids signing link) per OpenAPI |
| Send preview | `POST /quotes/{id}/send-preview` | renders subject and recipient, sends nothing. 422 `QUOTE_BILLING_FIELDS_REQUIRED` until `billing_email` and `billing_address` are set |
| Quote list | `GET /quotes?page=1&limit=100` | `{ data: { items, total } }`; rows include `deal_id`, `terms_content`, `signer_contact_email` (not line items) |
| Quote signer | `GET /quotes/{id}` | a contact signer has `signer_email: null` and `signer_contact_email` set |
| Deal create | `POST /deals` | requires `contact_ids`; 409 if the company already has a deal unless `allow_duplicate: true` |
| Quote create | `POST /quotes` | requires `contract_start_date` and a recipient (`signer_contact_id` or `signer_email` + `signer_name`) |

Not exercised: `POST /quotes/{id}/send` (the live send). It was only reached through the gate's refusal path, since no real
buyer was available to receive a quote.
