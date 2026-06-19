// ============================================================================
// app/sales-pipeline/api/outreach-drafts/mark-manual-sent/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/outreach-drafts/mark-manual-sent
//
// Phase 14: record that the founder MANUALLY sent an APPROVED outreach draft
// outside Wryze. Gated by the sales-pipeline session cookie (sp_auth).
// Delegates to recordManualSend(), which stores tracking info under
// leads.metadata.manual_send_activity[draft_id] and is allowed ONLY for drafts
// whose status is "approved". This route NEVER sends anything — no email/Gmail/
// LinkedIn/external API call exists here. It only records a manual-send note.
//
// Body: { "draft_id": "uuid", "sent_channel": "LinkedIn|Email|Phone follow-up|Other", "sent_notes": "optional" }
// ============================================================================

import { cookies } from "next/headers";
import { recordManualSend } from "../../../../../lib/founderMemory";

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
  const sent_channel = typeof body.sent_channel === "string" ? body.sent_channel : null;
  const sent_notes = typeof body.sent_notes === "string" ? body.sent_notes : null;

  if (!draft_id) {
    return Response.json({ ok: false, error: "draft_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(String(draft_id))) {
    return Response.json({ ok: false, error: "Invalid draft_id." }, { status: 400 });
  }

  // ---- Record the manual send (tracking only; approved drafts only) --------
  const result = await recordManualSend(draft_id, { sent_channel, sent_notes });
  if (!result) {
    return Response.json(
      { ok: false, error: "Could not record manual send." },
      { status: 502 }
    );
  }
  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ ok: false, error: "Draft not found." }, { status: 404 });
    }
    if (result.reason === "not_approved") {
      return Response.json(
        {
          ok: false,
          error: `Only approved drafts can be marked manually sent (status: ${result.status}).`,
        },
        { status: 409 }
      );
    }
    return Response.json(
      { ok: false, error: "Could not record manual send." },
      { status: 400 }
    );
  }

  return Response.json({
    ok: true,
    draft_id: result.draft_id,
    sent_manually_at: result.sent_manually_at,
    sent_channel: result.sent_channel,
    sent_notes: result.sent_notes,
  });
}
