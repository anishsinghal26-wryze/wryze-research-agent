"use client";

// ============================================================================
// app/sales-pipeline/DiscoverPanel.jsx
// ----------------------------------------------------------------------------
// Phase 8: collapsible "Discover Real Leads" panel for the Sales Pipeline
// dashboard. A logged-in founder enters a query (+ optional location/category/
// max results) and runs the Sales Lead Discovery Agent via the cookie-gated
// POST /sales-pipeline/api/discover. The browser NEVER sees AGENT_RUN_SECRET.
//
// Read-only to the page: it does not mutate dashboard state. On success it
// shows a summary and a "Refresh dashboard" button (no auto-refresh, no
// auto-run). Inline styles, consistent with the rest of the dashboard.
// ============================================================================

import { useState } from "react";

const DEFAULT_MAX = 5;
const HARD_CAP = 10;

export default function DiscoverPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [maxResults, setMaxResults] = useState(DEFAULT_MAX);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { task_id, summary }

  function clampMax(n) {
    let v = Number.parseInt(n, 10);
    if (!Number.isFinite(v)) v = DEFAULT_MAX;
    return Math.max(1, Math.min(HARD_CAP, v));
  }

  async function runDiscovery() {
    const q = query.trim();
    if (!q) {
      setError("Please enter a search query.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/sales-pipeline/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          location: location.trim() || null,
          category: category.trim() || null,
          max_results: clampMax(maxResults),
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setError(
          data.error || `Discovery failed (HTTP ${res.status}). Please try again.`
        );
        return;
      }
      setResult({ task_id: data.task_id, summary: data.summary || {} });
    } catch {
      setError("Network error while running discovery. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ---- styles --------------------------------------------------------------
  const wrap = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    marginBottom: 20,
    overflow: "hidden",
  };
  const headerRow = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    cursor: "pointer",
    background: "#f8fafc",
    userSelect: "none",
  };
  const label = {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    margin: "0 0 4px",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    padding: "8px 10px",
  };
  const btn = (bg, disabled) => ({
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    backgroundColor: disabled ? "#9ca3af" : bg,
    cursor: disabled ? "default" : "pointer",
  });
  const stat = (val, text) => (
    <div style={{ flex: "1 1 110px", border: "1px solid #eef2f7", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{val}</div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3 }}>{text}</div>
    </div>
  );

  return (
    <section style={wrap}>
      <div style={headerRow} onClick={() => setOpen((o) => !o)}>
        <div>
          <strong style={{ fontSize: 15 }}>Discover Real Leads</strong>
          <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>
            Run the Sales Discovery Agent to add real SAT-prep institutes.
          </span>
        </div>
        <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 600 }}>
          {open ? "Hide ▲" : "Open ▼"}
        </span>
      </div>

      {open && (
        <div style={{ padding: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={label}>Search query *</div>
              <input
                style={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. SAT prep coaching institutes"
                disabled={busy}
              />
            </div>
            <div>
              <div style={label}>Location</div>
              <input
                style={input}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Mumbai, India"
                disabled={busy}
              />
            </div>
            <div>
              <div style={label}>Category</div>
              <input
                style={input}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. SAT prep"
                disabled={busy}
              />
            </div>
            <div>
              <div style={label}>Max results (1–{HARD_CAP})</div>
              <input
                style={input}
                type="number"
                min={1}
                max={HARD_CAP}
                value={maxResults}
                onChange={(e) => setMaxResults(e.target.value)}
                onBlur={() => setMaxResults(clampMax(maxResults))}
                disabled={busy}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button style={btn("#2563eb", busy)} disabled={busy} onClick={runDiscovery}>
              {busy ? "Discovering… (~30–60s)" : "Run Discovery"}
            </button>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              Nothing is sent. Discovery only adds & scores leads.
            </span>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 12,
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
                marginTop: 12,
                padding: 14,
                borderRadius: 10,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#166534", marginBottom: 10 }}>
                Discovery complete
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {stat(result.summary.searched_count ?? 0, "Searched")}
                {stat(result.summary.inserted_count ?? 0, "Inserted (new)")}
                {stat(result.summary.skipped_duplicate_count ?? 0, "Skipped dup")}
                {stat(result.summary.scored_count ?? 0, "Scored")}
                {stat((result.summary.failures || []).length, "Failures")}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, wordBreak: "break-word" }}>
                Task: {result.task_id}
              </div>

              {(result.summary.failures || []).length > 0 && (
                <details style={{ marginBottom: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "#b45309" }}>
                    {(result.summary.failures || []).length} per-lead failure(s)
                  </summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#6b7280" }}>
                    {(result.summary.failures || []).map((f, i) => (
                      <li key={i}>
                        {f.institute_name || "(unknown)"} — {f.stage}: {f.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <button style={btn("#16a34a", false)} onClick={() => window.location.reload()}>
                Refresh dashboard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
