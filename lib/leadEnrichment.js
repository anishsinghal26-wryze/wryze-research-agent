// ============================================================================
// lib/leadEnrichment.js
// ----------------------------------------------------------------------------
// Phase 8b: SHARED Lead Verification & Enrichment for sales_discovery leads.
//
// enrichLead({ leadId }) loads one lead, runs a public web pass (Tavily) +
// Claude structured verification, classifies quality, stores everything under
// leads.metadata.enrichment (preserving prior values in .original), updates the
// existing first-class columns when confidently verified, re-scores with the
// UNCHANGED Phase 4 rubric (scoreLead), and — for wrong_category — forces
// priority Low while keeping the lead VISIBLE (never deleted).
//
// Emits the existing 'lead_researched' event for the enrichment and 'lead_scored'
// after the re-score (no event-enum migration needed).
//
// HARD CONSTRAINTS: public web URLs only; no login-gated/aggressive scraping;
// URLs are grounded against the Tavily results (never invented); never sends,
// never creates outreach drafts or approvals. Server-only (service-role).
//
// Returns (never throws to the caller):
//   { ok: true,  task_id, summary }
//   { ok: false, status, error, task_id? }
// ============================================================================

import { getSupabaseServer } from "./supabaseServer";
import { scoreLead } from "./salesScoring";
import {
  createTask,
  markRunning,
  markCompleted,
  markFailed,
  emitEvent,
  recordSalesAssessment,
  updateLeadScore,
  updateLeadFieldsAndMetadata,
} from "./founderMemory";

const ENRICH_MODEL = "claude-haiku-4-5-20251001";

const CLASSIFICATIONS = [
  "strong_fit",
  "possible_fit",
  "wrong_category",
  "duplicate_or_unclear",
];

// ---- small pure helpers ----------------------------------------------------
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Keep a URL only if its host actually appears somewhere in the search content.
// This prevents Claude from inventing official sites / socials.
function groundUrl(url, sourcesText) {
  if (!url || typeof url !== "string") return null;
  const host = hostOf(url);
  if (!host) return null;
  return sourcesText.toLowerCase().includes(host) ? url : null;
}

function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
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

// Normalize common country spellings/abbreviations to a canonical form BEFORE
// persisting to lead columns, storing in metadata.enrichment.location.country,
// and re-scoring the merged lead. Backward-compatible: unknown/blank values are
// returned trimmed (or null/empty passthrough) so existing behavior is preserved.
function normalizeCountry(value) {
  const s = cleanStr(value);
  if (!s) return s; // null/empty passthrough
  const key = s
    .toLowerCase()
    .replace(/\./g, "") // "U.S." -> "us", "U.S.A." -> "usa"
    .replace(/\s+/g, " ")
    .trim();
  const USA = new Set([
    "united states",
    "united states of america",
    "us",
    "u s",
    "usa",
    "u s a",
  ]);
  const UK = new Set(["uk", "u k", "united kingdom"]);
  const UAE = new Set(["uae", "u a e", "united arab emirates"]);
  if (USA.has(key)) return "USA";
  if (UK.has(key)) return "UK";
  if (UAE.has(key)) return "UAE";
  return s; // unknown -> keep original trimmed value (no data loss)
}

