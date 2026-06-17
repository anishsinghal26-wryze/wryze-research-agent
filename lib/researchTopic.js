// ============================================================================
// lib/researchTopic.js
// ----------------------------------------------------------------------------
// Reusable, server-only topic research: Tavily web search + Claude summary.
// This mirrors the logic in app/api/research/route.js (which is intentionally
// left UNCHANGED so the homepage keeps working exactly as before).
//
// Returns { summary, sources }. Throws an Error with a clear, non-secret
// message on failure so callers can mark a task failed and surface the reason.
// Never logs or returns API keys.
// ============================================================================

const RESEARCH_MODEL = "claude-haiku-4-5-20251001";

export async function runTopicResearch(topic) {
  const cleanTopic = (topic || "").trim();
  if (!cleanTopic) {
    throw new Error("Please provide a topic.");
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!tavilyKey || !anthropicKey) {
    throw new Error(
      "Server is missing API keys (TAVILY_API_KEY / ANTHROPIC_API_KEY)."
    );
  }

  const tavilyRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tavilyKey}`,
    },
    body: JSON.stringify({
      query: `SAT exam: ${cleanTopic}`,
      topic: "general",
      search_depth: "basic",
      max_results: 5,
    }),
  });

  if (!tavilyRes.ok) {
    throw new Error(`Web search failed (Tavily HTTP ${tavilyRes.status}).`);
  }

  const tavilyData = await tavilyRes.json();
  const sources = (tavilyData.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
  }));

  if (sources.length === 0) {
    throw new Error("No search results found. Try rephrasing the topic.");
  }

  const sourcesText = sources
    .map((r, i) => `Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n");

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      max_tokens: 600,
      system:
        "You are a research assistant for an SAT prep product called Wryze.ai. " +
        "Summarize the provided web search results into a concise, plain-English briefing " +
        "for the founder. Focus on what matters to SAT students and parents. " +
        "Keep it under 200 words. Use short paragraphs or a few bullet points. " +
        "Only use information from the sources; do not invent facts.",
      messages: [
        {
          role: "user",
          content: `Topic: ${cleanTopic}\n\nSearch results:\n\n${sourcesText}\n\nWrite the concise summary now.`,
        },
      ],
    }),
  });

  if (!anthropicRes.ok) {
    throw new Error(`Summary failed (Anthropic HTTP ${anthropicRes.status}).`);
  }

  const anthropicData = await anthropicRes.json();
  const summary =
    (anthropicData &&
      anthropicData.content &&
      anthropicData.content[0] &&
      anthropicData.content[0].text) ||
    "No summary was generated.";

  return { summary, sources };
}
