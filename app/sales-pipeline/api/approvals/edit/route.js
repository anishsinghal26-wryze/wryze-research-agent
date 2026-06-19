// ============================================================================
// app/sales-pipeline/api/approvals/edit/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/approvals/edit
//
// Phase 12: human edit of a PENDING outreach draft's subject/body from the
// approvals review UI. Gated by the sales-pipeline session cookie (sp_auth).
// Persists edits to the existing outreach_drafts row via
// updateOutreachDraftContent(), which only updates while the draft is still
// pending. NEVER changes approval/draft status, NEVER approves, NEVER sends.
//
// Body: { "draft_id": "uuid", "subject": "string", "body": "string" }
// ============================================================================

import { cookies } from "next/headers";
import { updateOutreachDraftContent } from "../../../../../lib/founderMemory";

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
  const subject = typeof body.subject === "string" ? body.subject.trim() : null;
  const draftBody = typeof body.body === "string" ? body.body.trim() : null;

  if (!draft_id) {
    return Response.json({ ok: false, error: "draft_id is required." }, { status: 400 });
  }
  if (!UUID_RE.test(String(draft_id))) {
    return Response.json({ ok: false, error: "Invalid draft_id." }, { status: 400 });
  }
  if (!draftBody) {
    return Response.json(
      { ok: false, error: "Draft body cannot be empty." },
      { status: 400 }
    );
  }

  // ---- Persist edit (only while pending; no status change, no send) --------
  const updated = await updateOutreachDraftContent(draft_id, {
    subject: subject || "Outreach draft",
    body: draftBody,
  });
  if (!updated) {
    return Response.json(
      {
        ok: false,
        error:
          "Draft could not be edited (not found, or no longer pending). Refresh and try again.",
      },
      { status: 409 }
    );
  }

  return Response.json({
    ok: true,
    draft_id: updated.id,
    subject: updated.subject,
    body: updated.body,
    status: updated.status,
  });
}
