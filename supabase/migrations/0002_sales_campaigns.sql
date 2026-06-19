-- ============================================================================
-- Wryze Founder OS — Phase 21: Campaign Builder / Batch Lead Discovery
-- File: supabase/migrations/0002_sales_campaigns.sql
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor (or via the Supabase CLI) BEFORE
-- using /sales-pipeline/campaigns. Safe to re-run: table uses IF NOT EXISTS,
-- trigger is dropped/recreated, policy creation is guarded.
--
-- Scope (Phase 21 only):
--   * 1 new table: sales_campaigns
--   * updated_at trigger (reuses public.set_updated_at from 0001)
--   * RLS enabled (internal authenticated policy; service role bypasses)
--
-- Lead <-> campaign association is stored WITHOUT a new table:
--   * sales_campaigns.metadata.discovered_lead_ids  (array of lead uuids)
--   * leads.metadata.campaign_id / leads.metadata.campaign_name
-- No existing table, column, enum, or row is modified by this migration.
-- ============================================================================

create extension if not exists pgcrypto;  -- provides gen_random_uuid()

create table if not exists public.sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_query text not null,
  geography text,
  icp_notes text,
  desired_lead_count int not null default 10,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_campaigns_created_at
  on public.sales_campaigns (created_at desc);

-- updated_at trigger (function defined in 0001).
drop trigger if exists trg_set_updated_at on public.sales_campaigns;
create trigger trg_set_updated_at
  before update on public.sales_campaigns
  for each row execute function public.set_updated_at();

-- RLS: enable + internal authenticated policy (service role bypasses RLS).
alter table public.sales_campaigns enable row level security;

do $$ begin
  create policy sales_campaigns_internal on public.sales_campaigns
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
