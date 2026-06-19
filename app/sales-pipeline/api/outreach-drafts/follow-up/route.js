// ============================================================================
// app/sales-pipeline/api/outreach-drafts/follow-up/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/outreach-drafts/follow-up
//
// Phase 15: record founder-entered follow-up / next-action tracking for a draft
// that was already recorded as MANUALLY sent. Gated by the sales-pipeline
// session cookie (sp_auth). Delegates to recordFollowUpActivity(), which stores
// data under leads.metadata.follow_up_activity[draft_id] and is allowed ONLY
// when the draft has a manual_send_activity record. This route NEVER sends and
// schedules NO reminders — it only records founder-entered tracking.
//
// Body: {
//   "draft_id": "uuid",
//   "follow_up_status": "awaiting_reply|follow_up_sent|replied|not_interested|booked_call|closed",
//   "follow_up_channel": "LinkedIn|Email|Phone|Other",
//   "follow_up_due_date": "YYYY-MM-DD" (optional),
//   "follow_up_notes": "optional"
// }
// ============================================================================

import { cookies } from "next/headers";
import { recordFollowUpActivity } from "../../../../../lib/founderMemory";

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
  const draft_id = body.draft_id || null;
  const follow_up_status =
    typeof body.follow_up_status === "string" ? body.follow_up_status : null;
  const follow_up_channel =
    typeof body.follow_up_channel === "string" ? body.follow_up_channel : null;
  const follow_up_due_date =
    typeof body.follow_up_due_date === "string" ? body.follow_up_due_date : null;
  const follow_up_notes =
    typeof body.follow_up_notes === "string" ? body.follow_up_notes : null;

  if (!draft_id) {
    return Response.json({ ok: false, error: "draft_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(String(draft_id))) {
    return Response.json({ ok: false, error: "Invalid draft_id." }, { status: 400 });
  }

  // ---- Record follow-up tracking (manually-sent drafts only) ---------------
  const result = await recordFollowUpActivity(draft_id, {
    follow_up_status,
    follow_up_channel,
    follow_up_due_date,
    follow_up_notes,
  });
  if (!result) {
    return Response.json(
      { ok: false, error: "Could not record follow-up." },
      { status: 502 }
    );
  }
  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ ok: false, error: "Draft not found." }, { status: 404 });
    }
    if (result.reason === "not_manually_sent") {
      return Response.json(
        {
          ok: false,
          error:
            "Follow-up tracking is only available after the draft is recorded as manually sent.",
        },
        { status: 409 }
      );
    }
    return Response.json(
      { ok: false, error: "Could not record follow-up." },
      { status: 400 }
    );
  }

  return Response.json({
    ok: true,
    draft_id: result.draft_id,
    follow_up_status: result.follow_up_status,
    follow_up_channel: result.follow_up_channel,
    follow_up_due_date: result.follow_up_due_date,
    follow_up_notes: result.follow_up_notes,
    updated_at: result.updated_at,
  });
}
