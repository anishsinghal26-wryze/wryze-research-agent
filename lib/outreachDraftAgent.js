// ============================================================================
// lib/outreachDraftAgent.js
// ----------------------------------------------------------------------------
// Phase 11: per-lead Outreach DRAFT Agent.
//
// generateOutreachDraft({ leadId }) loads one lead + its existing intelligence
// (enrichment, market_intelligence, contact_intelligence) + the KB guardrails,
// asks Claude for a SHORT founder-led outreach DRAFT, then:
//   - stores the draft via recordOutreachDraft() (outreach_drafts, status=pending)
//   - queues it for human review via createApproval() (approval_queue, pending)
//   - persists a summary under leads.metadata.outreach_draft_intelligence
// Re-uses the existing agent_tasks lifecycle (agent_type "sales",
// input.mode "outreach_draft").
//
// HARD CONSTRAINTS: NEVER sends; NEVER auto-approves (the draft is only QUEUED
// as a PENDING approval for a human); does NOT invent names/emails/partnerships
// (the recipient name is grounded against contact_intelligence); does NOT claim
// unverified paid ads; does NOT change scoring or unrelated lead fields; single
// lead only. Server-only (service-role).
//
// Returns (never throws to the caller):
//   { ok: true,  task_id, summary }
//   { ok: false, status, error, task_id? }
// ============================================================================

import { getSupabaseServer } from "./supabaseServer";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  getKbDocs,
  recordOutreachDraft,
  createApproval,
  updateLeadFieldsAndMetadata,
} from "./founderMemory";
import { validateChannel, validateRiskLevel } from "./outreachDraft";

const DRAFT_MODEL = "claude-haiku-4-5-20251001";

// Configured sender identity (env override -> safe defaults). No DB needed, so
// drafts always carry a real founder signature instead of a placeholder.
const SENDER = {
  name: (process.env.WRYZE_SENDER_NAME || "").trim() || "Anish Singhal",
  role: (process.env.WRYZE_SENDER_ROLE || "").trim() || "Founder, Wryze.ai",
  signature:
    (process.env.WRYZE_SENDER_SIGNATURE || "").trim() ||
    "Anish Singhal, Founder — Wryze.ai",
};

// Sender-identity placeholders we will auto-fill with the real signature.
const SENDER_PLACEHOLDER_RE =
  /\[\s*(?:founder(?:'s)?\s*name|your\s*name|full\s*name|sender(?:'s)?\s*name|signature|sender|founder|name)\s*\]/gi;
// Any remaining bracketed placeholder (e.g. [Company], [Insert …]) -> reject.
const ANY_PLACEHOLDER_RE = /\[[^\]\n]{1,60}\]/;

function fillSenderPlaceholders(body) {
  return String(body).replace(SENDER_PLACEHOLDER_RE, SENDER.signature);
}

// ---- small pure helpers ----------------------------------------------------
function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function strArray(v) {
  return Array.isArray(v) ? v.map(cleanStr).filter(Boolean) : [];
}

