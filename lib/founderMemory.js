// ============================================================================
// lib/founderMemory.js
// ----------------------------------------------------------------------------
// Server-only shared-memory helpers for Founder OS V1 Phase 3.
// Writes to agent_tasks, events, and research_reports via service-role Supabase.
// Defensive: every function catches errors and returns null/false.
// Do NOT import this file into a "use client" component.
// ============================================================================

import { getSupabaseServer } from "./supabaseServer";

const cachedAgentIds = {};

export async function resolveAgentId(agentType) {
  if (cachedAgentIds[agentType]) return cachedAgentIds[agentType];

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("agents")
      .select("id")
      .eq("type", agentType)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[founderMemory] resolveAgentId(${agentType}) error:`, error.message);
      return null;
    }

    if (data && data.id) cachedAgentIds[agentType] = data.id;
    return (data && data.id) || null;
  } catch (err) {
    console.error(`[founderMemory] resolveAgentId(${agentType}) threw:`, err?.message);
    return null;
  }
}

export async function emitEvent(
  eventType,
  { task_id = null, lead_id = null, agent_id = null, payload = {} } = {}
) {
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("events").insert({
      event_type: eventType,
      task_id,
      lead_id,
      agent_id,
      payload,
    });

    if (error) {
      console.error(`[founderMemory] emitEvent(${eventType}) error:`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[founderMemory] emitEvent(${eventType}) threw:`, err?.message);
    return false;
  }
}

export async function createTask({ agent_type, input = {}, lead_id = null }) {
  try {
    const supabase = getSupabaseServer();
    const agent_id = await resolveAgentId(agent_type);

    const { data, error } = await supabase
      .from("agent_tasks")
      .insert({ agent_type, agent_id, lead_id, status: "pending", input })
      .select("id")
      .single();

    if (error) {
      console.error("[founderMemory] createTask error:", error.message);
      return null;
    }

    const task_id = data.id;

    await emitEvent("task_created", {
      task_id,
      lead_id,
      agent_id,
      payload: { agent_type, input },
    });

    return { task_id, agent_id };
  } catch (err) {
    console.error("[founderMemory] createTask threw:", err?.message);
    return null;
  }
}

export async function markRunning(taskId, agentId = null) {
  if (!taskId) return false;

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("agent_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) {
      console.error("[founderMemory] markRunning error:", error.message);
      return false;
    }

    await emitEvent("task_started", { task_id: taskId, agent_id: agentId });
    return true;
  } catch (err) {
    console.error("[founderMemory] markRunning threw:", err?.message);
    return false;
  }
}

export async function markCompleted(taskId, output = {}, agentId = null) {
  if (!taskId) return false;

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("agent_tasks")
      .update({
        status: "completed",
        output,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      console.error("[founderMemory] markCompleted error:", error.message);
      return false;
    }

    await emitEvent("task_completed", {
      task_id: taskId,
      agent_id: agentId,
      payload: output,
    });

    return true;
  } catch (err) {
    console.error("[founderMemory] markCompleted threw:", err?.message);
    return false;
  }
}

export async function markFailed(taskId, errorMessage = "Unknown error", agentId = null) {
  if (!taskId) return false;
  const safeMsg = String(errorMessage);

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("agent_tasks")
      .update({
        status: "failed",
        error: safeMsg.slice(0, 1000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      console.error("[founderMemory] markFailed error:", error.message);
      return false;
    }

    await emitEvent("task_failed", {
      task_id: taskId,
      agent_id: agentId,
      payload: { error: safeMsg.slice(0, 500) },
    });

    return true;
  } catch (err) {
    console.error("[founderMemory] markFailed threw:", err?.message);
    return false;
  }
}

export async function recordResearchReport({
  task_id = null,
  lead_id = null,
  topic = null,
  headline = null,
  summary = null,
  structured = {},
  sources = [],
  confidence_notes = null,
}) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("research_reports")
      .insert({
        task_id,
        lead_id,
        topic,
        headline,
        summary,
        structured,
        sources,
        confidence_notes,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[founderMemory] recordResearchReport error:", error.message);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error("[founderMemory] recordResearchReport threw:", err?.message);
    return null;
  }
}
