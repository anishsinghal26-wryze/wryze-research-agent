// ============================================================================
// app/sales-pipeline/api/campaigns/create/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/campaigns/create
//
// Phase 21: create a sales campaign record. Gated by the sales-pipeline session
// cookie (sp_auth). Delegates to createSalesCampaign() — inserts ONE row into
// sales_campaigns. This route NEVER discovers, enriches, scores, drafts,
// approves, or sends anything; it only stores the campaign definition.
//
// Body: { name, target_query, geography?, icp_notes?, desired_lead_count? }
//   - name + target_query are REQUIRED.
//   - desired_lead_count defaults to 10 and is clamped to 1..25.
// ============================================================================

import { cookies } from "next/headers";
import { createSalesCampaign } from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await createSalesCampaign({
    name: body.name,
    target_query: body.target_query,
    geography: body.geography,
    icp_notes: body.icp_notes,
    desired_lead_count: body.desired_lead_count,
  });

  if (!result || !result.ok) {
    if (result && result.reason === "name_required") {
      return Response.json({ ok: false, error: "Campaign name is required." }, { status: 400 });
    }
    if (result && result.reason === "query_required") {
      return Response.json({ ok: false, error: "Target market / query is required." }, { status: 400 });
    }
    return Response.json(
      { ok: false, error: "Could not create the campaign." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, campaign: result.campaign });
}
