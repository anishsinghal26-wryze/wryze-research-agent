// ============================================================================
// lib/contactIntelligence.js
// ----------------------------------------------------------------------------
// Phase 10: READ-ONLY per-lead Contact + Decision-Maker Intelligence.
//
// analyzeContactIntelligence({ leadId }) loads one lead, runs a PUBLIC web pass
// (Tavily: leadership / roles / contact-channels) + Claude structured analysis,
// and stores the result under leads.metadata.contact_intelligence (shallow-
// merged; enrichment + market_intelligence are preserved). Re-uses the existing
// agent_tasks lifecycle (agent_type "sales", input.mode "contact_intel") — no
// new agents row / event-enum / migration needed.
//
// HARD CONSTRAINTS: public web URLs only; NEVER scrape behind login walls;
// NEVER hallucinate emails — an email/phone is kept ONLY if it appears verbatim
// in the public search content; LinkedIn/profile/contact URLs are grounded
// against the search results (never invented); named contacts are kept SEPARATE
// from generic contact channels; never sends, drafts, approves; does NOT change
// scoring or unrelated lead fields. Server-only (service-role).
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
  updateLeadFieldsAndMetadata,
} from "./founderMemory";

const CI_MODEL = "claude-haiku-4-5-20251001";

const ROLE_TYPES = [
  "founder_owner_ceo",
  "director",
  "admissions_director",
  "program_head",
  "center_manager",
  "business_development",
  "other",
];

// ---- small pure helpers ----------------------------------------------------
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function groundUrl(url, sourcesText) {
  if (!url || typeof url !== "string") return null;
  const host = hostOf(url);
  if (!host) return null;
  return sourcesText.toLowerCase().includes(host) ? url : null;
}

// Keep an email ONLY if it appears verbatim (case-insensitive) in the public
// content — never invent or infer personal emails.
function groundEmail(email, sourcesText) {
  const s = cleanStr(email);
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return sourcesText.toLowerCase().includes(s.toLowerCase()) ? s : null;
}

// Keep a phone ONLY if its digit sequence (>= 7 digits) appears in the public
// content (digits-only comparison, robust to formatting).
function groundPhone(phone, sourcesText) {
  const s = cleanStr(phone);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const srcDigits = sourcesText.replace(/\D/g, "");
  return srcDigits.includes(digits) ? s : null;
}

function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
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

