# Founder OS — Current State After Phase 3

_Last updated: after Phase 3 merge to `main` (research → shared memory)._
_Documentation only. Contains no secrets, keys, tokens, or environment values._

Wryze.ai Founder OS V1 is a single Next.js 14 (App Router, JavaScript) app deployed
on Vercel, backed by Supabase (Postgres) for shared memory and Upstash Redis for
the SAT monitor. This document captures what is live, what is being written, and
what remains intentionally out of scope after Phase 3.

---

## What is live now

Four phases have shipped to `main` / Production:

- **Phase 1 — Supabase foundation.** 14 tables, 9 enums, RLS enabled on every
  table, `updated_at` triggers, indexes. Seeded with 5 agents and 4 knowledge-base
  documents. Server-only service-role client (`lib/supabaseServer.js`).
- **Phase 2 — Sales Pipeline on Supabase.** The dashboard reads real `leads` rows;
  status, notes, and outreach-draft edits persist. Existing password gate unchanged.
- **Phase 2.1 — Save reliability.** Free-text edits are debounced (only the final
  value is sent), and a failed save now surfaces an error toast instead of being
  silently dropped.
- **Phase 3 — Research → shared memory.** A task-driven research route and
  best-effort monitor writes feed `agent_tasks`, `events`, and `research_reports`.

The core architecture rules now hold in practice: agents run from `agent_tasks`
rows and emit structured `events`; external/risky actions remain unbuilt by design.

---

## Tables being written

| Table | Status |
|---|---|
| `leads` | **Written** — Phase 2 seed + dashboard PATCH updates |
| `agent_tasks` | **Written** — research route + SAT monitor |
| `events` | **Written** — `task_created`, `task_started`, `task_completed`, `task_failed`, `lead_researched` |
| `research_reports` | **Written** — manual topic runs + monitor-generated briefs |
| `agents` | Seeded; read-only (looked up by `resolveAgentId`) |
| `kb_documents` | Seeded; not yet consumed by any agent |
| `profiles` | Not written yet (no Supabase Auth) |
| `agent_task_dependencies` | Not written yet |
| `sales_assessments` | Not written yet |
| `outreach_drafts` | Not written yet |
| `support_drafts` | Not written yet |
| `approval_queue` | Not written yet |
| `weekly_ceo_summaries` | Not written yet |
| `agent_run_logs` | Not written yet |

Note: outreach draft text currently lives in `leads.metadata.outreach_draft`,
not the dedicated `outreach_drafts` table. That is intentional until Phase 6.

---

## Routes live

| Route | Purpose | Notes |
|---|---|---|
| `/` | Homepage research search | Stateless; unchanged |
| `/api/research` | Tavily + Claude topic summary | Stateless; unchanged |
| `/monitor` | SAT monitor status UI | Redis-backed |
| `/api/latest` | Latest brief / run status | Reads Redis |
| `/api/run-now` | Manual monitor trigger | Protected by a cron secret; now also writes shared memory on change-runs |
| `/api/cron` | Daily monitor trigger | Same as above |
| `/api/agents/research/run` | **New (Phase 3)** task-driven research | Gated by a shared-secret header; creates a task, runs research, writes a report, emits events |
| `/sales-pipeline` | Password-gated dashboard | Reads real `leads` |
| `/sales-pipeline/api/auth` · `/logout` | Login / logout for the dashboard | Cookie-based gate |
| `/sales-pipeline/api/leads/[id]` | PATCH a lead | Gated by the dashboard session cookie |

The new agent route is protected by an optional shared-secret request header: if
the secret env var is set (it is, in Production and Preview), requests without the
correct header are rejected with `401`.

---

## Intentionally out of scope (so far)

- Supabase Auth / `profiles` (the shared password gate is still in place).
- Combined Sales scoring agent / `sales_assessments` (scoring logic is still
  client-side in the dashboard data file).
- Outreach Agent / `outreach_drafts`.
- Customer Success Assistant / `support_drafts`.
- Approval Queue (`approval_queue`) and its UI.
- CEO weekly summary (`weekly_ceo_summaries`).
- `agent_task_dependencies` and `agent_run_logs` usage.
- D2C lead path (all current leads are `b2b`).
- A `lead_status_updated` event on dashboard status changes (the enum value does
  not exist yet; would require a small migration).
- Knowledge-base documents are seeded but not yet fed to any agent.

---

## Recommended Phase 4 options (plan only)

Recommended next step is **Option A** — it reuses the Phase 3 task/event spine,
adds no new UI, and unlocks the D2C path.

- **A — Combined Sales Agent → `sales_assessments`.** Move scoring server-side,
  extend for B2B + D2C, add a scoring route that creates a task, writes a
  `sales_assessments` row, and emits a `lead_scored` event. Lowest new surface,
  highest leverage. _(Original Phase 5.)_
- **B — Outreach drafts + Approval Queue (draft-only).** `outreach_drafts` +
  `approval_queue` + approve/reject routes + a minimal queue UI. Higher value for
  founder workload reduction, but more moving parts. _(Original Phase 6.)_
- **C — CEO weekly summary.** Read-only aggregation over events / reports /
  assessments → `weekly_ceo_summaries`. Low risk, and much richer once Option A
  exists. _(Original Phase 7.)_
- **D — Auth swap.** Supabase Auth + `profiles` + tightened RLS. Infrastructure;
  slot in whenever real per-user data is required.

Suggested order: **A → B → C**, with **D** whenever per-user data is required.

---

## Cleanup before Phase 4

- **Re-sync local `main`** with `origin/main` (it advanced with the Phase 3 squash
  commit).
- **Delete the merged feature branches** (all squash-merged):
  `feature/sales-pipeline-next-change`, `feature/phase2.1-debounce-saves`,
  `feature/phase3-research-memory`. **Keep `wip/local-doc-style-tweaks` untouched.**
- **Optional: remove test rows.** Preview/Production verification left a few
  "digital SAT test anxiety" rows in `agent_tasks` / `research_reports` / `events`.
  Harmless; delete the matching `events` and `research_reports`, then the
  `agent_tasks`, if a clean slate is preferred.
- **Already confirmed:** the agent-route shared secret is set in Production and
  Preview; the gate is verified.
- **Minor follow-up (not blocking):** decide whether topic-run reports should also
  store a `headline` / structured brief (currently lighter than the monitor's
  full brief).

None of the cleanup blocks Phase 4 — it is housekeeping.

---

## Current production verification status

All verified on Production (`main`) after the Phase 3 deploy:

- `POST /api/agents/research/run` **without** the secret header → `401 Unauthorized`.
- `POST /api/agents/research/run` **with a wrong** secret header → `401 Unauthorized`.
- `POST /api/agents/research/run` **with the correct** secret header → `200`,
  returning `ok: true`, a `task_id`, a `report_id`, and a report with 5 sources
  (confirmed via terminal).
- Supabase rows confirmed for the positive run:
  - `agent_tasks`: latest row `status = completed`, `agent_type = research`,
    topic = "digital SAT test anxiety".
  - `research_reports`: latest row topic = "digital SAT test anxiety", 5 sources.
  - `events`: latest rows `task_completed`, `task_started`, `task_created`.
- Existing surfaces still healthy: `/` renders, `/api/research` responds
  (`400` on empty topic), `/api/latest` `200`, `/monitor` `200`,
  `/sales-pipeline` `200`.

Phase 4 has **not** been started.
