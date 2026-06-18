// ============================================================================
// app/api/agents/sales/discover/route.js
// ----------------------------------------------------------------------------
// POST /api/agents/sales/discover
//
// Sales Lead Discovery Agent: searches the web for B2B SAT-prep-market
// institutes (Tavily), extracts structured candidates (Claude), deduplicates
// against existing leads, inserts NEW leads, scores them with the existing
// Phase 4 rubric, writes sales_assessments, updates leads.fit_score/priority,
// and emits lead_created + lead_scored. Server-only (service-role).
//
// Body: { "query": "...", "location": "...", "category": "...", "max_results": 10 }
//   - query is REQUIRED; max_results is clamped to 1..20 (default 10).
//
// Gate: if AGENT_RUN_SECRET is set, callers must send header
//   x-agent-run-secret: <value>
//
// Per-lead failures are BEST-EFFORT: one bad candidate does not abort the
// batch; it is recorded in the summary's `failures`.
// ============================================================================

import { scoreLead } from "../../../../../lib/salesScoring";
import {
  runLeadDiscovery,
  clampResults,
  normalizeWebsite,
  normalizeEmail,
  normalizeName,
  isDuplicate,
} from "../../../../../lib/leadDiscovery";
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
} from "../../../../../lib/founderMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function addKeys(keys, candidate) {
  const w = normalizeWebsite(candidate.website);
  const e = normalizeEmail(candidate.contact_email);
  const n = normalizeName(candidate.institute_name);
  if (w) keys.websites.add(w);
  if (e) keys.emails.add(e);
  if (n) keys.names.add(n);
}

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
  const query = (body.query || "").trim();
  const location = body.location ? String(body.location).trim() : null;
  const category = body.category ? String(body.category).trim() : null;
  const max_results = clampResults(body.max_results);

  if (!query) {
    return Response.json(
      { ok: false, error: "query is required." },
      { status: 400 }
    );
  }

  // ---- Create the task -----------------------------------------------------
  const task = await createTask({
    agent_type: "sales",
    input: { mode: "discover", query, location, category, max_results },
  });
  if (!task || !task.task_id) {
    return Response.json(
      {
        ok: false,
        error:
          "Could not create the discovery task (shared memory / Supabase unavailable). No discovery was run.",
      },
      { status: 502 }
    );
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;

  await markRunning(task_id, agent_id);

  try {
    // ---- Discover (Tavily + Claude) ----------------------------------------
    const { searched_count, candidates } = await runLeadDiscovery({
      query,
      location,
      category,
      max_results,
    });

    // ---- Build dedup keys from existing leads ------------------------------
    // QC: a read failure returns null (not []), which would otherwise look like
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

    // ---- Insert + score each new candidate (best-effort per lead) ----------
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
            discovery_query: query,
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
        // QC: guard the lead update — only emit lead_scored / count it on success.
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

    return Response.json({ ok: true, task_id, summary, inserted_ids });
  } catch (err) {
    const message = err?.message || "Discovery failed.";
    await markFailed(task_id, message, agent_id);
    return Response.json(
      { ok: false, task_id, error: message },
      { status: 502 }
    );
  }
}
