"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/EnrichPanel.jsx
// ----------------------------------------------------------------------------
// Phase 8b: per-lead "Verify & Enrich" control on the Lead Detail page. Calls
// the cookie-gated POST /sales-pipeline/api/enrich. On success it shows a short
// result + a "Refresh" button (reload to render the persisted enrichment). No
// auto-run (founder clicks), no sending. Inline styles, no dependencies.
// ============================================================================

import { useState } from "react";

const CLASS_COLORS = {
  strong_fit: "#16a34a",
  possible_fit: "#d97706",
  wrong_category: "#dc2626",
  duplicate_or_unclear: "#6b7280",
};

export default function EnrichPanel({ leadId, alreadyEnriched }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/sales-pipeline/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setError(data.error || `Enrichment failed (HTTP ${res.status}).`);
        return;
      }
      setResult(data.summary || {});
    } catch {
      setError("Network error while enriching. Please try again.");
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
    backgroundColor: busy ? "#9ca3af" : "#7c3aed",
    cursor: busy ? "default" : "pointer",
  };
  const refreshBtn = { ...btn, backgroundColor: "#16a34a", marginTop: 10 };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={btn} disabled={busy} onClick={run}>
          {busy
            ? "Verifying… (~20–40s)"
            : alreadyEnriched
            ? "Re-verify & enrich"
            : "Verify & Enrich"}
        </button>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          Public web check only. Nothing is sent.
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                backgroundColor: CLASS_COLORS[result.quality_classification] || "#6b7280",
              }}
            >
              {result.quality_classification}
            </span>
            <span style={{ fontSize: 13, color: "#374151" }}>
              SAT prep: {String(result.offers_sat_prep)} · fit {result.fit_score} · {result.priority}
            </span>
          </div>
          {result.explanation && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              {result.explanation}
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
