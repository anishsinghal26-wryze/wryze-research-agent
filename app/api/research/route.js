// Server-side only. This code runs on the server, never in the browser,
// so your API keys stay secret.

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const topic = (body.topic || "").trim();

    if (!topic) {
      return Response.json({ error: "Please enter a topic." }, { status: 400 });
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!tavilyKey || !anthropicKey) {
      return Response.json(
        {
          error:
            "The server is missing API keys. Check your environment variables.",
        },
        { status: 500 }
      );
    }

    // ---- Step 1: search the web with Tavily ----
    // Auth is sent as a Bearer token in the Authorization header (Tavily's
    // current documented standard). The key is NOT placed in the body.
    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tavilyKey}`,
      },
      body: JSON.stringify({
        query: `SAT exam: ${topic}`,
        topic: "general",
        search_depth: "basic",
        max_results: 5,
      }),
    });

    if (!tavilyRes.ok) {
      return Response.json(
        { error: "Web search failed. Check your Tavily API key or try again." },
        { status: 502 }
      );
    }

    const tavilyData = await tavilyRes.json();
    const results = (tavilyData.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));

    if (results.length === 0) {
      return Response.json(
        { error: "No search results found. Try rephrasing the topic." },
        { status: 404 }
      );
    }

    // Build a compact text block so the payload to Claude stays small.
    const sourcesText = results
      .map(
        (r, i) =>
          `Source ${i + 1}: ${r.title}\nURL: ${r.url}\n${r.content}`
      )
      .join("\n\n");

    // ---- Step 2: summarize with Claude (Anthropic Messages API) ----
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // === MODEL NAME — change here if Anthropic updates model names ===
        // claude-haiku-4-5-20251001 is the lightweight model (Claude Haiku 4.5).
        // The short alias "claude-haiku-4-5" also works.
        model: "claude-haiku-4-5-20251001",
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
            content: `Topic: ${topic}\n\nSearch results:\n\n${sourcesText}\n\nWrite the concise summary now.`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      return Response.json(
        { error: "Summary failed. Check your Anthropic API key or try again." },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicRes.json();
    const summary =
      anthropicData.content &&
      anthropicData.content[0] &&
      anthropicData.content[0].text
        ? anthropicData.content[0].text
        : "No summary was generated.";

    return Response.json({ summary, sources: results });
  } catch (err) {
    return Response.json(
      { error: "Something went wrong on the server. Please try again." },
      { status: 500 }
    );
  }
}
