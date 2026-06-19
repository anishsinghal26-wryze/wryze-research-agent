"use client";

// ============================================================================
// app/sales-pipeline/approvals/ApprovalsClient.jsx
// ----------------------------------------------------------------------------
// Phase 6b + Phase 12 client UI. Lists pending outreach-draft approvals with
// full detail (recipient, channel, subject, body, personalization, source
// context, risk notes), and lets the founder:
//   - EDIT a draft's subject/body (saved via /sales-pipeline/api/approvals/edit;
//     stays pending — no status change, no send)
//   - COPY the draft to the clipboard for manual LinkedIn/email outreach
//   - APPROVE / REJECT (manual, unchanged) via /sales-pipeline/api/approvals/*
// NEVER sends. Inline styles only, no dependencies.
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

  // Phase 12 edit/copy state
  const [editingId, setEditingId] = useState(null);
  const [editById, setEditById] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

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

  function startEdit(r) {
    const d = r.draft || {};
    setEditById((prev) => ({
      ...prev,
      [r.approval_id]: { subject: d.subject || "", body: d.body || "" },
    }));
    setActionError("");
    setEditingId(r.approval_id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(r) {
    const draft = r.draft || {};
    const edit = editById[r.approval_id] || {};
    if (!draft.id) {
      setActionError("Missing draft id; refresh and try again.");
      return;
    }
    if (!String(edit.body || "").trim()) {
      setActionError("Draft body cannot be empty.");
      return;
    }
    setSavingId(r.approval_id);
    setActionError("");
    try {
      const res = await fetch("/sales-pipeline/api/approvals/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draft.id,
          subject: edit.subject,
          body: edit.body,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setActionError(data.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      setRows((prev) =>
        prev.map((x) =>
          x.approval_id === r.approval_id
            ? { ...x, draft: { ...x.draft, subject: data.subject, body: data.body } }
            : x
        )
      );
      setEditingId(null);
    } catch {
      setActionError("Network error while saving.");
    } finally {
      setSavingId(null);
    }
  }

  async function copyDraft(r) {
    const draft = r.draft || {};
    const text =
      (draft.subject ? draft.subject + "\n\n" : "") + (draft.body || "");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        setActionError("Could not copy to clipboard.");
        return;
      }
    }
    setCopiedId(r.approval_id);
    setTimeout(() => setCopiedId((c) => (c === r.approval_id ? null : c)), 1500);
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
  const bodyBox = {
    whiteSpace: "pre-wrap",
    fontSize: 14,
    color: "#1f2937",
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
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
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>Approvals</h1>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
        Review pending outreach drafts. Edit, copy, approve, or reject — nothing is
        ever sent automatically.
      </p>

      {loadError && (
        <div
          role="alert"
          style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
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
        const p = r.payload || {};
        const busy = busyId === r.approval_id;
        const isEditing = editingId === r.approval_id;
        const saving = savingId === r.approval_id;
        const edit = editById[r.approval_id] || { subject: "", body: "" };
        const recipient = p.recommended_recipient_name
          ? `${p.recommended_recipient_name}${p.recommended_recipient_role ? " — " + p.recommended_recipient_role : ""}`
          : "Team / generic channel";
        const channel = draft.channel || p.recommended_channel || "—";

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
                <Badge text={`risk: ${r.risk_level}`} color={RISK_COLORS[r.risk_level]} />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {formatTime(r.created_at)}
                </span>
              </span>
            </div>

            {(lead.website || lead.category || lead.priority != null || lead.fit_score != null) && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>
                ) : null}
                {lead.category ? ` · ${lead.category}` : ""}
                {lead.priority ? ` · priority ${lead.priority}` : ""}
                {lead.fit_score != null ? ` · fit ${lead.fit_score}` : ""}
              </div>
            )}

            <div style={{ fontSize: 13, color: "#374151", marginTop: 8 }}>
              <strong>Recipient:</strong> {recipient} &nbsp;·&nbsp;{" "}
              <strong>Channel:</strong> {channel}
            </div>

            {/* ---- Draft (read-only or editable) ----------------------------- */}
            {!isEditing ? (
              <>
                <div style={label}>Subject</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {draft.subject || "(no subject)"}
                </div>
                <div style={label}>Body</div>
                <div style={bodyBox}>{draft.body || "(no body)"}</div>
              </>
            ) : (
              <>
                <div style={label}>Subject (editable)</div>
                <input
                  type="text"
                  value={edit.subject}
                  onChange={(e) =>
                    setEditById((prev) => ({
                      ...prev,
                      [r.approval_id]: { ...edit, subject: e.target.value },
                    }))
                  }
                  style={input}
                />
                <div style={label}>Body (editable)</div>
                <textarea
                  value={edit.body}
                  onChange={(e) =>
                    setEditById((prev) => ({
                      ...prev,
                      [r.approval_id]: { ...edit, body: e.target.value },
                    }))
                  }
                  rows={10}
                  style={{ ...input, fontFamily: "inherit", lineHeight: 1.5 }}
                />
                <div style={{ marginTop: 10 }}>
                  <button
                    style={btn("#2563eb", saving)}
                    disabled={saving}
                    onClick={() => saveEdit(r)}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    style={{ ...btn("#6b7280", saving), backgroundColor: "#6b7280" }}
                    disabled={saving}
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    Saving keeps the draft pending — nothing is sent.
                  </span>
                </div>
              </>
            )}

            {/* ---- Supporting context --------------------------------------- */}
            {Array.isArray(p.personalization_points) && p.personalization_points.length > 0 && (
              <>
                <div style={label}>Personalization points</div>
                <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13, color: "#374151" }}>
                  {p.personalization_points.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}
            {Array.isArray(p.source_context_used) && p.source_context_used.length > 0 && (
              <>
                <div style={label}>Source context used</div>
                <div style={{ fontSize: 13, color: "#374151" }}>
                  {p.source_context_used.join(", ")}
                </div>
              </>
            )}
            {p.risk_notes && (
              <>
                <div style={label}>Risk notes</div>
                <div style={{ fontSize: 13, color: "#374151" }}>{p.risk_notes}</div>
              </>
            )}

            {/* ---- Edit / Copy controls ------------------------------------- */}
            {!isEditing && (
              <div style={{ marginTop: 12 }}>
                <button style={btn("#0d9488", false)} onClick={() => startEdit(r)}>
                  Edit draft
                </button>
                <button style={btn("#0ea5e9", false)} onClick={() => copyDraft(r)}>
                  {copiedId === r.approval_id ? "Copied ✓" : "Copy draft"}
                </button>
              </div>
            )}

            {/* ---- Decision (manual) ---------------------------------------- */}
            <div style={label}>Decision notes (optional)</div>
            <textarea
              value={notesById[r.approval_id] || ""}
              onChange={(e) =>
                setNotesById((prev) => ({ ...prev, [r.approval_id]: e.target.value }))
              }
              placeholder="Optional note recorded with your decision."
              rows={2}
              style={{ ...input, marginBottom: 12 }}
            />

            <div>
              <button
                style={btn("#16a34a", busy || isEditing)}
                disabled={busy || isEditing}
                onClick={() => decide(r.approval_id, "approve")}
              >
                {busy ? "Working…" : "Approve"}
              </button>
              <button
                style={btn("#dc2626", busy || isEditing)}
                disabled={busy || isEditing}
                onClick={() => decide(r.approval_id, "reject")}
              >
                {busy ? "Working…" : "Reject"}
              </button>
              {isEditing && (
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  Finish or cancel editing before approving/rejecting.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </main>
  );
}
