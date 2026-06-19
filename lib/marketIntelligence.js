// ============================================================================
// lib/marketIntelligence.js
// ----------------------------------------------------------------------------
// Phase 9: READ-ONLY per-lead Market Intelligence for sales_discovery leads.
//
// analyzeMarketIntelligence({ leadId }) loads one lead, runs a PUBLIC web pass
// (Tavily: social presence / marketing themes / paid-ad signals) + Claude
// structured analysis, and stores the result under
// leads.metadata.market_intelligence (shallow-merged; enrichment is preserved).
// It re-uses the existing agent_tasks lifecycle (agent_type "sales",
// input.mode "market_intel") so no new agents row / event-enum / migration is
// needed.
//
// HARD CONSTRAINTS: public web URLs only; NEVER scrape login-gated/private data
// (Meta Ads Library, Instagram, etc. are only LINKED, never scraped); social /
// evidence URLs are grounded against the search results (never invented); NEVER
// claims exact ad spend or ad counts unless a public source states it; never
// sends, never drafts, never approves. Does NOT mutate unrelated lead fields and
// does NOT change scoring. Server-only (service-role).
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

const MI_MODEL = "claude-haiku-4-5-20251001";

const STAGES = ["low", "medium", "high", "unknown"];

// ---- small pure helpers ----------------------------------------------------
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Keep a URL only if its host actually appears somewhere in the search content,
// so Claude cannot invent socials / sources.
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

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
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

// Deterministic PUBLIC Meta Ad Library *search* link (not scraped). Lets the
// founder click through to verify ads themselves.
function metaAdLibraryUrl(name) {
  const q = encodeURIComponent(name || "");
  return (
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all" +
    `&country=ALL&q=${q}&search_type=keyword_unordered&media_type=all`
  );
}

