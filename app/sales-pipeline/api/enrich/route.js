// ============================================================================
// app/sales-pipeline/api/enrich/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/enrich
//
// Founder-facing per-lead verification & enrichment. Gated by the sales-pipeline
// session cookie (sp_auth) — a logged-in founder can enrich one lead at a time
// from the Lead Detail page. Delegates to the shared enrichLead() in
// lib/leadEnrichment.js. No AGENT_RUN_SECRET on this path; nothing is ever sent;
// no drafts/approvals are created.
//
// Body: { "lead_id": "uuid" }   (REQUIRED)
// ============================================================================

import { cookies } from "next/headers";
import { enrichLead } from "../../../../lib/leadEnrichment";

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
    return Response.json(
      { ok: false, error: "lead_id is required." },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(String(lead_id))) {
    return Response.json(
      { ok: false, error: "Invalid lead_id." },
      { status: 400 }
    );
  }

  // ---- Delegate to the shared enrichment -----------------------------------
  const result = await enrichLead({ leadId: lead_id });

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
