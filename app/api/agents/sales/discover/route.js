// ============================================================================
// app/api/agents/sales/discover/route.js
// ----------------------------------------------------------------------------
// POST /api/agents/sales/discover
//
// Sales Lead Discovery Agent entry point. Thin wrapper: it enforces the
// AGENT_RUN_SECRET gate, validates input, and delegates to the shared
// runSalesDiscoveryBatch() in lib/salesDiscovery.js (Phase 8 refactor — the
// orchestration is now shared with the founder-facing /sales-pipeline/api/
// discover route, with NO duplicated logic). Behavior is unchanged from Phase 5.
//
// Body: { "query": "...", "location": "...", "category": "...", "max_results": 10 }
//   - query is REQUIRED; max_results is clamped to 1..20 (default 10).
//
// Gate: if AGENT_RUN_SECRET is set, callers must send header
//   x-agent-run-secret: <value>
// ============================================================================

import { clampResults } from "../../../../../lib/leadDiscovery";
import { runSalesDiscoveryBatch } from "../../../../../lib/salesDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  // ---- Shared-secret gate (reuses AGENT_RUN_SECRET) ------------------------
  const secret = process.env.AGENT_RUN_SECRET;
  if (secret) {
    const provided = request.headers.get("x-agent-run-secret");
    if (provided !== secret) {
      return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
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
  const max_results = clampResults(body.max_results); // 1..20, default 10

  if (!query) {
    return Response.json(
      { ok: false, error: "query is required." },
      { status: 400 }
    );
  }

  // ---- Delegate to the shared orchestration --------------------------------
  const result = await runSalesDiscoveryBatch({
    query,
    location,
    category,
    max_results,
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
