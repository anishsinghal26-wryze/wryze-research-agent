// ============================================================================
// app/sales-pipeline/api/campaigns/discover/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/campaigns/discover
//
// Phase 21: founder-triggered BATCH lead discovery for ONE campaign. Gated by
// the sales-pipeline session cookie (sp_auth). Runs ONLY when the founder calls
// it (a button) — never on page load. Reuses the SHARED runSalesDiscoveryBatch()
// (same discovery + dedup + scoring as the dashboard "Discover" action), then
// tags each newly inserted lead with the campaign id and records the lead ids on
// the campaign. Discovery may score NEW leads (existing safe behavior); it does
// NOT enrich, draft, approve, follow up, or send anything, and does NOT touch
// existing leads' scores.
//
// Body: { "campaign_id": "uuid" }
// ============================================================================

import { cookies } from "next/headers";
import { runSalesDiscoveryBatch } from "../../../../../lib/salesDiscovery";
import {
  getSalesCampaign,
  appendCampaignDiscoveredLeads,
  updateLeadFieldsAndMetadata,
  clampCampaignLeadCount,
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  // ---- Auth: sales-pipeline session cookie (human action) ------------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  if (!expected || token !== expected) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // ---- Validate input ------------------------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const campaign_id = body.campaign_id || null;
  if (!campaign_id || !UUID_RE.test(String(campaign_id))) {
    return Response.json({ ok: false, error: "Valid campaign_id is required." }, { status: 400 });
  }

  // ---- Load the campaign ---------------------------------------------------
  const found = await getSalesCampaign(campaign_id);
  if (!found) {
    return Response.json({ ok: false, error: "Could not load campaign." }, { status: 502 });
  }
  if (!found.found) {
    return Response.json({ ok: false, error: "Campaign not found." }, { status: 404 });
  }
  const campaign = found.campaign;

  // ---- Run shared discovery (founder-triggered, max 25) --------------------
  const max_results = clampCampaignLeadCount(campaign.desired_lead_count);
  const result = await runSalesDiscoveryBatch({
    query: campaign.target_query,
    location: campaign.geography || null,
    category: null,
    max_results,
    taskInputExtra: { triggered_by: "campaign", campaign_id },
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, task_id: result.task_id, error: result.error },
      { status: result.status || 502 }
    );
  }

  // ---- Tag newly inserted leads with the campaign (metadata only) ----------
  const insertedIds = Array.isArray(result.inserted_ids) ? result.inserted_ids : [];
  for (const leadId of insertedIds) {
    try {
      await updateLeadFieldsAndMetadata(
        leadId,
        {},
        { campaign_id, campaign_name: campaign.name }
      );
    } catch {
      // best-effort tagging; the lead still exists in the pipeline regardless.
    }
  }

  // ---- Record the lead ids on the campaign + mark it active ----------------
  const updated = await appendCampaignDiscoveredLeads(campaign_id, insertedIds, {
    status: "active",
  });

  return Response.json({
    ok: true,
    task_id: result.task_id,
    summary: result.summary,
    inserted_ids: insertedIds,
    discovered_count: updated ? updated.discovered_count : insertedIds.length,
  });
}