async function tavilySearch(query, tavilyKey) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyKey}`,
    },
    body: JSON.stringify({
      query,
      topic: "general",
      search_depth: "basic",
      max_results: 5,
    }),
  });
  if (!res.ok) {
    throw new Error(`Web search failed (Tavily HTTP ${res.status}).`);
  }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

// ---- main ------------------------------------------------------------------
export async function analyzeContactIntelligence({ leadId }) {
  if (!leadId) return { ok: false, status: 400, error: "lead_id is required." };

  const tavilyKey = process.env.TAVILY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!tavilyKey || !anthropicKey) {
    return {
      ok: false,
      status: 502,
      error: "Server is missing API keys (TAVILY_API_KEY / ANTHROPIC_API_KEY).",
    };
  }

  const supabase = getSupabaseServer();

  // ---- Load the lead -------------------------------------------------------
  const { data: lead, error: readErr } = await supabase
    .from("leads")
    .select(
      "id, institute_name, website, city, state, country, category, metadata"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, status: 502, error: `Lead read failed: ${readErr.message}` };
  }
  if (!lead) {
    return { ok: false, status: 404, error: "Lead not found." };
  }

  // ---- Task lifecycle (reuse sales agent, mode=contact_intel) --------------
  const task = await createTask({
    agent_type: "sales",
    input: { mode: "contact_intel", lead_id: leadId, triggered_by: "founder_ui" },
    lead_id: leadId,
  });
  if (!task || !task.task_id) {
    return {
      ok: false,
      status: 502,
      error: "Could not create the contact-intel task (shared memory unavailable).",
    };
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;
  await markRunning(task_id, agent_id);

  try {
    // ---- Public web pass (Tavily): leadership / roles / contact -----------
    const loc = [lead.city, lead.state]
      .filter(Boolean)
      .map((p) => String(p).trim())
      .join(" ");
    const name = lead.institute_name ? String(lead.institute_name).trim() : "";
    const queries = [
      { type: "leadership", q: [name, loc, "founder owner CEO director leadership team"].filter(Boolean).join(" ") },
      { type: "roles", q: [name, loc, "admissions director program head center manager partnerships"].filter(Boolean).join(" ") },
      { type: "contact", q: [name, loc, "contact email phone LinkedIn"].filter(Boolean).join(" ") },
    ];

    const settled = await Promise.allSettled(
      queries.map((qq) => tavilySearch(qq.q, tavilyKey))
    );
    if (settled.every((r) => r.status === "rejected")) {
      const firstErr = settled.find((r) => r.status === "rejected");
      throw new Error(
        (firstErr && firstErr.reason && firstErr.reason.message) ||
          "Web search failed (Tavily)."
      );
    }

    // De-duplicate across queries by URL; track query-type provenance.
    const byUrl = new Map();
    settled.forEach((r, qi) => {
      if (r.status !== "fulfilled") return;
      const qtype = queries[qi].type;
      for (const item of r.value) {
        const url = item && item.url ? String(item.url) : null;
        if (!url) continue;
        const existing = byUrl.get(url);
        if (existing) {
          if (!existing.query_types.includes(qtype)) existing.query_types.push(qtype);
        } else {
          byUrl.set(url, {
            title: item.title || null,
            url,
            content: item.content || "",
            query_types: [qtype],
          });
        }
      }
    });

    const results = Array.from(byUrl.values()).map((r, i) => ({
      index: i,
      title: r.title,
      url: r.url,
      content: r.content,
      query_types: r.query_types,
    }));
    const searched_count = results.length;
    const urlByIndex = new Map(results.map((r) => [r.index, r.url]));
    const sourcesText = results
      .map(
        (r) =>
          `Source ${r.index} [${r.query_types.join(",")}]: ${r.title}\nURL: ${r.url}\n${r.content}`
      )
      .join("\n\n");

    // ---- Claude analysis --------------------------------------------------
    const system =
      "You research PUBLIC contact and decision-maker information for a B2B lead so " +
      "the founder of Wryze.ai (a SAT-prep company) can do founder-led outreach. Use " +
      "ONLY the provided search content. Do NOT invent names, titles, URLs, emails, or " +
      "phone numbers; if unknown, use null. NEVER guess or infer an email address — " +
      "only include an email/phone that appears VERBATIM in the provided content. " +
      "Capture LinkedIn/profile/contact URLs ONLY if they appear in the content. " +
      "Target roles (most useful first): founder/owner/CEO, director, admissions " +
      "director, SAT/test-prep program head, center manager, business development / " +
      "partnerships. If NO named decision-maker is found, say so explicitly and " +
      "recommend the generic contact route. Keep NAMED people separate from GENERIC " +
      "contact channels. Respond with ONLY a valid JSON object (no markdown/code " +
      "fences) with EXACTLY these keys: " +
      '"people" (array of objects, may be []; each: {"name" (string), "title" (string|null), ' +
      '"role_type" ("founder_owner_ceo"|"director"|"admissions_director"|"program_head"|' +
      '"center_manager"|"business_development"|"other"), "linkedin_url" (string|null), ' +
      '"email" (string|null — verbatim only), "phone" (string|null — verbatim only), ' +
      '"source_url" (string|null), "confidence" (number 0..1), "notes" (string|null)}), ' +
      '"generic_contact_channels" ({"website_contact_url" (string|null), "general_email" ' +
      '(string|null — verbatim only), "phone" (string|null — verbatim only), ' +
      '"contact_form_url" (string|null), "admissions_url" (string|null)}), ' +
      '"decision_maker_confidence" (number 0..1: confidence a real decision-maker was identified), ' +
      '"recommended_primary_contact" (string: a named person, or "generic contact channel" if none), ' +
      '"recommended_contact_reason" (string), ' +
      '"recommended_next_step" (string: the concrete next action for founder-led outreach), ' +
      '"explanation" (string: state explicitly whether a named decision-maker was found), ' +
      '"evidence_source_indexes" (array of Source numbers you relied on).';
    const userMsg =
      `Lead under research:\n` +
      `  institute_name: ${lead.institute_name || "(unknown)"}\n` +
      `  website: ${lead.website || "(none)"}\n` +
      `  category: ${lead.category || "(none)"}\n` +
      `  location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "(none)"}\n\n` +
      `Public search results (Source tags show query provenance: [leadership]/[roles]/[contact]):\n\n${sourcesText || "(no results)"}\n\n` +
      "Return the JSON object now.";

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CI_MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!aRes.ok) {
      throw new Error(`Analysis failed (Anthropic HTTP ${aRes.status}).`);
    }
    const aData = await aRes.json();
    const raw =
      (aData && aData.content && aData.content[0] && aData.content[0].text) || "";
    const parsed = parseJsonObject(raw) || {};

    // ---- Normalize + ground -----------------------------------------------
    const rawPeople = Array.isArray(parsed.people) ? parsed.people : [];
    const people = rawPeople
      .map((p) => {
        const nm = cleanStr(p && p.name);
        if (!nm) return null; // require a real name
        let role_type = cleanStr(p && p.role_type);
        if (!ROLE_TYPES.includes(role_type)) role_type = "other";
        return {
          name: nm,
          title: cleanStr(p && p.title),
          role_type,
          linkedin_url: groundUrl(cleanStr(p && p.linkedin_url), sourcesText),
          email: groundEmail(p && p.email, sourcesText),
          phone: groundPhone(p && p.phone, sourcesText),
          source_url: groundUrl(cleanStr(p && p.source_url), sourcesText),
          confidence: clamp01(p && p.confidence),
          notes: cleanStr(p && p.notes),
        };
      })
      .filter(Boolean);

    const gc = (parsed.generic_contact_channels && typeof parsed.generic_contact_channels === "object")
      ? parsed.generic_contact_channels
      : {};
    const generic_contact_channels = {
      website_contact_url: groundUrl(cleanStr(gc.website_contact_url), sourcesText),
      general_email: groundEmail(gc.general_email, sourcesText),
      phone: groundPhone(gc.phone, sourcesText),
      contact_form_url: groundUrl(cleanStr(gc.contact_form_url), sourcesText),
      admissions_url: groundUrl(cleanStr(gc.admissions_url), sourcesText),
    };

    const evidence_urls = (Array.isArray(parsed.evidence_source_indexes)
      ? parsed.evidence_source_indexes
      : [])
      .map((i) => urlByIndex.get(Number(i)))
      .filter(Boolean)
      .map((url) => ({ url }));

    const created_at = new Date().toISOString();
    const contact_intelligence = {
      status: "analyzed",
      created_at,
      contacts_found_count: people.length,
      decision_maker_confidence: clamp01(parsed.decision_maker_confidence),
      recommended_primary_contact: cleanStr(parsed.recommended_primary_contact),
      recommended_contact_reason: cleanStr(parsed.recommended_contact_reason),
      people,
      generic_contact_channels,
      recommended_next_step: cleanStr(parsed.recommended_next_step),
      evidence_urls,
      explanation: cleanStr(parsed.explanation),
      searched_count,
      task_id,
    };

    // ---- Persist (metadata only; no column changes, no scoring) -----------
    const persisted = await updateLeadFieldsAndMetadata(leadId, {}, { contact_intelligence });
    if (!persisted) {
      throw new Error("Could not persist contact intelligence to the lead.");
    }

    const summary = { task_id, ...contact_intelligence };
    await markCompleted(task_id, summary, agent_id);
    return { ok: true, task_id, summary };
  } catch (err) {
    const message = err?.message || "Contact intelligence failed.";
    await markFailed(task_id, message, agent_id);
    return { ok: false, status: 502, task_id, error: message };
  }
}
