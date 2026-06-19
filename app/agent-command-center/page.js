// ============================================================================
// app/agent-command-center/page.js   (URL: /agent-command-center)
// ----------------------------------------------------------------------------
// Phase 8.5: READ-ONLY founder-facing Agent Command Center / Agent Map.
//
// Server component. Gated by the SAME sp_auth cookie + SALES_PIPELINE_PASSWORD
// as /sales-pipeline (the login cookie path is broadened to "/" so this
// top-level route is covered). Loads a small, read-only snapshot from existing
// tables (leads, agent_tasks, events, outreach_drafts, approval_queue), builds
// a `signals` object, and hands it to the client map. NEVER writes, NEVER runs
// any agent. On any read error it degrades gracefully to the static map.
// ============================================================================

import { cookies } from "next/headers";
import LoginForm from "../sales-pipeline/LoginForm";
import CommandCenterClient from "./CommandCenterClient";
import { getSupabaseServer } from "../../lib/supabaseServer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agent Command Center · Wryze.ai",
};

// Read-only snapshot used purely to overlay "latest activity" onto the map.
async function loadSignals() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasUrl || !hasKey) {
    console.error("[agent-command-center] Missing Supabase env", { hasUrl, hasKey });
    return { signals: emptySignals(), loadError: true };
  }

  try {
    const supabase = getSupabaseServer();

    const [leadsRes, tasksRes, eventsRes, draftsRes, approvalsRes] = await Promise.all([
      supabase.from("leads").select("id, source, metadata"),
      supabase
        .from("agent_tasks")
        .select("id, agent_type, status, input, created_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("events")
        .select("id, event_type, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("outreach_drafts")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("approval_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    if (leadsRes.error) {
      console.error("[agent-command-center] leads read failed:", leadsRes.error.message);
      return { signals: emptySignals(), loadError: true };
    }

    const leads = leadsRes.data || [];
    const leadsBySource = {};
    const leadsByQuality = {};
    for (const l of leads) {
      const src = l.source || "(none)";
      leadsBySource[src] = (leadsBySource[src] || 0) + 1;
      const q =
        l.metadata &&
        l.metadata.enrichment &&
        l.metadata.enrichment.quality_classification;
      if (q) leadsByQuality[q] = (leadsByQuality[q] || 0) + 1;
    }

    // Latest agent_task per input.mode (discover / enrich).
    const tasks = tasksRes.error ? [] : tasksRes.data || [];
    const latestByMode = {};
    for (const t of tasks) {
      const mode = t.input && t.input.mode;
      if (mode && !latestByMode[mode]) {
        latestByMode[mode] = {
          status: t.status,
          created_at: t.created_at,
          completed_at: t.completed_at,
        };
      }
    }

    // Latest event per event_type.
    const events = eventsRes.error ? [] : eventsRes.data || [];
    const latestEventByType = {};
    for (const e of events) {
      if (!latestEventByType[e.event_type]) {
        latestEventByType[e.event_type] = {
          payload: e.payload || {},
          created_at: e.created_at,
        };
      }
    }

    return {
      signals: {
        leadsTotal: leads.length,
        leadsBySource,
        leadsByQuality,
        latestByMode,
        latestEventByType,
        draftsCount: draftsRes.error ? null : draftsRes.count ?? 0,
        approvalsPendingCount: approvalsRes.error ? null : approvalsRes.count ?? 0,
      },
      loadError: false,
    };
  } catch (err) {
    console.error("[agent-command-center] snapshot threw:", err?.message);
    return { signals: emptySignals(), loadError: true };
  }
}

function emptySignals() {
  return {
    leadsTotal: null,
    leadsBySource: {},
    leadsByQuality: {},
    latestByMode: {},
    latestEventByType: {},
    draftsCount: null,
    approvalsPendingCount: null,
  };
}

export default async function AgentCommandCenterPage() {
  // ---- Auth gate (same cookie + pattern as /sales-pipeline) ----------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;
  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const { signals, loadError } = await loadSignals();

  return <CommandCenterClient signals={signals} loadError={loadError} />;
}