// One public web search (Tavily). Returns the raw results array (may be []).
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
export async function analyzeMarketIntelligence({ leadId }) {
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

  // ---- Task lifecycle (reuse sales agent, mode=market_intel) ---------------
  const task = await createTask({
    agent_type: "sales",
    input: { mode: "market_intel", lead_id: leadId, triggered_by: "founder_ui" },
    lead_id: leadId,
  });
  if (!task || !task.task_id) {
    return {
      ok: false,
      status: 502,
      error: "Could not create the market-intel task (shared memory unavailable).",
    };
  }
  const task_id = task.task_id;
  const agent_id = task.agent_id;
  await markRunning(task_id, agent_id);

  try {
    // ---- Public web pass (Tavily): social / marketing / paid-ads ----------
    const loc = [lead.city, lead.state]
      .filter(Boolean)
      .map((p) => String(p).trim())
      .join(" ");
    const name = lead.institute_name ? String(lead.institute_name).trim() : "";
    const queries = [
      { type: "social", q: [name, loc, "Facebook Instagram LinkedIn YouTube"].filter(Boolean).join(" ") },
      { type: "marketing", q: [name, loc, "marketing advertising campaign"].filter(Boolean).join(" ") },
      { type: "ads", q: [name, "Facebook ads Google ads paid advertising"].filter(Boolean).join(" ") },
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
      "You are a B2B market-intelligence analyst for Wryze.ai (a SAT-prep company " +
      "selling to SAT/test-prep institutes). Analyze the PUBLIC marketing and " +
      "customer-acquisition signals of the lead using ONLY the provided search " +
      "content. Do NOT invent URLs, names, or facts; if unknown, use null. Capture " +
      "social URLs ONLY if they appear in the provided content. CRITICAL: do NOT " +
      "claim exact ad spend or an exact active-ad count unless a provided source " +
      "explicitly states a number — otherwise set active_ad_count_estimate to null. " +
      "Respond with ONLY a valid JSON object (no markdown/code fences) with EXACTLY " +
      "these keys: " +
      '"meta_ads_active" (boolean|null — true only if there is public evidence they ' +
      "run Meta/Facebook/Instagram ads), " +
      '"active_ad_count_estimate" (number|null — ONLY if a source states a count), ' +
      '"ad_platforms_seen" (array of short strings, e.g. ["Meta/Facebook","Google","YouTube"], may be []), ' +
      '"ad_themes" (array of short strings describing marketing themes/angles, may be []), ' +
      '"facebook_url" (string|null), "instagram_url" (string|null), ' +
      '"youtube_url" (string|null), "linkedin_url" (string|null), "x_url" (string|null), ' +
      '"social_activity_summary" (string: how active/sophisticated their public social presence looks), ' +
      '"acquisition_score" (number 0..100: how sophisticated their customer acquisition appears), ' +
      '"acquisition_stage" ("low"|"medium"|"high"|"unknown"), ' +
      '"recommended_outreach_angle" (string: the single best angle Wryze should use to reach them), ' +
      '"confidence" (number 0..1), ' +
      '"explanation" (string: cite which signals drove the assessment), ' +
      '"evidence_source_indexes" (array of Source numbers you relied on). ' +
      "Use acquisition_stage=unknown when evidence is too thin to judge.";
    const userMsg =
      `Lead under analysis:\n` +
      `  institute_name: ${lead.institute_name || "(unknown)"}\n` +
      `  website: ${lead.website || "(none)"}\n` +
      `  category: ${lead.category || "(none)"}\n` +
      `  location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "(none)"}\n\n` +
      `Public search results (Source tags show query provenance: [social]/[marketing]/[ads]):\n\n${sourcesText || "(no results)"}\n\n` +
      "Return the JSON object now.";

    const aRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MI_MODEL,
        max_tokens: 1200,
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
    let acquisition_stage = cleanStr(parsed.acquisition_stage);
    if (!STAGES.includes(acquisition_stage)) acquisition_stage = "unknown";

    const evidence_urls = (Array.isArray(parsed.evidence_source_indexes)
      ? parsed.evidence_source_indexes
      : [])
      .map((i) => urlByIndex.get(Number(i)))
      .filter(Boolean)
      .map((url) => ({ url }));

    const platforms = Array.isArray(parsed.ad_platforms_seen)
      ? parsed.ad_platforms_seen.map(cleanStr).filter(Boolean)
      : [];
    const themes = Array.isArray(parsed.ad_themes)
      ? parsed.ad_themes.map(cleanStr).filter(Boolean)
      : [];

    const created_at = new Date().toISOString();
    const market_intelligence = {
      status: "analyzed",
      created_at,
      meta_ads_active:
        typeof parsed.meta_ads_active === "boolean" ? parsed.meta_ads_active : null,
      active_ad_count_estimate:
        typeof parsed.active_ad_count_estimate === "number"
          ? parsed.active_ad_count_estimate
          : null, // null unless a public source stated a number
      ad_platforms_seen: platforms,
      ad_themes: themes,
      ad_library_url: metaAdLibraryUrl(name), // public search link (not scraped)
      facebook_url: groundUrl(cleanStr(parsed.facebook_url), sourcesText),
      instagram_url: groundUrl(cleanStr(parsed.instagram_url), sourcesText),
      youtube_url: groundUrl(cleanStr(parsed.youtube_url), sourcesText),
      linkedin_url: groundUrl(cleanStr(parsed.linkedin_url), sourcesText),
      x_url: groundUrl(cleanStr(parsed.x_url), sourcesText),
      social_activity_summary: cleanStr(parsed.social_activity_summary),
      acquisition_score: clampScore(parsed.acquisition_score),
      acquisition_stage,
      recommended_outreach_angle: cleanStr(parsed.recommended_outreach_angle),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      evidence_urls,
      explanation: cleanStr(parsed.explanation),
      searched_count,
      task_id,
    };

    // ---- Persist (metadata only; no column changes, no scoring) -----------
    const persisted = await updateLeadFieldsAndMetadata(leadId, {}, { market_intelligence });
    if (!persisted) {
      throw new Error("Could not persist market intelligence to the lead.");
    }

    const summary = { task_id, ...market_intelligence };
    await markCompleted(task_id, summary, agent_id);
    return { ok: true, task_id, summary };
  } catch (err) {
    const message = err?.message || "Market intelligence failed.";
    await markFailed(task_id, message, agent_id);
    return { ok: false, status: 502, task_id, error: message };
  }
}
