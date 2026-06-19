"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/ContactIntelPanel.jsx
// ----------------------------------------------------------------------------
// Phase 10: per-lead "Research contacts" control on the Lead Detail page.
// Calls the cookie-gated POST /sales-pipeline/api/contact-intel. On success it
// shows a short result + a "Refresh" button to render the persisted analysis.
// No auto-run (founder clicks), no sending, single lead. Inline styles.
// ============================================================================

import { useState } from "react";

export default function ContactIntelPanel({ leadId, alreadyResearched }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/sales-pipeline/api/contact-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setError(data.error || `Contact research failed (HTTP ${res.status}).`);
        return;
      }
      const summary = data.summary || {};
      setResult({ ...summary, task_id: data.task_id || summary.task_id || null });
    } catch {
      setError("Network error while researching. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const btn = {
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    backgroundColor: busy ? "#9ca3af" : "#0d9488",
    cursor: busy ? "default" : "pointer",
  };
  const refreshBtn = { ...btn, backgroundColor: "#16a34a", marginTop: 10 };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={btn} disabled={busy} onClick={run}>
          {busy
            ? "Researching… (~20–40s)"
            : alreadyResearched
            ? "Re-research contacts"
            : "Research contacts"}
        </button>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          Public web only. Nothing is sent.
        </span>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 13, color: "#374151" }}>
            {result.contacts_found_count ?? 0} named contact
            {result.contacts_found_count === 1 ? "" : "s"} found · decision-maker
            confidence {result.decision_maker_confidence ?? "—"}
          </div>

          {result.recommended_primary_contact && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              <strong>Primary contact:</strong> {result.recommended_primary_contact}
            </p>
          )}

          {result.recommended_next_step && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              <strong>Next step:</strong> {result.recommended_next_step}
            </p>
          )}

          {result.task_id && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "8px 0 0" }}>
              Task ID: <code>{result.task_id}</code>
            </p>
          )}

          <button style={refreshBtn} onClick={() => window.location.reload()}>
            Refresh to see full details
          </button>
        </div>
      )}
    </div>
  );
}
