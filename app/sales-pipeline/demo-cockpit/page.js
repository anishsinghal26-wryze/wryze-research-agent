// ============================================================================
// app/sales-pipeline/demo-cockpit/page.js   (URL: /sales-pipeline/demo-cockpit)
// ----------------------------------------------------------------------------
// Phase 20: Founder Demo Cockpit / Agent Run Flow. READ-ONLY. Shows the full
// end-to-end sales-agent workflow for ONE lead in a single cockpit view. Gated
// by the SAME sp_auth cookie as the rest of /sales-pipeline. Defaults to the
// Manhattan Review validation lead; supports ?lead=<uuid> + a lead selector.
// Never writes, never sends, never triggers an agent — links to existing pages.
// ============================================================================

import { cookies } from "next/headers";
import LoginForm from "../LoginForm";
import DemoCockpitClient from "./DemoCockpitClient";
import { getSupabaseServer } from "../../../lib/supabaseServer";
import {
  getLeadDetail,
  buildLeadCockpitSteps,
  deriveLeadPipelineStage,
  summarizeFounderNotes,
  PIPELINE_STAGE_LABELS,
} from "../../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Founder Demo Cockpit · Wryze.ai",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Manhattan Review production-validation lead (Phase 8.5+ onward).
const DEFAULT_LEAD_ID = "fe06a18a-0cd0-4e37-992c-9af735a660d2";

async function listLeadsBrief() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("leads")
      .select("id, institute_name, fit_score")
      .order("fit_score", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[demo-cockpit] leads brief error:", error.message);
      return [];
    }
    return (data || []).map((r) => ({
      id: r.id,
      name: r.institute_name || "(unnamed lead)",
    }));
  } catch (err) {
    console.error("[demo-cockpit] leads brief threw:", err?.message);
    return [];
  }
}

export default async function DemoCockpitPage({ searchParams }) {
  // ---- Auth gate (same cookie + pattern as /sales-pipeline) ----------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;
  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const sp = (await searchParams) || {};
  const requested = typeof sp.lead === "string" ? sp.lead : null;
  const leadId = requested && UUID_RE.test(requested) ? requested : DEFAULT_LEAD_ID;

  const [leads, detail] = await Promise.all([
    listLeadsBrief(),
    getLeadDetail(leadId),
  ]);

  if (!detail || !detail.found) {
    return (
      <DemoCockpitClient
        leads={leads}
        selectedId={leadId}
        loadError={detail === null}
        notFound={Boolean(detail && !detail.found)}
      />
    );
  }

  const { lead, drafts, approvals } = detail;
  const derivedStage = deriveLeadPipelineStage({
    lead,
    drafts: (drafts || []).map((d) => ({ id: d.id, status: d.status })),
  });
  const stageLabel = PIPELINE_STAGE_LABELS[derivedStage] || derivedStage;
  const notes = summarizeFounderNotes(lead.metadata || {});
  const steps = buildLeadCockpitSteps({
    lead,
    drafts,
    approvals,
    pipelineStage: derivedStage,
    pipelineStageLabel: stageLabel,
  });

  const summary = {
    id: lead.id,
    name: lead.institute_name || "(unnamed lead)",
    website: lead.website || null,
    fit_score: lead.fit_score ?? null,
    priority: lead.priority || null,
    pipeline_stage: derivedStage,
    pipeline_stage_label: stageLabel,
    notes_count: notes.notes_count,
    notes_preview: notes.latest_note_preview,
    notes_latest_at: notes.latest_note_created_at,
  };

  return (
    <DemoCockpitClient
      leads={leads}
      selectedId={leadId}
      summary={summary}
      steps={steps}
    />
  );
}
