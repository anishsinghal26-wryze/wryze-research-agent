// ============================================================================
// app/sales-pipeline/api/campaigns/qualify/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/campaigns/qualify
//
// Phase 22: record a MANUAL founder qualification decision for ONE discovered
// lead within a campaign. Gated by the sales-pipeline session cookie (sp_auth).
// Delegates to setCampaignLeadQualification(), which stores the decision under
// leads.metadata.campaign_qualification[campaign_id] and only allows leads that
// belong to the campaign. Decision layer ONLY — NEVER enriches, drafts,
// approves, sends, or runs discovery.
//
// Body: { "campaign_id": "uuid", "lead_id": "uuid", "status": "qualified|rejected|maybe" }
// ============================================================================

import { cookies } from "next/headers";
import { setCampaignLeadQualification } from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  if (!expected || token !== expected) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const campaign_id = body.campaign_id || null;
  const lead_id = body.lead_id || null;
  const status = typeof body.status === "string" ? body.status : null;

  if (!campaign_id || !UUID_RE.test(String(campaign_id))) {
    return Response.json({ ok: false, error: "Valid campaign_id is required." }, { status: 400 });
  }
  if (!lead_id || !UUID_RE.test(String(lead_id))) {
    return Response.json({ ok: false, error: "Valid lead_id is required." }, { status: 400 });
  }

  const result = await setCampaignLeadQualification({ campaignId: campaign_id, leadId: lead_id, status });
  if (!result) {
    return Response.json({ ok: false, error: "Could not save the qualification." }, { status: 502 });
  }
  if (!result.ok) {
    if (result.reason === "bad_status") {
      return Response.json(
        { ok: false, error: "status must be qualified, rejected, or maybe." },
        { status: 400 }
      );
    }
    if (result.reason === "campaign_not_found") {
      return Response.json({ ok: false, error: "Campaign not found." }, { status: 404 });
    }
    if (result.reason === "lead_not_found") {
      return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    if (result.reason === "lead_not_in_campaign") {
      return Response.json(
        { ok: false, error: "That lead is not part of this campaign." },
        { status: 409 }
      );
    }
    return Response.json({ ok: false, error: "Could not save the qualification." }, { status: 400 });
  }

  return Response.json({
    ok: true,
    campaign_id: result.campaign_id,
    lead_id: result.lead_id,
    decision: result.decision,
  });
}
