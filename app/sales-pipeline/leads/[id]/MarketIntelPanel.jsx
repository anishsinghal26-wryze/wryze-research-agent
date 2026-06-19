"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/MarketIntelPanel.jsx
// ----------------------------------------------------------------------------
// Phase 9: per-lead "Analyze market signals" control on the Lead Detail page.
// Calls the cookie-gated POST /sales-pipeline/api/market-intel. On success it
// shows a short result + a "Refresh" button to render the persisted analysis.
// No auto-run (founder clicks), no sending, single lead. Inline styles.
// ============================================================================

import { useState } from "react";

const STAGE_COLORS = {
  high: "#16a34a",
  medium: "#d97706",
  low: "#6b7280",
  unknown: "#94a3b8",
};

export default function MarketIntelPanel({ leadId, alreadyAnalyzed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/sales-pipeline/api/market-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setError(data.error || `Market analysis failed (HTTP ${res.status}).`);
        return;
      }
      const summary = data.summary || {};
      setResult({ ...summary, task_id: data.task_id || summary.task_id || null });
    } catch {
      setError("Network error while analyzing. Please try again.");
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
    backgroundColor: busy ? "#9ca3af" : "#0ea5e9",
    cursor: busy ? "default" : "pointer",
  };
  const refreshBtn = { ...btn, backgroundColor: "#16a34a", marginTop: 10 };
  const label = {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={btn} disabled={busy} onClick={run}>
          {busy
            ? "Analyzing… (~20–40s)"
            : alreadyAnalyzed
            ? "Re-analyze market signals"
            : "Analyze market signals"}
        </button>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          Public web signals only. Nothing is sent.
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
                backgroundColor: STAGE_COLORS[result.acquisition_stage] || "#94a3b8",
              }}
            >
              acquisition: {result.acquisition_stage}
            </span>
            <span style={{ fontSize: 13, color: "#374151" }}>
              score {result.acquisition_score ?? "—"} · Meta ads:{" "}
              {String(result.meta_ads_active)}
            </span>
          </div>

          {result.recommended_outreach_angle && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              <strong>Outreach angle:</strong> {result.recommended_outreach_angle}
            </p>
          )}

          {result.social_activity_summary && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              {result.social_activity_summary}
            </p>
          )}

          {Array.isArray(result.ad_platforms_seen) && result.ad_platforms_seen.length > 0 && (
            <p style={{ fontSize: 13, color: "#374151", margin: "8px 0 0" }}>
              <strong>Ad platforms:</strong> {result.ad_platforms_seen.join(", ")}
            </p>
          )}

          {result.ad_library_url && (
            <p style={{ fontSize: 12, margin: "8px 0 0" }}>
              <a href={result.ad_library_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                Open Meta Ad Library search ↗
              </a>
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
