"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/FounderNotesPanel.jsx
// ----------------------------------------------------------------------------
// Phase 18B: founder notes on a lead. Founder-facing only. Append a note via a
// textarea + Save button → POST /sales-pipeline/api/leads/:id/notes. Existing
// notes are shown newest first. On success the page reloads so both the notes
// list and the Activity timeline reflect the new note. NOTES WRITE ONLY — no
// sending, no automation. Inline styles, no dependencies.
// ============================================================================

import { useState } from "react";

const MAX_LEN = 2000;

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function FounderNotesPanel({ leadId, initialNotes }) {
  const notes = Array.isArray(initialNotes) ? initialNotes : [];
  // Newest first for display (storage is append-only / chronological).
  const ordered = [...notes].sort(
    (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))
  );

  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const trimmedLen = body.trim().length;
  const canSave = trimmedLen > 0 && trimmedLen <= MAX_LEN && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/sales-pipeline/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not save the note.");
        setSaving(false);
        return;
      }
      // Reload so the notes list AND the activity timeline both update.
      window.location.reload();
    } catch (e) {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    background: "#fff",
  };
  const title = { fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 12px" };

  return (
    <section style={card}>
      <h2 style={title}>Founder notes</h2>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add context, next thoughts, objections, sales observations…"
        rows={4}
        maxLength={MAX_LEN}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #d1d5db",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid " + (canSave ? "#2563eb" : "#d1d5db"),
            background: canSave ? "#2563eb" : "#f3f4f6",
            color: canSave ? "#fff" : "#9ca3af",
            fontSize: 14,
            fontWeight: 600,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : "Save note"}
        </button>
        <span style={{ fontSize: 12, color: trimmedLen > MAX_LEN ? "#dc2626" : "#9ca3af" }}>
          {trimmedLen}/{MAX_LEN}
        </span>
        {error ? (
          <span role="alert" style={{ fontSize: 13, color: "#b91c1c" }}>
            {error}
          </span>
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        {ordered.length === 0 ? (
          <p style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic" }}>
            No notes yet. Add the first one above.
          </p>
        ) : (
          ordered.map((n, i) => (
            <div
              key={n.id || i}
              style={{
                border: "1px solid #eef2f7",
                borderRadius: 10,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                {fmt(n.created_at)}
              </div>
              <div style={{ fontSize: 14, color: "#111827", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {n.body}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
