// ============================================================================
// lib/outreachDraft.js
// ----------------------------------------------------------------------------
// Server-only outreach DRAFT generation for the Outreach Agent (Phase 6a).
// Generates a personalized, DRAFT-ONLY outreach message for a lead, grounded
// in the knowledge base (positioning / approved messaging / guardrails).
//
// IMPORTANT: this NEVER sends anything. It only produces text for a human to
// review in the approval queue.
//
// Exports:
//   - runOutreachDraft({ lead, kbDocs, channel })
//       -> { subject, body, risk_level, rationale }   (throws on hard failure)
//   - Pure validators (no network) for the route + unit tests:
//       validateChannel(channel)      -> a valid outreach_channel ('email' default)
//       validateRiskLevel(riskLevel)  -> a valid risk_level ('medium' default)
// ============================================================================

const DRAFT_MODEL = "claude-haiku-4-5-20251001";

const VALID_CHANNELS = ["email", "linkedin", "sms", "whatsapp", "other"];
const VALID_RISK_LEVELS = ["low", "medium", "high", "critical", "blocked"];

// ---- Pure validators -------------------------------------------------------

// Default to "email"; allow any other valid outreach_channel.
export function validateChannel(channel) {
  if (typeof channel !== "string") return "email";
  const c = channel.trim().toLowerCase();
  return VALID_CHANNELS.includes(c) ? c : "email";
}

// Default to "medium" when missing/invalid (every draft is queued anyway).
export function validateRiskLevel(riskLevel) {
  if (typeof riskLevel !== "string") return "medium";
  const r = riskLevel.trim().toLowerCase();
  return VALID_RISK_LEVELS.includes(r) ? r : "medium";
}

// ---- Internal helpers ------------------------------------------------------

function parseJsonObject(raw) {
  let text = String(raw || "").trim();
  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function kbBlock(kbDocs, slug) {
  const v = kbDocs && kbDocs[slug];
  return v ? String(v) : "(not available)";
}

// ---- Draft generation (Claude) ---------------------------------------------

export async function runOutreachDraft({ lead, kbDocs, channel }) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("Server is missing API key (ANTHROPIC_API_KEY).");
  }
  const ch = validateChannel(channel);

  const leadSummary = [
    `Institute: ${lead.institute_name || "(unknown)"}`,
    lead.contact_person ? `Contact person: ${lead.contact_person}` : null,
    lead.category ? `Category: ${lead.category}` : null,
    lead.estimated_size ? `Size: ${lead.estimated_size}` : null,
    [lead.city, lead.state, lead.country].filter(Boolean).length
      ? `Location: ${[lead.city, lead.state, lead.country].filter(Boolean).join(", ")}`
      : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    "You are the Outreach Agent for Wryze.ai, an SAT-prep product. " +
    "You write a SHORT, personalized, DRAFT-ONLY outreach message to a B2B lead " +
    "(an SAT prep / tutoring / admissions-consulting institute). " +
    "This message is a DRAFT for a human to review and is NEVER sent automatically. " +
    "Follow the approved messaging and guardrails exactly. Do NOT fabricate facts, " +
    "do NOT guarantee score increases, do NOT imply official College Board endorsement, " +
    "and do NOT claim the message has been or will be sent. " +
    "Keep the body under ~150 words, warm and specific to the institute.\n\n" +
    "=== WRYZE POSITIONING ===\n" +
    kbBlock(kbDocs, "wryze-positioning") +
    "\n\n=== APPROVED MESSAGING ===\n" +
    kbBlock(kbDocs, "approved-messaging") +
    "\n\n=== GUARDRAIL RULES ===\n" +
    kbBlock(kbDocs, "guardrail-rules") +
    "\n\n" +
    "Respond with ONLY a valid JSON object (no markdown, no code fences) with keys: " +
    '"subject" (string; short subject line; for non-email channels use a short opener), ' +
    '"body" (string; the draft message), ' +
    '"risk_level" ("low"|"medium"|"high"|"critical"|"blocked"; how risky this draft is ' +
    "to send to a real prospect — higher if it makes strong claims or could violate " +
    'guardrails), "rationale" (string; one sentence on the risk and approach).';

  const userMsg =
    `Channel: ${ch}\n\nLead details:\n${leadSummary}\n\n` +
    "Write the JSON draft now.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DRAFT_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Draft generation failed (Anthropic HTTP ${res.status}).`);
  }
  const data = await res.json();
  const raw =
    (data && data.content && data.content[0] && data.content[0].text) || "";

  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Draft generation returned unparseable output.");
  }

  const subject =
    typeof parsed.subject === "string" && parsed.subject.trim()
      ? parsed.subject.trim()
      : "Outreach draft";
  const body =
    typeof parsed.body === "string" && parsed.body.trim()
      ? parsed.body.trim()
      : "";
  if (!body) {
    throw new Error("Draft generation produced an empty body.");
  }
  const risk_level = validateRiskLevel(parsed.risk_level);
  const rationale =
    typeof parsed.rationale === "string" ? parsed.rationale.trim() : null;

  return { subject, body, risk_level, rationale };
}
