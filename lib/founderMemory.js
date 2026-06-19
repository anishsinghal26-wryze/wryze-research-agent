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

// ---- Phase 12: edit a DRAFT's subject/body (review UX) ----------------------
// Updates an outreach_drafts row's subject/body ONLY while it is still pending,
// so an already approved/rejected draft can never be silently edited. Never
// changes status and never sends. Returns the updated row, or null if the draft
// was not found / not pending / on DB error.
export async function updateOutreachDraftContent(draftId, { subject, body } = {}) {
  if (!draftId) return null;
  try {
    const supabase = getSupabaseServer();
    const patch = {};
    if (typeof subject === "string") patch.subject = subject;
    if (typeof body === "string") patch.body = body;
    if (Object.keys(patch).length === 0) return null;

    const { data, error } = await supabase
      .from("outreach_drafts")
      .update(patch)
      .eq("id", draftId)
      .eq("status", "pending") // guard: only editable while pending
      .select("id, channel, subject, body, status")
      .maybeSingle();
    if (error) {
      console.error("[founderMemory] updateOutreachDraftContent error:", error.message);
      return null;
    }
    return data || null; // null => not found or not pending
  } catch (err) {
    console.error("[founderMemory] updateOutreachDraftContent threw:", err?.message);
    return null;
  }
}

// ---- Phase 14: record a MANUAL send (tracking only — never sends) ----------
// The product NEVER sends. This only records that the founder manually sent an
// APPROVED draft outside Wryze. Stored under leads.metadata.manual_send_activity
// keyed by draft id (no schema migration, no new draft status). Allowed ONLY for
// drafts whose status is "approved".
const VALID_MANUAL_SEND_CHANNELS = ["LinkedIn", "Email", "Phone follow-up", "Other"];

export async function recordManualSend(draftId, { sent_channel, sent_notes } = {}) {
  if (!draftId) return { ok: false, reason: "bad_request" };
  try {
    const supabase = getSupabaseServer();

    // 1) Load the draft; only approved drafts may be marked manually sent.
    const { data: draft, error: dErr } = await supabase
      .from("outreach_drafts")
      .select("id, lead_id, status")
      .eq("id", draftId)
      .maybeSingle();
    if (dErr) {
      console.error("[founderMemory] recordManualSend draft read error:", dErr.message);
      return null;
    }
    if (!draft) return { ok: false, reason: "not_found" };
    if (draft.status !== "approved") {
      return { ok: false, reason: "not_approved", status: draft.status };
    }
    const leadId = draft.lead_id;
    if (!leadId) return { ok: false, reason: "no_lead" };

    const channel = VALID_MANUAL_SEND_CHANNELS.includes(sent_channel)
      ? sent_channel
      : "Other";
    const notes =
      typeof sent_notes === "string" && sent_notes.trim() ? sent_notes.trim() : null;

    // 2) Merge into the lead's manual_send_activity map (preserve other entries).
    const { data: lead, error: lErr } = await supabase
      .from("leads")
      .select("metadata")
      .eq("id", leadId)
      .maybeSingle();
    if (lErr || !lead) {
      console.error("[founderMemory] recordManualSend lead read error:", lErr?.message);
      return null;
    }
    const meta = lead.metadata || {};
    const activity =
      meta.manual_send_activity && typeof meta.manual_send_activity === "object"
        ? { ...meta.manual_send_activity }
        : {};
    const record = {
      sent_manually_at: new Date().toISOString(),
      sent_channel: channel,
      sent_notes: notes,
    };
    activity[draftId] = record;

    const persisted = await updateLeadFieldsAndMetadata(
      leadId,
      {},
      { manual_send_activity: activity }
    );
    if (!persisted) return null;

    return { ok: true, lead_id: leadId, draft_id: draftId, ...record };
  } catch (err) {
    console.error("[founderMemory] recordManualSend threw:", err?.message);
    return null;
  }
}

// ---- Phase 6b: list pending outreach approvals (joined draft + lead) -------
// Returns up to `limit` newest pending approval_queue rows of type
// 'outreach_draft', each merged with its draft (channel/subject/body/status)
// and lead (institute_name/website/category/priority/fit_score).
// Returns [] when there are none, or null on a DB error (caller shows error).
export async function listPendingOutreachApprovals(limit = 25) {
  try {
    const supabase = getSupabaseServer();
    const { data: approvals, error: aErr } = await supabase
      .from("approval_queue")
      .select("id, entity_id, lead_id, risk_level, summary, payload, created_at")
      .eq("status", "pending")
      .eq("entity_type", "outreach_draft")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (aErr) {
      console.error("[founderMemory] listPendingOutreachApprovals error:", aErr.message);
      return null;
    }
    if (!approvals || approvals.length === 0) return [];

    const draftIds = approvals.map((a) => a.entity_id).filter(Boolean);
    let draftById = new Map();
    if (draftIds.length) {
      const { data: drafts, error: dErr } = await supabase
        .from("outreach_drafts")
        .select("id, channel, subject, body, status")
        .in("id", draftIds);
      if (dErr) {
        console.error("[founderMemory] listPendingOutreachApprovals drafts error:", dErr.message);
        return null;
      }
      draftById = new Map((drafts || []).map((d) => [d.id, d]));
    }

    const leadIds = [...new Set(approvals.map((a) => a.lead_id).filter(Boolean))];
    let leadById = new Map();
    if (leadIds.length) {
      const { data: leads, error: lErr } = await supabase
        .from("leads")
        .select("id, institute_name, website, category, priority, fit_score")
        .in("id", leadIds);
      if (lErr) {
        console.error("[founderMemory] listPendingOutreachApprovals leads error:", lErr.message);
        return null;
      }
      leadById = new Map((leads || []).map((l) => [l.id, l]));
    }

    return approvals.map((a) => ({
      approval_id: a.id,
      risk_level: a.risk_level,
      summary: a.summary,
      payload: a.payload || {},
      created_at: a.created_at,
      draft: draftById.get(a.entity_id) || null,
      lead: a.lead_id ? leadById.get(a.lead_id) || null : null,
    }));
  } catch (err) {
    console.error("[founderMemory] listPendingOutreachApprovals threw:", err?.message);
    return null;
  }
}