// One public web search (Tavily). Returns the raw results array (may be []).
// Throws on a non-OK HTTP response so callers can decide how to tolerate it.
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
export async function enrichLead({ leadId }) {
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
      "id, lead_type, institute_name, website, contact_email, contact_link, " +
        "city, state, country, category, estimated_size, metadata"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) {
    return { ok: false, status: 502, error: `Lead read failed: ${readErr.message}` };
  }
  if (!lead) {
    return { ok: false, status: 404, error: "Lead not found." };
  }

  // ---- Task lifecycle ------------------------------------------------------
  const task = await createTask({
    agent_type: "sales",
    input: { mode: "enrich", lead_id: leadId, triggered_by: "founder_ui" },
    lead_id: leadId,
  });
  if (!task || !task.task_id) {
    return {
      ok: false,
      status: 502,
      error: "Could not create the enrichment task (shared memory unavailable).",
    };
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;
  await markRunning(task_id, agent_id);

  try {
    // ---- Public web pass (Tavily): 3-query strategy -----------------------
    // De-bias classification: gather NEUTRAL identity evidence (official site,
    // programs/services) ALONGSIDE SAT-specific evidence so the SAT query is
    // never the first or only signal. Each retained source is labeled with the
    // query type(s) that surfaced it, which lets Claude weigh neutral identity
    // evidence against SAT-specific evidence.
    const loc = [lead.city, lead.state]
      .filter(Boolean)
      .map((p) => String(p).trim())
      .join(" ");
    const name = lead.institute_name ? String(lead.institute_name).trim() : "";
    const queries = [
      { type: "official", q: [name, loc, "official website"].filter(Boolean).join(" ") },
      { type: "identity", q: [name, loc, "programs services"].filter(Boolean).join(" ") },
      { type: "sat", q: [name, loc, "SAT prep ACT test prep"].filter(Boolean).join(" ") },
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

    // De-duplicate across queries by URL; track which query type(s) surfaced each.
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
    // Sources whose provenance includes the SAT query = SAT-specific evidence pool.
    const satIndexes = new Set(
      results.filter((r) => r.query_types.includes("sat")).map((r) => r.index)
    );
    const sourcesText = results
      .map(
        (r) =>
          `Source ${r.index} [${r.query_types.join(",")}]: ${r.title}\nURL: ${r.url}\n${r.content}`
      )
      .join("\n\n");

    // ---- Claude verification ----------------------------------------------
    // Each Source is tagged with the query type(s) that surfaced it:
    //   [official] / [identity] = NEUTRAL identity evidence (what the business is)
    //   [sat]                    = SAT-specific evidence (test-prep offering)
    // Claude must establish primary_business from neutral evidence FIRST, then
    // weigh SAT-specific evidence against it — SAT is never the first/only signal.
    const system =
      "You verify and enrich a B2B lead for Wryze.ai (a SAT-prep company selling to " +
      "SAT/test-prep institutes). Use ONLY the provided search content. Do NOT invent " +
      "URLs, names, or facts; if a field is unknown, use null. Capture social URLs ONLY " +
      "if they appear in the provided content (no scraping, no guessing). " +
      "Each Source is tagged with the query type(s) that surfaced it: [official] and " +
      "[identity] are NEUTRAL identity evidence (what the business actually is); [sat] is " +
      "SAT/test-prep-specific evidence. REASONING ORDER (avoid confirmation bias): (1) From " +
      "the NEUTRAL [official]/[identity] sources, determine primary_business — the dominant " +
      "thing this organization does. (2) THEN, from [sat] sources, judge whether it credibly " +
      "offers SAT/test prep. (3) Compare the two: do not infer SAT prep merely because a [sat] " +
      "query returned generic results — require explicit SAT/ACT/test-prep evidence tied to " +
      "this business. Respond with ONLY a valid JSON object (no markdown/code fences) with " +
      "EXACTLY these keys: " +
      '"is_real_business" (boolean|null), "primary_business" (string|null = the dominant ' +
      "business identity from neutral evidence, e.g. \"Coding/STEM education\", \"SAT/test " +
      'prep", "K-12 tutoring", "Admissions consulting"), "offers_sat_prep" (boolean|null), ' +
      '"official_website" (string|null), "contact_url" (string|null), ' +
      '"city" (string|null), "state" (string|null), "country" (string|null), ' +
      '"category" (string|null = the real category, matching primary_business), ' +
      '"linkedin" (string|null), "instagram" (string|null), "facebook" (string|null), ' +
      '"youtube" (string|null), "marketing_signals" (array of short strings, may be []), ' +
      '"quality_classification" ("strong_fit"|"possible_fit"|"wrong_category"|"duplicate_or_unclear"), ' +
      '"category_confidence" (number 0..1), "location_confidence" (number 0..1), ' +
      '"explanation" (string: cite neutral identity vs SAT-specific evidence), ' +
      '"evidence_source_indexes" (array of Source numbers supporting the overall assessment), ' +
      '"sat_prep_evidence_source_indexes" (array of Source numbers that SPECIFICALLY evidence ' +
      "an SAT/test-prep offering; [] if none). " +
      "CLASSIFICATION RULES: " +
      '"strong_fit" = SAT/test prep is a MEANINGFUL CORE offering (clear SAT-specific evidence ' +
      "and it is central to what they do). " +
      '"possible_fit" = SAT/test prep exists but the business is PRIMARILY another category ' +
      "(SAT is a minor/secondary line). " +
      '"wrong_category" = NO credible SAT/test-prep offering (e.g. coding/STEM, K-12 tutoring ' +
      "only). " +
      '"duplicate_or_unclear" = evidence is insufficient or ambiguous to decide.';
    const userMsg =
      `Lead under review:\n` +
      `  institute_name: ${lead.institute_name || "(unknown)"}\n` +
      `  current website: ${lead.website || "(none)"}\n` +
      `  current category: ${lead.category || "(none)"}\n` +
      `  current location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "(none)"}\n\n` +
      `Search results (Source tags show query provenance — [official]/[identity] are neutral, [sat] is SAT-specific):\n\n${sourcesText || "(no results)"}\n\n` +
      "Return the JSON object now.";

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ENRICH_MODEL,
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!aRes.ok) {
      throw new Error(`Verification failed (Anthropic HTTP ${aRes.status}).`);
    }
    const aData = await aRes.json();
    const raw =
      (aData && aData.content && aData.content[0] && aData.content[0].text) || "";
    const parsed = parseJsonObject(raw) || {};

    // ---- Normalize + ground URLs ------------------------------------------
    let classification = cleanStr(parsed.quality_classification);
    if (!CLASSIFICATIONS.includes(classification)) classification = "duplicate_or_unclear";

    const verified_website = groundUrl(cleanStr(parsed.official_website), sourcesText);
    const contact_url = groundUrl(cleanStr(parsed.contact_url), sourcesText);
    const socials = {
      linkedin: groundUrl(cleanStr(parsed.linkedin), sourcesText),
      instagram: groundUrl(cleanStr(parsed.instagram), sourcesText),
      facebook: groundUrl(cleanStr(parsed.facebook), sourcesText),
      youtube: groundUrl(cleanStr(parsed.youtube), sourcesText),
    };
    const evidence = (Array.isArray(parsed.evidence_source_indexes)
      ? parsed.evidence_source_indexes
      : [])
      .map((i) => urlByIndex.get(Number(i)))
      .filter(Boolean)
      .map((url) => ({ url }));

    // SAT-specific evidence, kept SEPARATE from general supporting evidence.
    // Provenance check: only accept indexes that actually came from the [sat]
    // query, so the model cannot promote neutral identity sources into SAT proof.
    const sat_prep_evidence = (Array.isArray(parsed.sat_prep_evidence_source_indexes)
      ? parsed.sat_prep_evidence_source_indexes
      : [])
      .map((i) => Number(i))
      .filter((i) => satIndexes.has(i))
      .map((i) => urlByIndex.get(i))
      .filter(Boolean)
      .map((url) => ({ url }));

    const primary_business = cleanStr(parsed.primary_business);

    const vCity = cleanStr(parsed.city);
    const vState = cleanStr(parsed.state);
    const vCountry = normalizeCountry(parsed.country); // normalize BEFORE persist/scoring
    const vCategory = cleanStr(parsed.category);

    const enrichment = {
      status: "enriched",
      enriched_at: new Date().toISOString(),
      quality_classification: classification,
      is_real_business:
        typeof parsed.is_real_business === "boolean" ? parsed.is_real_business : null,
      offers_sat_prep:
        typeof parsed.offers_sat_prep === "boolean" ? parsed.offers_sat_prep : null,
      primary_business,
      verified_website,
      contact_page_url: contact_url, // mirror in metadata even though contact_link exists
      location: { city: vCity, state: vState, country: vCountry }, // country normalized
      socials,
      marketing_signals: Array.isArray(parsed.marketing_signals)
        ? parsed.marketing_signals.map(cleanStr).filter(Boolean)
        : [],
      confidence: {
        category:
          typeof parsed.category_confidence === "number" ? parsed.category_confidence : null,
        location:
          typeof parsed.location_confidence === "number" ? parsed.location_confidence : null,
      },
      explanation: cleanStr(parsed.explanation),
      evidence,
      sat_prep_evidence,
      searched_count,
      task_id,
      original: {
        website: lead.website || null,
        category: lead.category || null,
        city: lead.city || null,
        state: lead.state || null,
        country: lead.country || null,
        contact_link: lead.contact_link || null,
      },
    };

    // ---- Column updates (only confidently verified, grounded values) -------
    const fields = {};
    if (verified_website && !lead.website) fields.website = verified_website;
    if (contact_url && !lead.contact_link) fields.contact_link = contact_url;
    if (vCity) fields.city = vCity;
    if (vState) fields.state = vState;
    if (vCountry) fields.country = vCountry;
    if (vCategory) fields.category = vCategory; // includes corrected wrong-category value

    const persisted = await updateLeadFieldsAndMetadata(leadId, fields, { enrichment });
    if (!persisted) {
      throw new Error("Could not persist enrichment to the lead.");
    }

    // ---- Emit enrichment event (reuse existing 'lead_researched') ----------
    await emitEvent("lead_researched", {
      task_id,
      lead_id: leadId,
      agent_id,
      payload: {
        mode: "enrich",
        quality_classification: classification,
        offers_sat_prep: enrichment.offers_sat_prep,
        verified_website,
      },
    });

    // ---- Re-score with the UNCHANGED rubric on corrected fields ------------
    const merged = {
      lead_type: lead.lead_type || "b2b",
      country: normalizeCountry(vCountry || lead.country), // normalized before scoring
      category: vCategory || lead.category,
      estimated_size: lead.estimated_size,
      website: fields.website || lead.website,
      contact_email: lead.contact_email,
      contact_link: fields.contact_link || lead.contact_link,
    };
    const s = scoreLead(merged);

    // wrong_category: keep visible, but force priority Low regardless of score.
    const finalPriority = classification === "wrong_category" ? "Low" : s.priority;

    let assessment_id = null;
    let scored = false;
    const assessment = await recordSalesAssessment({
      lead_id: leadId,
      task_id,
      lead_type: merged.lead_type,
      fit_score: s.fit_score,
      priority: finalPriority,
      rationale:
        `${s.rationale} [enriched: ${classification}` +
        (classification === "wrong_category" ? "; priority forced Low" : "") +
        "]",
      signals: { ...s.signals, quality_classification: classification },
      rubric_version: s.rubric_version,
    });
    if (assessment) {
      assessment_id = assessment;
      const leadUpdated = await updateLeadScore(leadId, s.fit_score, finalPriority);
      if (leadUpdated) {
        scored = true;
        await emitEvent("lead_scored", {
          task_id,
          lead_id: leadId,
          agent_id,
          payload: {
            assessment_id,
            fit_score: s.fit_score,
            priority: finalPriority,
            rubric_version: s.rubric_version,
            via: "enrichment",
          },
        });
      }
    }

    const summary = {
      task_id,
      quality_classification: classification,
      is_real_business: enrichment.is_real_business,
      primary_business,
      offers_sat_prep: enrichment.offers_sat_prep,
      verified_website,
      contact_url,
      location: enrichment.location,
      socials,
      marketing_signals: enrichment.marketing_signals,
      fit_score: s.fit_score,
      priority: finalPriority,
      scored,
      searched_count,
      explanation: enrichment.explanation,
      evidence,
      sat_prep_evidence,
    };

    await markCompleted(task_id, summary, agent_id);
    return { ok: true, task_id, summary };
  } catch (err) {
    const message = err?.message || "Enrichment failed.";
    await markFailed(task_id, message, agent_id);
    return { ok: false, status: 502, task_id, error: message };
  }
}
