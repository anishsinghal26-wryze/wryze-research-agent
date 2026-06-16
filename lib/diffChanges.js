// Compares the previous saved text of a page to the current text and decides
// whether anything MEANINGFUL changed. We split text into sentence-like chunks
// and look at which chunks are newly added or removed. A tiny change (one word,
// a timestamp) is ignored; a real content change is reported.

function collapse(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function splitChunks(text) {
  // Split on sentence endings. Keep chunks that are long enough to matter.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function detectChanges(previousText, currentText) {
  const prev = collapse(previousText);
  const curr = collapse(currentText);

  // First time we have ever seen this page: just save a baseline, no "change".
  if (!prev) {
    return { firstRun: true, meaningful: false, addedText: "", addedCount: 0, removedCount: 0 };
  }

  // Identical (ignoring case/whitespace): nothing changed.
  if (prev.toLowerCase() === curr.toLowerCase()) {
    return { meaningful: false, addedText: "", addedCount: 0, removedCount: 0 };
  }

  const prevChunks = splitChunks(prev);
  const currChunks = splitChunks(curr);
  const prevKeys = new Set(prevChunks.map((c) => c.toLowerCase()));
  const currKeys = new Set(currChunks.map((c) => c.toLowerCase()));

  // Only count reasonably long chunks so we ignore tiny noise.
  const added = currChunks.filter((c) => c.length > 30 && !prevKeys.has(c.toLowerCase()));
  const removed = prevChunks.filter((c) => c.length > 30 && !currKeys.has(c.toLowerCase()));

  // "Meaningful" = at least 2 added/removed chunks. Tune this number if needed.
  const meaningful = added.length + removed.length >= 2;

  return {
    meaningful,
    addedText: added.join(" ").slice(0, 4000),
    removedText: removed.join(" ").slice(0, 2000),
    addedCount: added.length,
    removedCount: removed.length,
  };
}
