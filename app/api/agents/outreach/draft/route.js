// ============================================================================
// app/api/agents/outreach/draft/route.js
// ----------------------------------------------------------------------------
// POST /api/agents/outreach/draft
//
// Outreach Agent (DRAFT ONLY): generates a personalized outreach draft for a
// lead (grounded in the KB), saves it to outreach_drafts, creates an
// approval_queue item for EVERY draft, and emits events. NEVER sends anything.
// Server-only (service-role).
//
// Body: { "lead_id": "uuid", "channel": "email" }   (lead_id REQUIRED)
//
// Gate: if AGENT_RUN_SECRET is set, callers must send header
//   x-agent-run-secret: <value>
// ============================================================================

import { getSupabaseServer } from "../../../../../lib/supabaseServer";
import { runOutreachDraft, validateChannel } from "../../../../../lib/outreachDraft";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  emitEvent,
  getKbDocs,
  recordOutreachDraft,
  createApproval,
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KB_SLUGS = ["wryze-positioning", "approved-messaging", "guardrail-rules"];

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
  const lead_id = body.lead_id || null;
  const channel = validateChannel(body.channel);

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

  // ---- Create the task -----------------------------------------------------
  const task = await createTask({
    agent_type: "outreach",
    input: { lead_id, channel },
    lead_id,
  });
  if (!task || !task.task_id) {
    return Response.json(
      {
        ok: false,
        error:
          "Could not create the outreach task (shared memory / Supabase unavailable). No draft was generated.",
      },
      { status: 502 }
    );
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;

  await markRunning(task_id, agent_id);

  try {
    // ---- Fetch the lead ----------------------------------------------------
    const supabase = getSupabaseServer();
    const { data: lead, error: readErr } = await supabase
      .from("leads")
      .select(
        "id, institute_name, contact_person, contact_email, contact_link, " +
          "website, city, state, country, category, estimated_size, " +
          "fit_score, priority, notes"
      )
      .eq("id", lead_id)
      .maybeSingle();

    if (readErr) {
      throw new Error(`Lead read failed: ${readErr.message}`);
    }
    if (!lead) {
      await markFailed(task_id, "Lead not found.", agent_id);
      return Response.json(
        { ok: false, task_id, error: "Lead not found." },
        { status: 404 }
      );
    }

    // ---- Generate the draft (KB-grounded; never sent) ----------------------
    const kbDocs = await getKbDocs(KB_SLUGS); // best-effort
    const { subject, body: draftBody, risk_level, rationale } =
      await runOutreachDraft({ lead, kbDocs, channel });

    // ---- Record the draft (DRAFT ONLY) -------------------------------------
    const draft_id = await recordOutreachDraft({
      lead_id,
      task_id,
      channel,
      subject,
      body: draftBody,
      status: "pending",
      risk_level,
    });
    if (!draft_id) {
      throw new Error("Could not record the outreach draft.");
    }

    // ---- Queue for approval (every draft) ----------------------------------
    // createApproval emits approval_submitted on success.
    const approval_id = await createApproval({
      entity_type: "outreach_draft",
      entity_id: draft_id,
      task_id,
      lead_id,
      agent_id,
      risk_level,
      summary: `Outreach draft for ${lead.institute_name || lead_id} (${channel})`,
      payload: { channel, subject, rationale },
    });
    if (!approval_id) {
      throw new Error("Could not create the approval queue item.");
    }

    // ---- Emit outreach_draft_created only after BOTH writes succeeded ------
    await emitEvent("outreach_draft_created", {
      task_id,
      lead_id,
      agent_id,
      payload: { draft_id, approval_id, channel, risk_level },
    });

    await markCompleted(
      task_id,
      { draft_id, approval_id, risk_level },
      agent_id
    );

    return Response.json({
      ok: true,
      task_id,
      draft_id,
      approval_id,
      risk_level,
      draft: { channel, subject, body: draftBody },
    });
  } catch (err) {
    const message = err?.message || "Draft generation failed.";
    await markFailed(task_id, message, agent_id);
    return Response.json(
      { ok: false, task_id, error: message },
      { status: 502 }
    );
  }
}
