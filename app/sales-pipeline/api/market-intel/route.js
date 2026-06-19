// ============================================================================
// app/sales-pipeline/api/market-intel/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/market-intel
//
// Phase 9: founder-facing per-lead Market Intelligence. Gated by the same
// sales-pipeline session cookie (sp_auth). Delegates to the shared
// analyzeMarketIntelligence() in lib/marketIntelligence.js. READ-ONLY external
// intelligence: nothing is ever sent; no drafts/approvals; no scoring change;
// single lead only.
//
// Body: { "lead_id": "uuid" }   (REQUIRED)
// ============================================================================

import { cookies } from "next/headers";
import { analyzeMarketIntelligence } from "../../../../lib/marketIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  // ---- Auth: sales-pipeline session cookie ---------------------------------
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
  const lead_id = body.lead_id || null;

  if (!lead_id) {
    return Response.json({ ok: false, error: "lead_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(String(lead_id))) {
    return Response.json({ ok: false, error: "Invalid lead_id." }, { status: 400 });
  }

  // ---- Delegate to the shared market-intelligence analysis -----------------
  const result = await analyzeMarketIntelligence({ leadId: lead_id });

  if (!result.ok) {
    return Response.json(
      { ok: false, task_id: result.task_id, error: result.error },
      { status: result.status || 502 }
    );
  }

  return Response.json({
    ok: true,
    task_id: result.task_id,
    summary: result.summary,
  });
}
