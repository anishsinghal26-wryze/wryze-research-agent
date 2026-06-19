"use client";

// ============================================================================
// app/sales-pipeline/leads/[id]/ReadyToSendPanel.jsx
// ----------------------------------------------------------------------------
// Phase 13: "Ready for manual send" view for APPROVED outreach drafts.
//
// The system NEVER sends. After a founder approves a draft, this panel shows it
// as "Ready for manual send" with the final subject/body/channel/recipient, a
// prominent safety warning, manual Copy controls (subject / body / full
// message), and an optional manual-send checklist. There is intentionally NO
// send button and NO external integration. Inline styles, no dependencies.
// ============================================================================

import { useState } from "react";

const CHECKLIST = [
  "Confirm the recipient and channel are correct.",
  "Re-read the subject and body one final time.",
  "Verify any names/links before sending.",
  "Send it yourself from your own LinkedIn/email account.",
];

const MANUAL_SEND_CHANNELS = ["LinkedIn", "Email", "Phone follow-up", "Other"];

function fmt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function ReadyCard({ draft }) {
  const [copied, setCopied] = useState("");
  const [checks, setChecks] = useState({});

  // Phase 14: manual-send tracking (the product never sends — this only records
  // that the founder sent it manually outside Wryze).
  const [sentRecord, setSentRecord] = useState(draft.manual_send || null);
  // Default the channel selector to LinkedIn, or Email if the draft channel is email.
  const [channel, setChannel] = useState(
    draft.channel === "email" ? "Email" : "LinkedIn"
  );
  const [notes, setNotes] = useState("");
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState("");

  const fullMessage =
    (draft.subject ? `Subject: ${draft.subject}\n\n` : "") + (draft.body || "");

  async function doCopy(kind, text) {
    const ok = await copyText(text);
    setCopied(ok ? kind : "fail");
    setTimeout(() => setCopied((c) => (c === kind || c === "fail" ? "" : c)), 1500);
  }

  async function markSent() {
    setMarking(true);
    setMarkError("");
    try {
      const res = await fetch("/sales-pipeline/api/outreach-drafts/mark-manual-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id, sent_channel: channel, sent_notes: notes }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {}
      if (!res.ok || !data.ok) {
        setMarkError(data.error || `Could not record (HTTP ${res.status}).`);
        return;
      }
      setSentRecord({
        sent_manually_at: data.sent_manually_at,
        sent_channel: data.sent_channel,
        sent_notes: data.sent_notes,
      });
    } catch {
      setMarkError("Network error while recording.");
    } finally {
      setMarking(false);
    }
  }

  const label = {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    margin: "12px 0 2px",
  };
  const copyBtn = {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#2563eb",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    marginRight: 8,
  };
  const box = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 14,
    color: "#1f2937",
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    borderRadius: 8,
    padding: 10,
    margin: "4px 0 0",
  };

  return (
    <div
      style={{
        border: "1px solid #a7f3d0",
        borderLeft: "4px solid #16a34a",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: "#fff",
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
            backgroundColor: "#16a34a",
          }}
        >
          Ready for manual send
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          approved
          {draft.reviewed_at ? ` · ${fmt(draft.reviewed_at)}` : ""}
          {draft.risk_level ? ` · risk ${draft.risk_level}` : ""}
        </span>
      </div>

      {/* Safety warning — the system does NOT send anything */}
      <div
        role="alert"
        style={{
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #fde68a",
          background: "#fffbeb",
          color: "#92400e",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        ⚠️ This system has not sent this message. Copy and send manually.
      </div>

      <div style={{ fontSize: 13, color: "#374151", marginTop: 10 }}>
        <strong>Recipient:</strong>{" "}
        {draft.recipient_name
          ? `${draft.recipient_name}${draft.recipient_role ? " — " + draft.recipient_role : ""}`
          : "Team / generic channel"}
        &nbsp;·&nbsp; <strong>Channel:</strong> {draft.channel || "—"}
      </div>

      <div style={label}>Final subject</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{draft.subject || "(no subject)"}</div>

      <div style={label}>Final body</div>
      <div style={box}>{draft.body || "(no body)"}</div>

      <div style={{ marginTop: 12 }}>
        <button style={copyBtn} onClick={() => doCopy("subject", draft.subject || "")}>
          Copy subject
        </button>
        <button style={copyBtn} onClick={() => doCopy("body", draft.body || "")}>
          Copy body
        </button>
        <button style={copyBtn} onClick={() => doCopy("full", fullMessage)}>
          Copy full message
        </button>
        {copied && (
          <span style={{ fontSize: 12, color: copied === "fail" ? "#b91c1c" : "#16a34a", marginLeft: 4 }}>
            {copied === "fail" ? "Copy failed — select & copy manually." : "Copied ✓"}
          </span>
        )}
      </div>

      <div style={label}>Manual send checklist</div>
      <div style={{ fontSize: 13, color: "#374151" }}>
        {CHECKLIST.map((item, i) => (
          <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "4px 0" }}>
            <input
              type="checkbox"
              checked={Boolean(checks[i])}
              onChange={(e) => setChecks((p) => ({ ...p, [i]: e.target.checked }))}
              style={{ marginTop: 3 }}
            />
            <span>{item}</span>
          </label>
        ))}
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
          This checklist is a personal aid — it is not saved and does not send anything.
        </div>
      </div>

      {/* ---- Manual send tracking (Phase 14) — records only, never sends --- */}
      {sentRecord ? (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: "#fff",
              backgroundColor: "#2563eb",
            }}
          >
            Manually sent
          </span>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
            Sent {fmt(sentRecord.sent_manually_at)} · via {sentRecord.sent_channel || "—"}
          </div>
          {sentRecord.sent_notes ? (
            <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
              Notes: {sentRecord.sent_notes}
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>
            Wryze did not send this automatically — you recorded that you sent it manually.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={label}>Mark as manually sent</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            >
              {MANUAL_SEND_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={markSent}
              disabled={marking}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                backgroundColor: marking ? "#9ca3af" : "#2563eb",
                cursor: marking ? "default" : "pointer",
              }}
            >
              {marking ? "Recording…" : "Mark as manually sent"}
            </button>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              Records that you sent it yourself — Wryze does not send.
            </span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes (e.g. who you contacted, when, any reply)."
            rows={2}
            style={{
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 14,
              padding: "8px 10px",
              marginTop: 8,
            }}
          />
          {markError && (
            <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 6 }}>{markError}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReadyToSendPanel({ drafts }) {
  const list = Array.isArray(drafts) ? drafts : [];
  if (list.length === 0) return null;

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    background: "#fff",
  };

  return (
    <section style={card}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
        Ready for manual send
      </h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>
        Approved draft{list.length === 1 ? "" : "s"} below. Copy and send manually —
        nothing is sent automatically.
      </p>
      {list.map((d) => (
        <ReadyCard key={d.id} draft={d} />
      ))}
    </section>
  );
}
