// ============================================================================
// lib/leadDiscovery.js
// ----------------------------------------------------------------------------
// Server-only B2B lead discovery for the Sales Agent (Phase 5).
//   - Tavily searches the web for SAT-prep-market institutes.
//   - Claude extracts STRUCTURED candidates from ONLY the provided search
//     content (no invented names / emails / URLs; unknown fields -> null).
//
// Exports:
//   - runLeadDiscovery({ query, location, category, max_results })
//       -> { searched_count, candidates: [normalized candidate, ...] }
//       (throws on hard failures: missing keys, Tavily/Anthropic HTTP errors)
//   - Pure helpers (no network) for the route + unit tests:
//       clampResults, normalizeWebsite, normalizeEmail, normalizeName, isDuplicate
// ============================================================================

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

// Small set used to default country = "USA" when a US state/abbrev is given.
const US_STATES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy",
]);

const ALLOWED_CATEGORIES = ["SAT prep", "Tutoring", "Admissions consulting"];
const ALLOWED_SIZES = ["Small", "Medium", "Large"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Pure helpers ----------------------------------------------------------

export function clampResults(n) {
  let v = Number.parseInt(n, 10);
  if (!Number.isFinite(v)) v = 10;
  return Math.max(1, Math.min(20, v));
}

export function normalizeWebsite(url) {
  if (!url) return null;
  let s = String(url).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s || null;
}

export function normalizeEmail(email) {
  if (!email) return null;
  const s = String(email).trim().toLowerCase();
  return s || null;
}

export function normalizeName(name) {
  if (!name) return null;
  const s = String(name).trim().toLowerCase().replace(/\s+/g, " ");
  return s || null;
}

// keys = { websites:Set, emails:Set, names:Set }
export function isDuplicate(candidate, keys) {
  const w = normalizeWebsite(candidate.website);
  const e = normalizeEmail(candidate.contact_email);
  const n = normalizeName(candidate.institute_name);
  if (w && keys.websites.has(w)) return true;
  if (e && keys.emails.has(e)) return true;
  if (n && keys.names.has(n)) return true;
  return false;
}

// ---- Internal normalization (per-candidate) --------------------------------

function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function validEmailOrNull(v) {
  const s = cleanStr(v);
  if (!s) return null;
  return EMAIL_RE.test(s) ? s.toLowerCase() : null;
}

function validUrlOrNull(v) {
  const s = cleanStr(v);
  if (!s) return null;
  if (/^https?:\/\/\S+\.\S+/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)) return s;
  return null;
}

function looksUS(location) {
  const s = cleanStr(location);
  if (!s) return false;
  const low = s.toLowerCase();
  if (low.includes("usa") || low.includes("united states") || low.includes("u.s")) {
    return true;
  }
  return low
    .split(/[,\/]/)
    .map((p) => p.trim())
    .some((p) => US_STATES.has(p));
}

function normalizeCandidate(item, { location, urlByIndex }) {
  if (!item || typeof item !== "object") return null;

  const institute_name = cleanStr(item.institute_name);
  const website = validUrlOrNull(item.website);
  if (!institute_name && !website) return null;

  const contact_email = validEmailOrNull(item.contact_email);
  const contact_link = validUrlOrNull(item.contact_link);
  const city = cleanStr(item.city);
  const state = cleanStr(item.state);

  let country = cleanStr(item.country);
  if (!country && looksUS(location)) country = "USA";

  let category = cleanStr(item.category);
  if (category && !ALLOWED_CATEGORIES.includes(category)) category = null;

  let estimated_size = cleanStr(item.estimated_size);
  let size_estimated;
  if (
    estimated_size &&
    ALLOWED_SIZES.includes(estimated_size) &&
    item.size_confident === true
  ) {
    size_estimated = false;
  } else {
    estimated_size = "Small";
    size_estimated = true;
  }

  let source_url = null;
  const idx = Number.parseInt(item.source_index, 10);
  if (Number.isFinite(idx) && urlByIndex.has(idx)) {
    source_url = urlByIndex.get(idx);
  }

  return {
    institute_name,
    website,
    contact_email,
    contact_link,
    city,
    state,
    country,
    category,
    estimated_size,
    size_estimated,
    source_url,
  };
}

function parseJsonArray(raw) {
  let text = String(raw || "").trim();
  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- Discovery (Tavily + Claude) -------------------------------------------

export async function runLeadDiscovery({ query, location, category, max_results }) {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) {
    throw new Error("query is required.");
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!tavilyKey || !anthropicKey) {
    throw new Error(
      "Server is missing API keys (TAVILY_API_KEY / ANTHROPIC_API_KEY)."
    );
  }

  const n = clampResults(max_results);
  const searchQuery = [cleanQuery, location, category]
    .map((p) => (p ? String(p).trim() : ""))
    .filter(Boolean)
    .join(" ");

  const tavilyRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyKey}`,
    },
    body: JSON.stringify({
      query: searchQuery,
      topic: "general",
      search_depth: "basic",
      max_results: n,
    }),
  });
  if (!tavilyRes.ok) {
    throw new Error(`Web search failed (Tavily HTTP ${tavilyRes.status}).`);
  }
  const tavilyData = await tavilyRes.json();
  const results = (tavilyData.results || []).map((r, i) => ({
    index: i,
    title: r.title,
    url: r.url,
    content: r.content,
  }));
  const searched_count = results.length;
  if (searched_count === 0) {
    return { searched_count: 0, candidates: [] };
  }

  const urlByIndex = new Map(results.map((r) => [r.index, r.url]));
  const sourcesText = results
    .map((r) => `Source ${r.index}: ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n");

  const system =
    "You extract B2B SAT-prep-market lead candidates from web search results for Wryze.ai. " +
    "Use ONLY the provided search content. Do NOT invent institute names, emails, or URLs. " +
    "If a field is unknown, use null (do not guess). " +
    "Only include real institutes/businesses (SAT prep, tutoring, or admissions consulting). " +
    "Skip news articles, directories, listicles, and aggregators. " +
    "Respond with ONLY a valid JSON array (no markdown, no code fences). " +
    "Each element must have exactly these keys: " +
    '"institute_name" (string|null), "website" (string|null), "contact_email" (string|null), ' +
    '"contact_link" (string|null), "city" (string|null), "state" (string|null), "country" (string|null), ' +
    '"category" ("SAT prep"|"Tutoring"|"Admissions consulting"|null), ' +
    '"estimated_size" ("Small"|"Medium"|"Large"|null), "size_confident" (boolean), ' +
    '"source_index" (number = the Source number it was found in). ' +
    "If there are no real candidates, return [].";
  const userMsg =
    `Search query: ${searchQuery}\n` +
    `Requested category: ${category || "(any)"}\n` +
    `Location: ${location || "(any)"}\n\n` +
    `Search results:\n\n${sourcesText}\n\n` +
    "Return the JSON array now.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Extraction failed (Anthropic HTTP ${res.status}).`);
  }
  const data = await res.json();
  const raw =
    (data && data.content && data.content[0] && data.content[0].text) || "[]";

  const parsed = parseJsonArray(raw);
  const candidates = [];
  for (const item of parsed) {
    const c = normalizeCandidate(item, { location, urlByIndex });
    if (c) candidates.push(c);
  }

  return { searched_count, candidates };
}
