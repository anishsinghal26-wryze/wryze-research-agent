"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/OutreachDraftPanel.jsx
// ----------------------------------------------------------------------------
// Phase 11: per-lead "Generate outreach draft" control on the Lead Detail page.
// Calls the cookie-gated POST /sales-pipeline/api/outreach-draft. On success it
// shows the draft + a link to the Approvals queue. The draft is DRAFT-ONLY and
// queued as a PENDING approval — nothing is sent and nothing is auto-approved.
// Founder clicks to generate; inline styles.
// ============================================================================

import { useState } from "react";
import Link from "next/link";

export default function OutreachDraftPanel({ leadId, alreadyDrafted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/sales-pipeline/api/outreach-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setError(data.error || `Draft generation failed (HTTP ${res.status}).`);
        return;
      }
      const summary = data.summary || {};
      setResult({ ...summary, task_id: data.task_id || summary.task_id || null });
    } catch {
      setError("Network error while drafting. Please try again.");
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
            ? "Drafting… (~10–30s)"
            : alreadyDrafted
            ? "Regenerate outreach draft"
            : "Generate outreach draft"}
        </button>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          Draft only — queued for your review. Nothing is sent.
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
            Draft queued for review · risk {result.risk_level || "—"} ·{" "}
            {result.recommended_recipient_name
              ? `to ${result.recommended_recipient_name}`
              : "to the team / generic channel"}
          </div>

          {result.subject && (
            <p style={{ fontSize: 13, color: "#111827", margin: "8px 0 0" }}>
              <strong>Subject:</strong> {result.subject}
            </p>
          )}
          {result.body && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 13,
                color: "#1f2937",
                background: "#f9fafb",
                border: "1px solid #eef2f7",
                borderRadius: 8,
                padding: 10,
                margin: "6px 0 0",
                fontFamily: "inherit",
              }}
            >
              {result.body}
            </pre>
          )}

          {result.task_id && (
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "8px 0 0" }}>
              Task ID: <code>{result.task_id}</code>
            </p>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <Link
              href="/sales-pipeline/approvals"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "#0ea5e9",
                borderRadius: 8,
                padding: "9px 16px",
                textDecoration: "none",
              }}
            >
              Review in Approvals →
            </Link>
            <button style={refreshBtn} onClick={() => window.location.reload()}>
              Refresh to see saved draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
