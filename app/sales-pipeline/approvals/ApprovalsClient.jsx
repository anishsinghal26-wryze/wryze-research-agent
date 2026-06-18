"use client";

// ============================================================================
// app/sales-pipeline/approvals/ApprovalsClient.jsx
// ----------------------------------------------------------------------------
// Phase 6b client UI. Lists pending outreach-draft approvals and lets the
// founder Approve / Reject each. Calls the same-origin (cookie-gated) routes
// under /sales-pipeline/api/approvals/*. On 200 or 409 (already decided) the
// row is removed locally; other errors show the route's message. NEVER sends.
// Inline styles only, consistent with the rest of the app. No dependencies.
// ============================================================================

import { useState } from "react";

const RISK_COLORS = {
  low: "#10b981",
  medium: "#d97706",
  high: "#dc2626",
  critical: "#7f1d1d",
  blocked: "#334155",
};

function Badge({ text, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        backgroundColor: color || "#6b7280",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

export default function ApprovalsClient({ initialApprovals, loadError }) {
  const [rows, setRows] = useState(
    Array.isArray(initialApprovals) ? initialApprovals : []
  );
  const [notesById, setNotesById] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  async function decide(approval_id, kind) {
    setBusyId(approval_id);
    setActionError("");
    const decision_notes = notesById[approval_id] || null;
    try {
      const res = await fetch(`/sales-pipeline/api/approvals/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id, decision_notes }),
      });
      // 200 = decided; 409 = already decided. Either way, drop the row.
      if (res.ok || res.status === 409) {
        setRows((prev) => prev.filter((r) => r.approval_id !== approval_id));
        return;
      }
      let msg = `Request failed (HTTP ${res.status}).`;
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch {}
      setActionError(msg);
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const wrap = {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
    maxWidth: 820,
    margin: "0 auto",
    padding: "24px 16px 64px",
  };
  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    background: "#fff",
  };
  const label = {
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    margin: "10px 0 2px",
  };
  const btn = (bg, disabled) => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    backgroundColor: disabled ? "#9ca3af" : bg,
    cursor: disabled ? "default" : "pointer",
    marginRight: 8,
  });

  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>
        Approvals
      </h1>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
        Review pending outreach drafts. Approve or reject — nothing is ever sent
        automatically.
      </p>

      {loadError && (
        <div
          role="alert"
          style={{
            ...card,
            borderColor: "#fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
          }}
        >
          Could not load approvals.
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 1000,
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 13,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          }}
        >
          {actionError}
        </div>
      )}

      {!loadError && rows.length === 0 && (
        <div style={{ ...card, color: "#6b7280" }}>No pending approvals.</div>
      )}

      {rows.map((r) => {
        const lead = r.lead || {};
        const draft = r.draft || {};
        const busy = busyId === r.approval_id;
        return (
          <div key={r.approval_id} style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 16 }}>
                {lead.institute_name || "(unknown institute)"}
              </strong>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge
                  text={`risk: ${r.risk_level}`}
                  color={RISK_COLORS[r.risk_level]}
                />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {formatTime(r.created_at)}
                </span>
              </span>
            </div>

            {(lead.website || lead.category || lead.priority != null || lead.fit_score != null) && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noreferrer">
                    {lead.website}
                  </a>
                ) : null}
                {lead.category ? ` · ${lead.category}` : ""}
                {lead.priority ? ` · priority ${lead.priority}` : ""}
                {lead.fit_score != null ? ` · fit ${lead.fit_score}` : ""}
              </div>
            )}

            {r.summary && (
              <p style={{ fontSize: 14, margin: "10px 0 0" }}>{r.summary}</p>
            )}

            <div style={label}>Draft{draft.channel ? ` · ${draft.channel}` : ""}</div>
            {draft.subject && (
              <div style={{ fontSize: 14, fontWeight: 600 }}>{draft.subject}</div>
            )}
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 14,
                color: "#1f2937",
                background: "#f9fafb",
                border: "1px solid #eef2f7",
                borderRadius: 8,
                padding: 10,
                marginTop: 4,
              }}
            >
              {draft.body || "(no body)"}
            </div>

            <div style={label}>Decision notes (optional)</div>
            <textarea
              value={notesById[r.approval_id] || ""}
              onChange={(e) =>
                setNotesById((prev) => ({
                  ...prev,
                  [r.approval_id]: e.target.value,
                }))
              }
              placeholder="Optional note recorded with your decision."
              rows={2}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                padding: "8px 10px",
                marginBottom: 12,
              }}
            />

            <div>
              <button
                style={btn("#16a34a", busy)}
                disabled={busy}
                onClick={() => decide(r.approval_id, "approve")}
              >
                {busy ? "Working…" : "Approve"}
              </button>
              <button
                style={btn("#dc2626", busy)}
                disabled={busy}
                onClick={() => decide(r.approval_id, "reject")}
              >
                {busy ? "Working…" : "Reject"}
              </button>
            </div>
          </div>
        );
      })}
    </main>
  );
}
