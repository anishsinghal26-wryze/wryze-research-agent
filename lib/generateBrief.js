// Calls Claude to turn detected SAT changes into a short, strategic founder
// brief for Wryze.ai. We ask for JSON so the UI can show clean sections.
// This runs ONLY when meaningful changes are found, so cost stays low.

export async function generateBrief(changedSources) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing.");
  }

  // Build a compact description of what changed across all sources.
  const input = changedSources
    .map(
      (s, i) =>
        `Source ${i + 1}: ${s.name}\nURL: ${s.url}\nNEW OR CHANGED CONTENT:\n${
          s.addedText || "(the page content changed)"
        }`
    )
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // === MODEL NAME — change here if Anthropic updates model names ===
      // Sonnet gives stronger strategic reasoning for the brief. It only runs
      // when changes are detected. Swap to "claude-haiku-4-5" to save cost.
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system:
        "You are the research analyst for Wryze.ai, an SAT prep product. " +
        "You receive new or changed content from official SAT sources. " +
        "Write a sharp, founder-facing intelligence brief — NOT a generic summary. " +
        "Be specific and decision-oriented. " +
        "Respond with ONLY a valid JSON object (no markdown, no code fences) using exactly these keys: " +
        '"headline" (one punchy sentence), ' +
        '"what_changed" (2-3 sentences on the concrete change), ' +
        '"why_it_matters" (why it is significant for the SAT market), ' +
        '"who_it_affects" (which students/parents, and when), ' +
        '"wryze_content_idea" (one concrete post/reel/poster idea Wryze should publish), ' +
        '"wryze_product_idea" (one product or feature opportunity this creates), ' +
        '"confidence_notes" (how confident you are and any caveats about the sources). ' +
        "Keep each value concise. Do not invent facts beyond the provided content.",
      messages: [
        {
          role: "user",
          content: `Here is the new/changed SAT content detected today:\n\n${input}\n\nWrite the JSON brief now.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw =
    data.content && data.content[0] && data.content[0].text
      ? data.content[0].text
      : "";

  return parseBrief(raw);
}

function parseBrief(raw) {
  // Strip accidental code fences, then try to parse JSON.
  let text = raw.trim();
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    // If Claude didn't return clean JSON, keep the raw text so nothing is lost.
    return {
      headline: "SAT update detected",
      what_changed: raw || "A change was detected but could not be formatted.",
      why_it_matters: "",
      who_it_affects: "",
      wryze_content_idea: "",
      wryze_product_idea: "",
      confidence_notes: "Auto-formatting failed; showing raw model output.",
    };
  }
}
