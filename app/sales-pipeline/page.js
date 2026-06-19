import { cookies } from "next/headers";
import SalesPipelineClient from "./SalesPipelineClient";
import LoginForm from "./LoginForm";
import { getSupabaseServer } from "../../lib/supabaseServer";
import {
  deriveLeadPipelineStage,
  listLeadDraftStatuses,
  PIPELINE_STAGE_LABELS,
  summarizeFounderNotes,
} from "../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Pipeline Agent · Wryze.ai",
};

function mapLeadRow(row, draftsForLead) {
  const pipelineStage = deriveLeadPipelineStage({
    lead: row,
    drafts: draftsForLead || [],
  });
  const notes = summarizeFounderNotes(row.metadata || {});
  return {
    id: row.id,
    pipelineStage,
    pipelineStageLabel: PIPELINE_STAGE_LABELS[pipelineStage] || pipelineStage,
    notesCount: notes.notes_count,
    notesPreview: notes.latest_note_preview,
    notesLatestAt: notes.latest_note_created_at,
    instituteName: row.institute_name || "",
    website: row.website || "",
    city: row.city || "",
    state: row.state || "",
    country: row.country || "",
    category: row.category || "",
    estimatedSize: row.estimated_size || "",
    contactPerson: row.contact_person || "",
    contactEmail: row.contact_email || "",
    contactLink: row.contact_link || "",
    status: row.pipeline_stage || "New",
    notes: row.notes || "",
    outreachDraft: (row.metadata && row.metadata.outreach_draft) || "",
    satFitScore: row.fit_score ?? 0,
    priority: row.priority || "Low",
    quality:
      (row.metadata &&
        row.metadata.enrichment &&
        row.metadata.enrichment.quality_classification) ||
      null,
  };
}

async function loadLeads() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!hasUrl || !hasKey) {
    console.error("[sales-pipeline] Missing Supabase env", { hasUrl, hasKey });
    return {
      leads: [],
      error:
        "Supabase environment variables are missing in this deployment. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Preview and redeploy.",
    };
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, institute_name, website, city, state, country, category, " +
          "estimated_size, contact_person, contact_email, contact_link, " +
          "pipeline_stage, notes, metadata, fit_score, priority, created_at"
      )
      .order("fit_score", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[sales-pipeline] leads read failed:", error.message, error.code);
      return {
        leads: [],
        error: `Could not load leads from Supabase: ${error.message}`,
      };
    }

    const draftsByLead = await listLeadDraftStatuses((data || []).map((r) => r.id));
    return {
      leads: (data || []).map((row) => mapLeadRow(row, draftsByLead[row.id] || [])),
      error: null,
    };
  } catch (err) {
    console.error("[sales-pipeline] Supabase client error:", err?.message);
    return {
      leads: [],
      error: `Supabase client error: ${err?.message || "unknown"}`,
    };
  }
}

function ErrorBanner({ message }) {
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "16px auto 0",
        padding: "12px 16px",
        borderRadius: 8,
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#b91c1c",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        fontSize: 14,
      }}
    >
      <strong>Leads could not be loaded.</strong> {message} (Showing an empty
      list — not sample data.)
    </div>
  );
}

export default async function SalesPipelinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;

  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const { leads, error } = await loadLeads();

  return (
    <>
      {error && <ErrorBanner message={error} />}
      <SalesPipelineClient initialLeads={leads} />
    </>
  );
}
