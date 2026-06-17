// ============================================================================
// app/api/agents/research/run/route.js
// ----------------------------------------------------------------------------
// POST /api/agents/research/run
// Body: { "topic": "digital SAT test anxiety", "lead_id": "optional-uuid" }
// Gate: if AGENT_RUN_SECRET is set, send x-agent-run-secret header.
// ============================================================================

import { runTopicResearch } from "../../../../../lib/researchTopic";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  recordResearchReport,
  emitEvent,
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const topic = (body.topic || "").trim();
  const lead_id = body.lead_id || null;

  if (!topic) {
    return Response.json(
      { ok: false, error: "Please provide a topic." },
      { status: 400 }
    );
  }

  if (lead_id !== null && !UUID_RE.test(String(lead_id))) {
    return Response.json(
      { ok: false, error: "Invalid lead_id." },
      { status: 400 }
    );
  }

  const task = await createTask({
    agent_type: "research",
    input: { topic, lead_id },
    lead_id,
  });

  if (!task || !task.task_id) {
    return Response.json(
      {
        ok: false,
        error:
          "Could not create the research task (shared memory / Supabase unavailable). No research was run.",
      },
      { status: 502 }
    );
  }

  const task_id = task.task_id;
  const agent_id = task.agent_id;

  await markRunning(task_id, agent_id);

  try {
    const { summary, sources } = await runTopicResearch(topic);

    const report_id = await recordResearchReport({
      task_id,
      lead_id,
      topic,
      headline: null,
      summary,
      structured: { mode: "topic", topic },
      sources,
      confidence_notes: null,
    });

    if (lead_id) {
      await emitEvent("lead_researched", {
        task_id,
        lead_id,
        agent_id,
        payload: { report_id, topic },
      });
    }

    await markCompleted(
      task_id,
      { report_id, source_count: sources.length },
      agent_id
    );

    return Response.json({
      ok: true,
      task_id,
      report_id,
      report: { topic, summary, sources },
    });
  } catch (err) {
    const message = err?.message || "Research failed.";
    await markFailed(task_id, message, agent_id);

    return Response.json(
      { ok: false, task_id, error: message },
      { status: 502 }
    );
  }
}
