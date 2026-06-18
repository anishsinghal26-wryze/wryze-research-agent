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


// Insert a sales_assessments row. Returns the new assessment id or null.
export async function recordSalesAssessment({
  lead_id,
  task_id = null,
  lead_type = "b2b",
  fit_score = null,
  priority = null,
  rationale = null,
  signals = {},
  rubric_version = "v1",
}) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("sales_assessments")
      .insert({
        lead_id,
        task_id,
        lead_type,
        fit_score,
        priority,
        rationale,
        signals,
        rubric_version,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[founderMemory] recordSalesAssessment error:", error.message);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error("[founderMemory] recordSalesAssessment threw:", err?.message);
    return null;
  }
}

// Update a lead's fit_score + priority. Returns true/false. Never throws.
export async function updateLeadScore(leadId, fit_score, priority) {
  if (!leadId) return false;

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("leads")
      .update({ fit_score, priority })
      .eq("id", leadId);

    if (error) {
      console.error("[founderMemory] updateLeadScore error:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[founderMemory] updateLeadScore threw:", err?.message);
    return false;
  }
}

// Insert a single leads row (used by the discovery agent). Returns id or null.
export async function insertLead(lead) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("leads")
      .insert(lead)
      .select("id")
      .single();
    if (error) {
      console.error("[founderMemory] insertLead error:", error.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("[founderMemory] insertLead threw:", err?.message);
    return null;
  }
}

// Return the raw dedup fields for every existing lead. The caller normalizes.
// Returns an array of { website, contact_email, institute_name }, or NULL on
// error (so the caller can fail the run instead of treating a read failure as
// "no existing leads" and inserting duplicates).
export async function listLeadDedupKeys() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("leads")
      .select("website, contact_email, institute_name");
    if (error) {
      console.error("[founderMemory] listLeadDedupKeys error:", error.message);
      return null;
    }
    return data || [];
  } catch (err) {
    console.error("[founderMemory] listLeadDedupKeys threw:", err?.message);
    return null;
  }
}

// ---- Phase 6a: KB + outreach drafts + approval queue -----------------------

// Read KB documents for the given slugs. Returns a { slug: content } map (empty
// on error; KB grounding is best-effort and never blocks draft generation).
export async function getKbDocs(slugs) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("kb_documents")
      .select("slug, content")
      .in("slug", slugs);
    if (error) {
      console.error("[founderMemory] getKbDocs error:", error.message);
      return {};
    }
    const map = {};
    for (const r of data || []) map[r.slug] = r.content;
    return map;
  } catch (err) {
    console.error("[founderMemory] getKbDocs threw:", err?.message);
    return {};
  }
}

// Insert an outreach_drafts row (DRAFT ONLY). Returns id or null.
export async function recordOutreachDraft({
  lead_id,
  task_id = null,
  channel = "email",
  subject = null,
  body = null,
  status = "pending",
  risk_level = "low",
}) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("outreach_drafts")
      .insert({ lead_id, task_id, channel, subject, body, status, risk_level })
      .select("id")
      .single();
    if (error) {
      console.error("[founderMemory] recordOutreachDraft error:", error.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("[founderMemory] recordOutreachDraft threw:", err?.message);
    return null;
  }
}

// Create an approval_queue row and emit approval_submitted. Returns id or null.
export async function createApproval({
  entity_type,
  entity_id,
  task_id = null,
  lead_id = null,
  agent_id = null,
  risk_level = "medium",
  summary = null,
  payload = {},
}) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("approval_queue")
      .insert({
        entity_type,
        entity_id,
        task_id,
        lead_id,
        agent_id,
        risk_level,
        status: "pending",
        summary,
        payload,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[founderMemory] createApproval error:", error.message);
      return null;
    }
    const approval_id = data.id;
    await emitEvent("approval_submitted", {
      task_id,
      lead_id,
      agent_id,
      payload: { approval_id, entity_type, entity_id, risk_level },
    });
    return approval_id;
  } catch (err) {
    console.error("[founderMemory] createApproval threw:", err?.message);
    return null;
  }
}

// Read one approval_queue row. Returns { ok, row }:
//   ok=false  -> DB error (caller should 502)
//   ok=true, row=null -> not found (caller should 404)
//   ok=true, row=obj  -> found
export async function getApproval(approvalId) {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("approval_queue")
      .select("id, entity_type, entity_id, status, lead_id, task_id, agent_id")
      .eq("id", approvalId)
      .maybeSingle();
    if (error) {
      console.error("[founderMemory] getApproval error:", error.message);
      return { ok: false, row: null };
    }
    return { ok: true, row: data || null };
  } catch (err) {
    console.error("[founderMemory] getApproval threw:", err?.message);
    return { ok: false, row: null };
  }
}

// Update an approval_queue decision (status + reviewed_at + notes). true/false.
export async function setApprovalDecision(approvalId, { status, decision_notes = null }) {
  if (!approvalId) return false;
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("approval_queue")
      .update({ status, decision_notes, reviewed_at: new Date().toISOString() })
      .eq("id", approvalId);
    if (error) {
      console.error("[founderMemory] setApprovalDecision error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[founderMemory] setApprovalDecision threw:", err?.message);
    return false;
  }
}

// Update an outreach_drafts row's status. Returns true/false.
export async function setOutreachDraftStatus(draftId, status) {
  if (!draftId) return false;
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("outreach_drafts")
      .update({ status })
      .eq("id", draftId);
    if (error) {
      console.error("[founderMemory] setOutreachDraftStatus error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[founderMemory] setOutreachDraftStatus threw:", err?.message);
    return false;
  }
}
