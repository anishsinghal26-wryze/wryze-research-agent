// Fetches a web page and extracts the main visible text.
// We strip out scripts, styles, and HTML tags, then collapse whitespace.
// This is intentionally simple. Some pages are built with JavaScript and may
// return little text — runMonitor handles that case gracefully.

export async function fetchSourceText(url) {
  const res = await fetch(url, {
    // A normal-looking User-Agent avoids being blocked by some sites.
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WryzeResearchAgent/1.0; +https://wryze.ai)",
    },
    // Always get the freshest copy.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  return extractText(html);
}

function extractText(html) {
  let text = html;

  // Remove the parts that are not visible reading content.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Remove all remaining HTML tags.
  text = text.replace(/<[^>]+>/g, " ");

  // Turn common HTML entities back into normal characters.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

  // Collapse all whitespace to single spaces.
  text = text.replace(/\s+/g, " ").trim();

  return text;
}
