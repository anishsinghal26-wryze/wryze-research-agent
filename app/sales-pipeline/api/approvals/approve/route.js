// ============================================================================
// app/sales-pipeline/api/approvals/approve/route.js
// ----------------------------------------------------------------------------
// POST /api/approvals/approve
//
// Human approval action. Marks an approval_queue item approved and updates the
// linked entity's status (e.g. outreach_drafts -> approved). Emits
// approval_approved. NEVER sends anything — approval only marks status.
//
// Body: { "approval_id": "uuid", "decision_notes": "optional" }
//
// Gate: requires the sales-pipeline session cookie (sp_auth) — the SAME gate
// as the dashboard, so only a logged-in founder can approve.
// ============================================================================

import { cookies } from "next/headers";
import {
  getApproval,
  setApprovalDecision,
  setOutreachDraftStatus,
  emitEvent,
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const approval_id = body.approval_id || null;
  const decision_notes =
    typeof body.decision_notes === "string" ? body.decision_notes : null;

  if (!approval_id) {
    return Response.json(
      { ok: false, error: "approval_id is required." },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(String(approval_id))) {
    return Response.json(
      { ok: false, error: "Invalid approval_id." },
      { status: 400 }
    );
  }

  // ---- Load the approval ---------------------------------------------------
  const { ok, row } = await getApproval(approval_id);
  if (!ok) {
    return Response.json(
      { ok: false, error: "Could not read the approval." },
      { status: 502 }
    );
  }
  if (!row) {
    return Response.json(
      { ok: false, error: "Approval not found." },
      { status: 404 }
    );
  }
  if (row.status !== "pending") {
    return Response.json(
      {
        ok: false,
        error: `Approval already decided (${row.status}).`,
        status: row.status,
      },
      { status: 409 }
    );
  }

  // ---- Update the approval, then the linked entity -------------------------
  const decided = await setApprovalDecision(approval_id, {
    status: "approved",
    decision_notes,
  });
  if (!decided) {
    return Response.json(
      { ok: false, error: "Could not update the approval." },
      { status: 502 }
    );
  }

  if (row.entity_type === "outreach_draft") {
    const draftUpdated = await setOutreachDraftStatus(row.entity_id, "approved");
    if (!draftUpdated) {
      return Response.json(
        { ok: false, error: "Could not update the linked draft." },
        { status: 502 }
      );
    }
  }

  // ---- Emit only after the required DB writes succeeded --------------------
  await emitEvent("approval_approved", {
    task_id: row.task_id,
    lead_id: row.lead_id,
    agent_id: row.agent_id,
    payload: {
      approval_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
    },
  });

  return Response.json({ ok: true, approval_id, status: "approved" });
}