function parseJsonObject(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function kbBlock(kbDocs, slug) {
  const v = kbDocs && kbDocs[slug];
  return v ? String(v) : "(not available)";
}

// ---- main ------------------------------------------------------------------
export async function generateOutreachDraft({ leadId }) {
  if (!leadId) return { ok: false, status: 400, error: "lead_id is required." };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return {
      ok: false,
      status: 502,
      error: "Server is missing API key (ANTHROPIC_API_KEY).",
    };
  }

  const supabase = getSupabaseServer();

  // ---- Load the lead -------------------------------------------------------
  const { data: lead, error: readErr } = await supabase
    .from("leads")
    .select(
      "id, institute_name, website, city, state, country, category, " +
        "estimated_size, contact_person, fit_score, priority, notes, metadata"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, status: 502, error: `Lead read failed: ${readErr.message}` };
  }
  if (!lead) {
    return { ok: false, status: 404, error: "Lead not found." };
  }

  // ---- Task lifecycle (reuse sales agent, mode=outreach_draft) -------------
  const task = await createTask({
    agent_type: "sales",
    input: { mode: "outreach_draft", lead_id: leadId, triggered_by: "founder_ui" },
    lead_id: leadId,
  });
  if (!task || !task.task_id) {
    return {
      ok: false,
      status: 502,
      error: "Could not create the outreach-draft task (shared memory unavailable).",
    };
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;
  await markRunning(task_id, agent_id);

  try {
    const md = lead.metadata || {};
    const enr = md.enrichment || {};
    const mi = md.market_intelligence || {};
    const ci = md.contact_intelligence || {};

    // Allowed recipient names = ONLY those grounded in contact_intelligence.
    const allowedNames = new Set();
    const people = Array.isArray(ci.people) ? ci.people : [];
    for (const p of people) {
      const nm = cleanStr(p && p.name);
      if (nm) allowedNames.add(nm.toLowerCase());
    }
    const primaryFromCi = cleanStr(ci.recommended_primary_contact);
    if (primaryFromCi && primaryFromCi.toLowerCase() !== "generic contact channel") {
      allowedNames.add(primaryFromCi.toLowerCase());
    }
    const topPerson = people[0] || null;
    const namedContactLine = topPerson
      ? `${topPerson.name}${topPerson.title ? " — " + topPerson.title : ""} (role_type: ${topPerson.role_type || "unknown"})`
      : primaryFromCi && primaryFromCi.toLowerCase() !== "generic contact channel"
      ? primaryFromCi
      : "(no named decision-maker found — address the team / generic channel)";

    const kbDocs = await getKbDocs([
      "wryze-positioning",
      "approved-messaging",
      "guardrail-rules",
    ]);

    // ---- Build context for the model --------------------------------------
    const contextLines = [
      `Institute: ${lead.institute_name || "(unknown)"}`,
      lead.website ? `Website: ${lead.website}` : null,
      [lead.city, lead.state, lead.country].filter(Boolean).length
        ? `Location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(", ")}`
        : null,
      lead.category ? `Category: ${lead.category}` : null,
      lead.estimated_size ? `Size: ${lead.estimated_size}` : null,
      `Fit score: ${lead.fit_score ?? "?"} · Priority: ${lead.priority || "?"}`,
      enr.quality_classification ? `Enrichment fit: ${enr.quality_classification}` : null,
      enr.primary_business ? `Primary business: ${enr.primary_business}` : null,
      typeof enr.offers_sat_prep === "boolean" ? `Offers SAT prep: ${enr.offers_sat_prep}` : null,
      mi.acquisition_stage ? `Market acquisition stage: ${mi.acquisition_stage}` : null,
      mi.recommended_outreach_angle ? `Market-intel suggested angle: ${mi.recommended_outreach_angle}` : null,
      `Named contact: ${namedContactLine}`,
      ci.recommended_next_step ? `Contact-intel next step: ${ci.recommended_next_step}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // ---- Claude draft -----------------------------------------------------
    const system =
      "You are the founder of Wryze.ai writing a SHORT, personalized, DRAFT-ONLY " +
      "outreach message to a B2B lead (an SAT/test-prep institute). Wryze.ai is an " +
      "AI diagnostic SAT-prep platform. This is a DRAFT for human review — it is " +
      "NEVER sent automatically. Follow the approved messaging and guardrails. " +
      "RULES: founder-led, warm, specific tone; keep the body BETWEEN ~120 and ~150 " +
      "words (shorter is fine for a LinkedIn-style message); reference WHY this " +
      "institute is relevant using the provided context; if a named decision-maker is " +
      "provided, address them by name, otherwise address the team / generic channel; " +
      "include ONE clear but soft call-to-action (e.g. a brief intro call). The sender " +
      'is ' + SENDER.name + " (" + SENDER.role + "); sign off EXACTLY as \"" +
      SENDER.signature + "\". NEVER use placeholder tokens such as [Founder name], " +
      "[Your name], [Company], or [Insert …] — always write the real signature. NO hype " +
      "or buzzwords; do NOT overclaim or promise score increases or outcomes; do NOT " +
      "imply College Board endorsement; do NOT claim the message was or will be sent; " +
      "do NOT mention paid ads unless the context explicitly confirms them; do NOT " +
      "invent names, emails, titles, or partnerships. Only use a recipient name if it " +
      "is given in the context.\n\n" +
      "=== WRYZE POSITIONING ===\n" + kbBlock(kbDocs, "wryze-positioning") +
      "\n\n=== APPROVED MESSAGING ===\n" + kbBlock(kbDocs, "approved-messaging") +
      "\n\n=== GUARDRAIL RULES ===\n" + kbBlock(kbDocs, "guardrail-rules") +
      "\n\nRespond with ONLY a valid JSON object (no markdown/code fences) with EXACTLY " +
      "these keys: " +
      '"draft_type" (string, e.g. "cold_intro_email"), ' +
      '"recommended_recipient_name" (string|null — ONLY a name present in the context; ' +
      "else null), " +
      '"recommended_recipient_role" (string|null), ' +
      '"recommended_channel" ("email"|"linkedin"|"sms"|"whatsapp"|"other"), ' +
      '"subject" (string), "body" (string, the draft message), ' +
      '"personalization_points" (array of short strings: what was personalized & why), ' +
      '"source_context_used" (array of short strings naming which inputs you used, e.g. ' +
      '"enrichment","market_intelligence","contact_intelligence","lead_profile"), ' +
      '"risk_level" ("low"|"medium"|"high"|"critical"|"blocked"), ' +
      '"risk_notes" (string: any claims a human should double-check before sending).';
    const userMsg =
      `Lead context:\n${contextLines}\n\n` +
      "Write the JSON draft now.";

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!aRes.ok) {
      throw new Error(`Draft generation failed (Anthropic HTTP ${aRes.status}).`);
    }
    const aData = await aRes.json();
    const raw =
      (aData && aData.content && aData.content[0] && aData.content[0].text) || "";
    const parsed = parseJsonObject(raw);
    if (!parsed) throw new Error("Draft generation returned unparseable output.");

    const subject = cleanStr(parsed.subject) || "Wryze.ai — quick intro";
    const rawBody = cleanStr(parsed.body);
    if (!rawBody) throw new Error("Draft generation produced an empty body.");
    // Deterministic placeholder guard: fill sender-identity placeholders with the
    // configured signature, then REFUSE any draft that still has a bracketed
    // placeholder (e.g. [Company], [Insert …]) so we never queue a malformed draft.
    const body = fillSenderPlaceholders(rawBody);
    if (ANY_PLACEHOLDER_RE.test(body)) {
      throw new Error(
        "Draft contained an unresolved placeholder (e.g. [Company] / [Insert …]) — not queued; please regenerate."
      );
    }

    const channel = validateChannel(parsed.recommended_channel);
    const risk_level = validateRiskLevel(parsed.risk_level);

    // Ground the recipient name strictly against contact_intelligence.
    let recommended_recipient_name = cleanStr(parsed.recommended_recipient_name);
    if (
      !recommended_recipient_name ||
      !allowedNames.has(recommended_recipient_name.toLowerCase())
    ) {
      recommended_recipient_name = null; // not grounded -> generic
    }
    const recommended_recipient_role = recommended_recipient_name
      ? cleanStr(parsed.recommended_recipient_role)
      : null;

    const draft_type = cleanStr(parsed.draft_type) || "cold_intro_email";
    const personalization_points = strArray(parsed.personalization_points);
    const source_context_used = strArray(parsed.source_context_used);
    const risk_notes = cleanStr(parsed.risk_notes);
    const created_at = new Date().toISOString();

    // ---- Store the DRAFT (pending) ----------------------------------------
    const draft_id = await recordOutreachDraft({
      lead_id: leadId,
      task_id,
      channel,
      subject,
      body,
      status: "pending",
      risk_level,
    });
    if (!draft_id) throw new Error("Could not store the outreach draft.");

    // ---- Queue for human review (PENDING — never auto-approved) -----------
    const approval_id = await createApproval({
      entity_type: "outreach_draft",
      entity_id: draft_id,
      task_id,
      lead_id: leadId,
      agent_id,
      risk_level,
      summary: subject,
      payload: {
        draft_type,
        recommended_recipient_name,
        recommended_recipient_role,
        recommended_channel: channel,
        personalization_points,
        source_context_used,
        risk_notes,
      },
    });

    // ---- Persist a summary under metadata (no scoring / column changes) ---
    const outreach_draft_intelligence = {
      status: "drafted",
      created_at,
      draft_type,
      recommended_recipient_name,
      recommended_recipient_role,
      recommended_channel: channel,
      subject,
      body,
      personalization_points,
      source_context_used,
      risk_level,
      risk_notes,
      draft_id,
      approval_id,
      task_id,
    };
    const persisted = await updateLeadFieldsAndMetadata(
      leadId,
      {},
      { outreach_draft_intelligence }
    );
    if (!persisted) {
      throw new Error("Could not persist the outreach draft summary to the lead.");
    }

    const summary = { task_id, ...outreach_draft_intelligence };
    await markCompleted(task_id, summary, agent_id);
    return { ok: true, task_id, summary };
  } catch (err) {
    const message = err?.message || "Outreach draft failed.";
    await markFailed(task_id, message, agent_id);
    return { ok: false, status: 502, task_id, error: message };
  }
}
