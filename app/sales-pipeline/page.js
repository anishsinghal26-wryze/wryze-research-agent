import { cookies } from "next/headers";
import SalesPipelineClient from "./SalesPipelineClient";
import LoginForm from "./LoginForm";
import { getSupabaseServer } from "../../lib/supabaseServer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Pipeline Agent · Wryze.ai",
};

function mapLeadRow(row) {
  return {
    id: row.id,
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
  };
}

async function loadLeads() {
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
      console.error("Failed to load leads:", error.message);
      return [];
    }

    return (data || []).map(mapLeadRow);
  } catch (err) {
    console.error("Supabase not configured / unreachable:", err.message);
    return [];
  }
}

export default async function SalesPipelinePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;

  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const initialLeads = await loadLeads();

  return <SalesPipelineClient initialLeads={initialLeads} />;
}
