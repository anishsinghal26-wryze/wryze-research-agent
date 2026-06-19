// ============================================================================
// app/sales-pipeline/api/leads/[id]/notes/route.js
// ----------------------------------------------------------------------------
// POST /sales-pipeline/api/leads/:id/notes
//
// Phase 18B: append a founder-written note to a lead. Gated by the sales-pipeline
// session cookie (sp_auth), same pattern as the other sales-pipeline API routes.
// Delegates to addFounderNoteToLead(), which appends to
// leads.metadata.founder_notes (preserving all other metadata) — NOTES WRITE
// ONLY. No sending, no automation, no external calls, no audit-event insert, no
// changes to manual_send_activity / follow_up_activity / scoring.
//
// Body: { "body": "free text (1..2000 chars, trimmed)" }
// ============================================================================

import { cookies } from "next/headers";
import {
  addFounderNoteToLead,
  FOUNDER_NOTE_MAX_LEN,
} from "../../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request, { params }) {
  // ---- Auth: sales-pipeline session cookie (human action) ------------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  if (!expected || token !== expected) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // ---- Validate lead id ----------------------------------------------------
  const { id } = await params;
  if (!id || !UUID_RE.test(String(id))) {
    return Response.json({ ok: false, error: "Invalid lead id." }, { status: 400 });
  }

  // ---- Validate input ------------------------------------------------------
  let payload;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const body = typeof payload.body === "string" ? payload.body : "";

  // ---- Append the note (notes write only) ----------------------------------
  const result = await addFounderNoteToLead({ leadId: id, body });
  if (!result) {
    return Response.json(
      { ok: false, error: "Could not save the note." },
      { status: 502 }
    );
  }
  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    if (result.reason === "empty") {
      return Response.json(
        { ok: false, error: "Note cannot be empty." },
        { status: 400 }
      );
    }
    if (result.reason === "too_long") {
      return Response.json(
        {
          ok: false,
          error: `Note is too long (max ${FOUNDER_NOTE_MAX_LEN} characters).`,
        },
        { status: 400 }
      );
    }
    return Response.json(
      { ok: false, error: "Could not save the note." },
      { status: 400 }
    );
  }

  return Response.json({
    ok: true,
    lead_id: result.lead_id,
    note: result.note,
    notes: result.notes,
  });
}
