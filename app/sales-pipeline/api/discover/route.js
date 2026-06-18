// ============================================================================
// app/sales-pipeline/api/discover/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/discover
//
// Founder-facing lead discovery. Same orchestration as the agent route, but
// gated by the sales-pipeline session cookie (sp_auth) instead of
// AGENT_RUN_SECRET — so a logged-in founder can run discovery from the
// dashboard WITHOUT the secret ever being exposed to the browser. The secret
// is not referenced anywhere on this path.
//
// Body: { "query": "...", "location": "...", "category": "...", "max_results": 5 }
//   - query is REQUIRED.
//   - max_results defaults to 5 and is HARD-CAPPED at 10 (founder UI guardrail).
//
// Delegates to the shared runSalesDiscoveryBatch() — no duplicated logic.
// NEVER creates outreach drafts/approvals and NEVER sends anything.
// ============================================================================

import { cookies } from "next/headers";
import { runSalesDiscoveryBatch } from "../../../../lib/salesDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MAX = 5;
const HARD_CAP = 10;

// Founder UI guardrail: default 5, clamp to 1..10 (stricter than the agent
// route's 1..20). Non-numeric input falls back to the default.
function clampFounderMax(n) {
  let v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) v = DEFAULT_MAX;
  return Math.max(1, Math.min(HARD_CAP, v));
}

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
  const query = (body.query || "").trim();
  const location = body.location ? String(body.location).trim() : null;
  const category = body.category ? String(body.category).trim() : null;
  const max_results = clampFounderMax(body.max_results);

  if (!query) {
    return Response.json(
      { ok: false, error: "query is required." },
      { status: 400 }
    );
  }

  // ---- Delegate to the shared orchestration --------------------------------
  // Stamp the task so dashboard-triggered runs are traceable in the timeline.
  const result = await runSalesDiscoveryBatch({
    query,
    location,
    category,
    max_results,
    taskInputExtra: { triggered_by: "founder_ui" },
  });

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
    inserted_ids: result.inserted_ids,
  });
}
