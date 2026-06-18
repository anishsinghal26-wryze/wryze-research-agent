// ============================================================================
// lib/salesDiscovery.js
// ----------------------------------------------------------------------------
// Phase 8: SHARED Sales Lead Discovery orchestration.
//
// This is the exact Phase 5 discovery flow, extracted from the route handler so
// it can be called from BOTH entry points with identical behavior:
//   - app/api/agents/sales/discover/route.js   (gated by AGENT_RUN_SECRET)
//   - app/sales-pipeline/api/discover/route.js (gated by the sp_auth cookie)
//
// It creates an agent_tasks row, runs Tavily + Claude discovery, deduplicates
// against existing leads AND within the batch, inserts NEW leads
// (source = "sales_discovery"), scores them with the Phase 4 rubric, writes
// sales_assessments, updates leads.fit_score/priority, and emits
// lead_created + lead_scored. Per-lead failures are best-effort.
//
// NEVER creates outreach drafts or approvals, and NEVER sends anything.
// Server-only (service-role). Reads no secret of its own — the gates live in
// the routes, so AGENT_RUN_SECRET is never needed here and never reaches the
// browser.
//
// Returns (never throws to the caller):
//   { ok: true,  task_id, summary, inserted_ids }
//   { ok: false, status, error, task_id? }   // status is the HTTP code to use
// ============================================================================

import { scoreLead } from "./salesScoring";
import {
  runLeadDiscovery,
  normalizeWebsite,
  normalizeEmail,
  normalizeName,
  isDuplicate,
} from "./leadDiscovery";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  emitEvent,
  insertLead,
  listLeadDedupKeys,
  recordSalesAssessment,
  updateLeadScore,
} from "./founderMemory";

function addKeys(keys, candidate) {
  const w = normalizeWebsite(candidate.website);
  const e = normalizeEmail(candidate.contact_email);
  const n = normalizeName(candidate.institute_name);
  if (w) keys.websites.add(w);
  if (e) keys.emails.add(e);
  if (n) keys.names.add(n);
}

// query is REQUIRED and max_results must already be a clamped integer.
// taskInputExtra lets a caller stamp the task.input (e.g. { triggered_by: "founder_ui" })
// without changing schema. The agent route passes nothing -> identical Phase 5 behavior.
export async function runSalesDiscoveryBatch({
  query,
  location = null,
  category = null,
  max_results,
  taskInputExtra = {},
}) {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) {
    return { ok: false, status: 400, error: "query is required." };
  }

  // ---- Create the task ----------------------------------------------------
  const task = await createTask({
    agent_type: "sales",
    input: {
      mode: "discover",
      query: cleanQuery,
      location,
      category,
      max_results,
      ...taskInputExtra,
    },
  });
  if (!task || !task.task_id) {
    return {
      ok: false,
      status: 502,
      error:
        "Could not create the discovery task (shared memory / Supabase unavailable). No discovery was run.",
    };
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;

  await markRunning(task_id, agent_id);

  try {
    // ---- Discover (Tavily + Claude) ---------------------------------------
    const { searched_count, candidates } = await runLeadDiscovery({
      query: cleanQuery,
      location,
      category,
      max_results,
    });

    // ---- Build dedup keys from existing leads -----------------------------
    // A read failure returns null (not []), which would otherwise look like
    // "no existing leads" and risk inserting duplicates. Fail the run instead.
    const existingRows = await listLeadDedupKeys();
    if (!existingRows) {
      throw new Error("Could not load existing lead dedup keys.");
    }
    const keys = { websites: new Set(), emails: new Set(), names: new Set() };
    for (const r of existingRows) {
      const w = normalizeWebsite(r.website);
      const e = normalizeEmail(r.contact_email);
      const n = normalizeName(r.institute_name);
      if (w) keys.websites.add(w);
      if (e) keys.emails.add(e);
      if (n) keys.names.add(n);
    }
    const batchKeys = { websites: new Set(), emails: new Set(), names: new Set() };

    // ---- Insert + score each new candidate (best-effort per lead) ---------
    let inserted_count = 0;
    let skipped_duplicate_count = 0;
    let scored_count = 0;
    const failures = [];
    const inserted_ids = [];

    for (const c of candidates) {
      // Dedup against existing leads AND earlier candidates in this batch.
      if (isDuplicate(c, keys) || isDuplicate(c, batchKeys)) {
        skipped_duplicate_count += 1;
        continue;
      }
      addKeys(batchKeys, c);

      // Insert the lead.
      let leadId;
      try {
        leadId = await insertLead({
          lead_type: "b2b",
          institute_name: c.institute_name,
          website: c.website,
          contact_email: c.contact_email,
          contact_link: c.contact_link,
          city: c.city,
          state: c.state,
          country: c.country,
          category: c.category,
          estimated_size: c.estimated_size,
          source: "sales_discovery",
          metadata: {
            source_url: c.source_url,
            discovery_query: cleanQuery,
            size_estimated: c.size_estimated,
          },
        });
      } catch (err) {
        failures.push({
          institute_name: c.institute_name,
          stage: "insert_lead",
          error: err?.message || "insert threw",
        });
        continue;
      }
      if (!leadId) {
        failures.push({
          institute_name: c.institute_name,
          stage: "insert_lead",
          error: "insert returned null",
        });
        continue;
      }
      inserted_count += 1;
      inserted_ids.push(leadId);
      await emitEvent("lead_created", {
        task_id,
        lead_id: leadId,
        agent_id,
        payload: { source: "sales_discovery", institute_name: c.institute_name },
      });

      // Score the lead (best-effort).
      try {
        const s = scoreLead({
          lead_type: "b2b",
          country: c.country,
          category: c.category,
          estimated_size: c.estimated_size,
          website: c.website,
          contact_email: c.contact_email,
          contact_link: c.contact_link,
        });
        const assessment_id = await recordSalesAssessment({
          lead_id: leadId,
          task_id,
          lead_type: "b2b",
          fit_score: s.fit_score,
          priority: s.priority,
          rationale: s.rationale,
          signals: s.signals,
          rubric_version: s.rubric_version,
        });
        if (!assessment_id) {
          failures.push({
            institute_name: c.institute_name,
            stage: "assessment",
            error: "assessment insert returned null",
          });
          continue;
        }
        // Guard the lead update — only emit lead_scored / count it on success.
        const leadUpdated = await updateLeadScore(leadId, s.fit_score, s.priority);
        if (!leadUpdated) {
          failures.push({
            institute_name: c.institute_name,
            stage: "lead_update",
            error: "lead score update returned false",
          });
          continue;
        }
        await emitEvent("lead_scored", {
          task_id,
          lead_id: leadId,
          agent_id,
          payload: {
            assessment_id,
            fit_score: s.fit_score,
            priority: s.priority,
            rubric_version: s.rubric_version,
          },
        });
        scored_count += 1;
      } catch (err) {
        failures.push({
          institute_name: c.institute_name,
          stage: "scoring",
          error: err?.message || "scoring threw",
        });
      }
    }

    const summary = {
      searched_count,
      inserted_count,
      skipped_duplicate_count,
      scored_count,
      failures,
    };

    await markCompleted(task_id, summary, agent_id);

    return { ok: true, task_id, summary, inserted_ids };
  } catch (err) {
    const message = err?.message || "Discovery failed.";
    await markFailed(task_id, message, agent_id);
    return { ok: false, status: 502, task_id, error: message };
  }
}