// ---- Phase 7: read a full lead-detail bundle (read-only) -------------------
// Returns everything the Lead Detail page renders, with plain per-table reads
// keyed by lead_id (no joins). Defensive:
//   - returns null on a DB error (page shows a load-error banner),
//   - returns { found: false } when the lead id is valid but no row exists,
//   - otherwise { found: true, lead, assessment, drafts, approvals, events, tasks }.
// Read-only: never writes. Events/tasks capped to the newest 50.
export async function getLeadDetail(leadId) {
  if (!leadId) return { found: false };
  try {
    const supabase = getSupabaseServer();

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select(
        "id, lead_type, institute_name, contact_person, contact_email, " +
          "contact_link, website, city, state, country, category, " +
          "estimated_size, pipeline_stage, priority, fit_score, notes, " +
          "source, metadata, created_at, updated_at"
      )
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) {
      console.error("[founderMemory] getLeadDetail lead error:", leadErr.message);
      return null;
    }
    if (!lead) return { found: false };

    const { data: assessments, error: aErr } = await supabase
      .from("sales_assessments")
      .select(
        "id, lead_type, fit_score, priority, rationale, signals, " +
          "rubric_version, created_at"
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (aErr) {
      console.error("[founderMemory] getLeadDetail assessment error:", aErr.message);
      return null;
    }

    const { data: drafts, error: dErr } = await supabase
      .from("outreach_drafts")
      .select("id, channel, subject, body, status, risk_level, task_id, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (dErr) {
      console.error("[founderMemory] getLeadDetail drafts error:", dErr.message);
      return null;
    }

    const { data: approvals, error: apErr } = await supabase
      .from("approval_queue")
      .select(
        "id, entity_type, entity_id, status, risk_level, summary, " +
          "decision_notes, reviewed_at, created_at"
      )
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    if (apErr) {
      console.error("[founderMemory] getLeadDetail approvals error:", apErr.message);
      return null;
    }

    const { data: events, error: eErr } = await supabase
      .from("events")
      .select("id, event_type, task_id, agent_id, payload, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (eErr) {
      console.error("[founderMemory] getLeadDetail events error:", eErr.message);
      return null;
    }

    const { data: tasks, error: tErr } = await supabase
      .from("agent_tasks")
      .select("id, agent_type, status, input, output, error, created_at, completed_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (tErr) {
      console.error("[founderMemory] getLeadDetail tasks error:", tErr.message);
      return null;
    }

    return {
      found: true,
      lead,
      assessment: (assessments && assessments[0]) || null,
      drafts: drafts || [],
      approvals: approvals || [],
      events: events || [],
      tasks: tasks || [],
    };
  } catch (err) {
    console.error("[founderMemory] getLeadDetail threw:", err?.message);
    return null;
  }
}

// ---- Phase 8b: persist enrichment (column updates + metadata merge) ---------
// Updates whitelisted lead columns AND merges a metadata patch in one write.
// `fields` may contain: website, contact_link, city, state, country, category.
// `metadataPatch` is shallow-merged into the existing metadata (e.g. { enrichment }).
// Returns true on success, false on any failure (defensive — never throws).
export async function updateLeadFieldsAndMetadata(leadId, fields = {}, metadataPatch = {}) {
  if (!leadId) return false;
  try {
    const supabase = getSupabaseServer();

    const { data: existing, error: readErr } = await supabase
      .from("leads")
      .select("metadata")
      .eq("id", leadId)
      .maybeSingle();
    if (readErr) {
      console.error("[founderMemory] updateLeadFieldsAndMetadata read error:", readErr.message);
      return false;
    }
    if (!existing) return false;

    // Only allow a safe column whitelist; ignore anything else a caller passes.
    const ALLOWED = ["website", "contact_link", "city", "state", "country", "category"];
    const updates = {};
    for (const k of ALLOWED) {
      if (fields[k] !== undefined) updates[k] = fields[k];
    }
    updates.metadata = { ...(existing.metadata || {}), ...metadataPatch };

    const { error: updErr } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", leadId);
    if (updErr) {
      console.error("[founderMemory] updateLeadFieldsAndMetadata update error:", updErr.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[founderMemory] updateLeadFieldsAndMetadata threw:", err?.message);
    return false;
  }
}
