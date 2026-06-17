import { getSupabaseServer } from "../../../../../lib/supabaseServer";
import { scoreLead } from "../../../../../lib/salesScoring";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  recordSalesAssessment,
  updateLeadScore,
  emitEvent,
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const secret = process.env.AGENT_RUN_SECRET;
  if (secret) {
    const provided = request.headers.get("x-agent-run-secret");
    if (provided !== secret) {
      return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
  }

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

  const task = await createTask({
    agent_type: "sales",
    input: { lead_id },
    lead_id,
  });

  if (!task || !task.task_id) {
    return Response.json(
      {
        ok: false,
        error:
          "Could not create the sales task (shared memory / Supabase unavailable). No scoring was run.",
      },
      { status: 502 }
    );
  }

  const task_id = task.task_id;
  const agent_id = task.agent_id;

  await markRunning(task_id, agent_id);

  try {
    const supabase = getSupabaseServer();
    const { data: lead, error: readErr } = await supabase
      .from("leads")
      .select(
        "id, lead_type, country, category, estimated_size, website, contact_email, contact_link, metadata"
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

    const lead_type = lead.lead_type || "b2b";
    const { fit_score, priority, rationale, signals, rubric_version } =
      scoreLead(lead);

    const assessment_id = await recordSalesAssessment({
      lead_id,
      task_id,
      lead_type,
      fit_score,
      priority,
      rationale,
      signals,
      rubric_version,
    });

    if (!assessment_id) {
      throw new Error("Could not record the sales assessment.");
    }

    const leadUpdated = await updateLeadScore(lead_id, fit_score, priority);

    if (!leadUpdated) {
      throw new Error("Could not update the lead score.");
    }

    await emitEvent("lead_scored", {
      task_id,
      lead_id,
      agent_id,
      payload: { assessment_id, fit_score, priority, rubric_version },
    });

    await markCompleted(
      task_id,
      { assessment_id, fit_score, priority, rubric_version },
      agent_id
    );

    return Response.json({
      ok: true,
      task_id,
      assessment_id,
      lead_type,
      fit_score,
      priority,
      rubric_version,
    });
  } catch (err) {
    const message = err?.message || "Scoring failed.";
    await markFailed(task_id, message, agent_id);
    return Response.json(
      { ok: false, task_id, error: message },
      { status: 502 }
    );
  }
}
