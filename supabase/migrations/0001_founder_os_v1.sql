-- ============================================================================
-- Wryze Founder OS V1 — Phase 1 schema
-- File: supabase/migrations/0001_founder_os_v1.sql
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor (or via the Supabase CLI).
-- It is written to be safe to re-run: enums use guarded creation, tables use
-- IF NOT EXISTS, and seeds use ON CONFLICT DO NOTHING.
--
-- Scope (Phase 1 only):
--   * 9 enums
--   * 14 tables (UUID PKs, created_at/updated_at, FKs, JSONB, indexes)
--   * updated_at trigger
--   * RLS enabled on every table (internal-admin policy; service role bypasses)
--   * seed: 5 agents + 4 knowledge-base documents
--
-- NOT in Phase 1: Supabase Auth UI, agent logic, approval UI, dashboard rewrite.
-- The existing /sales-pipeline password gate is intentionally left untouched.
-- ============================================================================

create extension if not exists pgcrypto;  -- provides gen_random_uuid()

-- ============================================================================
-- 1) ENUMS
-- Guarded so re-running the file does not error if the type already exists.
-- ============================================================================
do $$ begin
  create type agent_type as enum ('research','sales','outreach','customer_success','ceo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_type as enum ('b2b','d2c');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending','running','completed','failed','needs_approval','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending','approved','rejected','expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_level as enum ('low','medium','high','critical','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outreach_channel as enum ('email','linkedin','sms','whatsapp','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_type as enum (
    'task_created','task_started','task_completed','task_failed',
    'lead_created','lead_researched','lead_scored',
    'outreach_draft_created','support_draft_created',
    'approval_submitted','approval_approved','approval_rejected',
    'weekly_summary_generated'
  );
exception when duplicate_object then null; end $$;

-- pipeline_stage and priority_level values intentionally match the existing
-- dashboard labels in app/sales-pipeline/leadsData.js so Phase 2 can connect
-- the UI to real rows without relabeling anything.
do $$ begin
  create type pipeline_stage as enum ('New','Qualified','Contacted','Follow-up','Interested','Closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority_level as enum ('High','Medium','Low');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2) updated_at TRIGGER FUNCTION
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 3) TABLES
-- ============================================================================

-- ---- profiles --------------------------------------------------------------
-- Phase 1: a plain table. Later, when Supabase Auth is added, `id` will be
-- linked to auth.users(id). For now we generate UUIDs so other tables can FK to it.
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  full_name   text,
  role        text not null default 'admin',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- agents ----------------------------------------------------------------
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  type        agent_type not null,
  description text,
  draft_only  boolean not null default false,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- kb_documents ----------------------------------------------------------
create table if not exists public.kb_documents (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  category    text,
  content     text,
  tags        text[] not null default '{}',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- leads -----------------------------------------------------------------
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  lead_type       lead_type not null default 'b2b',
  institute_name  text,                 -- B2B institute / D2C contact name
  contact_person  text,
  contact_email   text,
  contact_link    text,
  website         text,
  city            text,
  state           text,
  country         text,
  category        text,
  estimated_size  text,
  pipeline_stage  pipeline_stage not null default 'New',
  priority        priority_level,
  fit_score       integer,
  notes           text,
  source          text,
  metadata        jsonb not null default '{}'::jsonb,
  owner_id        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---- agent_tasks -----------------------------------------------------------
-- The ONLY way agents run: a row here. Agents never call each other directly.
create table if not exists public.agent_tasks (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid references public.agents(id) on delete set null,
  agent_type    agent_type not null,
  lead_id       uuid references public.leads(id) on delete set null,
  status        task_status not null default 'pending',
  priority      integer not null default 0,
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  error         text,
  scheduled_for timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- agent_task_dependencies ----------------------------------------------
-- Append-only join table: task_id waits on depends_on_task_id.
create table if not exists public.agent_task_dependencies (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references public.agent_tasks(id) on delete cascade,
  depends_on_task_id  uuid not null references public.agent_tasks(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (task_id, depends_on_task_id)
);

-- ---- events ----------------------------------------------------------------
-- Append-only event log. Agents emit these; later phases update shared memory
-- in response. No updated_at (events are immutable).
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  event_type  event_type not null,
  task_id     uuid references public.agent_tasks(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  agent_id    uuid references public.agents(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---- research_reports ------------------------------------------------------
create table if not exists public.research_reports (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid references public.agent_tasks(id) on delete set null,
  lead_id          uuid references public.leads(id) on delete set null,
  topic            text,
  headline         text,
  summary          text,
  structured       jsonb not null default '{}'::jsonb,  -- founder-brief JSON
  sources          jsonb not null default '[]'::jsonb,
  confidence_notes text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---- sales_assessments -----------------------------------------------------
create table if not exists public.sales_assessments (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.leads(id) on delete cascade,
  task_id        uuid references public.agent_tasks(id) on delete set null,
  lead_type      lead_type not null default 'b2b',
  fit_score      integer,
  priority       priority_level,
  rationale      text,
  signals        jsonb not null default '{}'::jsonb,
  rubric_version text not null default 'v1',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---- outreach_drafts -------------------------------------------------------
-- DRAFT ONLY. Nothing here is ever auto-sent. Risky drafts go to approval_queue.
create table if not exists public.outreach_drafts (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete cascade,
  task_id     uuid references public.agent_tasks(id) on delete set null,
  channel     outreach_channel not null default 'email',
  subject     text,
  body        text,
  status      approval_status not null default 'pending',
  risk_level  risk_level not null default 'low',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- support_drafts --------------------------------------------------------
-- DRAFT ONLY. Customer Success replies are never auto-sent in V1.
create table if not exists public.support_drafts (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete set null,
  task_id     uuid references public.agent_tasks(id) on delete set null,
  channel     outreach_channel not null default 'email',
  subject     text,
  body        text,
  status      approval_status not null default 'pending',
  risk_level  risk_level not null default 'low',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- approval_queue --------------------------------------------------------
-- Generic queue. entity_type + entity_id point at the thing being approved
-- (e.g. 'outreach_draft', 'support_draft') so we avoid circular foreign keys.
create table if not exists public.approval_queue (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null,
  entity_id      uuid not null,
  task_id        uuid references public.agent_tasks(id) on delete set null,
  lead_id        uuid references public.leads(id) on delete set null,
  agent_id       uuid references public.agents(id) on delete set null,
  risk_level     risk_level not null default 'medium',
  status         approval_status not null default 'pending',
  summary        text,
  payload        jsonb not null default '{}'::jsonb,
  submitted_by   uuid references public.profiles(id) on delete set null,
  reviewed_by    uuid references public.profiles(id) on delete set null,
  reviewed_at    timestamptz,
  decision_notes text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---- weekly_ceo_summaries --------------------------------------------------
-- CEO Agent output. Read-only/advisory: it summarizes and recommends only.
create table if not exists public.weekly_ceo_summaries (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid references public.agent_tasks(id) on delete set null,
  week_start          date,
  week_end            date,
  summary             text,
  highlights          jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  metrics             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---- agent_run_logs --------------------------------------------------------
-- Append-only operational log (one or more rows per task run).
create table if not exists public.agent_run_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.agent_tasks(id) on delete cascade,
  agent_id    uuid references public.agents(id) on delete set null,
  agent_type  agent_type,
  status      task_status,
  level       text not null default 'info',
  message     text,
  duration_ms integer,
  tokens_used integer,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 4) INDEXES
-- (PKs and UNIQUE constraints already create their own indexes.)
-- ============================================================================
create index if not exists idx_leads_pipeline_stage      on public.leads (pipeline_stage);
create index if not exists idx_leads_lead_type           on public.leads (lead_type);
create index if not exists idx_leads_created_at          on public.leads (created_at);

create index if not exists idx_tasks_lead_id             on public.agent_tasks (lead_id);
create index if not exists idx_tasks_agent_id            on public.agent_tasks (agent_id);
create index if not exists idx_tasks_status              on public.agent_tasks (status);
create index if not exists idx_tasks_created_at          on public.agent_tasks (created_at);

create index if not exists idx_taskdeps_task_id          on public.agent_task_dependencies (task_id);
create index if not exists idx_taskdeps_depends_on       on public.agent_task_dependencies (depends_on_task_id);

create index if not exists idx_events_event_type         on public.events (event_type);
create index if not exists idx_events_lead_id            on public.events (lead_id);
create index if not exists idx_events_task_id            on public.events (task_id);
create index if not exists idx_events_agent_id           on public.events (agent_id);
create index if not exists idx_events_created_at         on public.events (created_at);

create index if not exists idx_research_task_id          on public.research_reports (task_id);
create index if not exists idx_research_lead_id          on public.research_reports (lead_id);
create index if not exists idx_research_created_at       on public.research_reports (created_at);

create index if not exists idx_assess_lead_id            on public.sales_assessments (lead_id);
create index if not exists idx_assess_task_id            on public.sales_assessments (task_id);
create index if not exists idx_assess_created_at         on public.sales_assessments (created_at);

create index if not exists idx_outreach_lead_id          on public.outreach_drafts (lead_id);
create index if not exists idx_outreach_task_id          on public.outreach_drafts (task_id);
create index if not exists idx_outreach_status           on public.outreach_drafts (status);
create index if not exists idx_outreach_created_at       on public.outreach_drafts (created_at);

create index if not exists idx_support_lead_id           on public.support_drafts (lead_id);
create index if not exists idx_support_task_id           on public.support_drafts (task_id);
create index if not exists idx_support_status            on public.support_drafts (status);
create index if not exists idx_support_created_at        on public.support_drafts (created_at);

create index if not exists idx_approval_status           on public.approval_queue (status);
create index if not exists idx_approval_lead_id          on public.approval_queue (lead_id);
create index if not exists idx_approval_task_id          on public.approval_queue (task_id);
create index if not exists idx_approval_agent_id         on public.approval_queue (agent_id);
create index if not exists idx_approval_entity           on public.approval_queue (entity_type, entity_id);
create index if not exists idx_approval_created_at       on public.approval_queue (created_at);

create index if not exists idx_weekly_week_start         on public.weekly_ceo_summaries (week_start);
create index if not exists idx_weekly_created_at         on public.weekly_ceo_summaries (created_at);

create index if not exists idx_runlogs_task_id           on public.agent_run_logs (task_id);
create index if not exists idx_runlogs_agent_id          on public.agent_run_logs (agent_id);
create index if not exists idx_runlogs_created_at        on public.agent_run_logs (created_at);

-- ============================================================================
-- 5) updated_at TRIGGERS (only on tables that have updated_at)
-- ============================================================================
do $$
declare
  tbl text;
  tables_with_updated_at text[] := array[
    'profiles','agents','kb_documents','leads','agent_tasks',
    'research_reports','sales_assessments','outreach_drafts',
    'support_drafts','approval_queue','weekly_ceo_summaries'
  ];
begin
  foreach tbl in array tables_with_updated_at loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', tbl);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();',
      tbl
    );
  end loop;
end $$;

-- ============================================================================
-- 6) ROW LEVEL SECURITY
-- RLS is enabled on every table. The server uses the SERVICE ROLE key, which
-- bypasses RLS, so all Phase 1 server-side operations work without policies.
--
-- We also add ONE simple, internal-admin policy granting authenticated users
-- full access. This is safe scaffolding for when Supabase Auth is added later
-- (you will then tighten it to role/owner-based rules). The anon (public/
-- browser) role gets NO access, so nothing leaks to unauthenticated clients.
-- ============================================================================
do $$
declare
  tbl text;
  all_tables text[] := array[
    'profiles','agents','kb_documents','leads','agent_tasks',
    'agent_task_dependencies','events','research_reports','sales_assessments',
    'outreach_drafts','support_drafts','approval_queue','weekly_ceo_summaries',
    'agent_run_logs'
  ];
begin
  foreach tbl in array all_tables loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('drop policy if exists %I on public.%I;', 'internal_all_' || tbl, tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      'internal_all_' || tbl, tbl
    );
  end loop;
end $$;

-- ============================================================================
-- 7) SEED DATA
-- ============================================================================

-- ---- Agents (5) ------------------------------------------------------------
insert into public.agents (name, type, description, draft_only, enabled, config) values
  ('Research Agent',
   'research',
   'Monitors official SAT / College Board sources and produces structured founder research briefs.',
   false, true, '{}'::jsonb),
  ('Combined Sales Agent',
   'sales',
   'Scores and assesses both B2B (institutes) and D2C (students/parents) leads using the v1 rubric.',
   false, true, '{"supports":["b2b","d2c"]}'::jsonb),
  ('Outreach Agent (Draft Only)',
   'outreach',
   'Generates outreach drafts only. Never sends. Risky drafts route to the approval queue.',
   true, true, '{"send_enabled":false}'::jsonb),
  ('Customer Success Assistant (Draft Only)',
   'customer_success',
   'Drafts customer support / success replies only. Never sends. Built in a later phase.',
   true, false, '{"send_enabled":false}'::jsonb),
  ('CEO Agent',
   'ceo',
   'Generates a weekly summary and recommended next actions. Read-only: cannot approve, send, or change lead status.',
   false, true, '{"read_only":true}'::jsonb)
on conflict (name) do nothing;

-- ---- Knowledge-base documents (4) -----------------------------------------
insert into public.kb_documents (slug, title, category, content, tags) values
  ('wryze-positioning',
   'Wryze.ai Positioning',
   'positioning',
   'Wryze.ai is an SAT-prep product serving students and parents (D2C) and prep institutes / tutoring / admissions-consulting businesses (B2B). Core promise: turn official SAT changes and prep best-practice into clear, actionable guidance and content. Tone: trustworthy, specific, student- and parent-friendly. Target market emphasis: United States first, Canada secondary.',
   array['positioning','brand','strategy']),
  ('approved-messaging',
   'Approved Messaging',
   'messaging',
   'Approved talking points: (1) We track official College Board / SAT sources so you do not have to. (2) We translate changes into what students and parents should actually do. (3) For institutes: we help you stay current and create timely content. Avoid: guarantees of score increases, claims about specific colleges accepting students, anything implying official College Board endorsement. Always be factual and source-backed.',
   array['messaging','copy','guardrails']),
  ('guardrail-rules',
   'Guardrail Rules',
   'guardrails',
   'Hard rules for all agents: (1) Agents never send outreach or support messages automatically; drafts only. (2) Risky or high-impact outputs must go to the approval queue. (3) The CEO Agent may only summarize and recommend; it cannot approve, send, or change lead status. (4) Never invent facts about SAT policy; cite sources. (5) No claims of guaranteed results. (6) Escalate uncertainty (risk_level high/critical) rather than guessing.',
   array['guardrails','safety','policy']),
  ('lead-scoring-rubric-v1',
   'Lead Scoring Rubric v1',
   'scoring',
   'B2B fit score (0-100): US-based up to 30 (USA 30, Canada 10); SAT relevance up to 30 (SAT prep 30, tutoring 20, admissions consulting 15); small/medium size up to 25 (small 25, medium 25, large 8); active-business signals up to 15 (website 7, contact email 8). Priority: High >= 75, Medium 50-74, Low < 50. D2C rubric to be defined when the Combined Sales Agent D2C path is built (Phase 5).',
   array['scoring','rubric','sales'])
on conflict (slug) do nothing;

-- ============================================================================
-- End of migration 0001_founder_os_v1.sql
-- ============================================================================
