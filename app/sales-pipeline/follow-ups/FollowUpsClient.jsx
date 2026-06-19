"use client";

// ============================================================================
// app/sales-pipeline/follow-ups/FollowUpsClient.jsx
// ----------------------------------------------------------------------------
// Phase 16: READ-ONLY CRM / Follow-ups overview UI. Shows every lead/draft with
// manual-send and/or follow-up activity, with summary counts and simple
// client-side filters. Due-state ("today") is computed in the browser so it
// matches the founder's local date. NO editing, NO follow-up save, NO send
// buttons — this page only reads and displays. Inline styles, no dependencies.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";

const STATUS_LABELS = {
  awaiting_reply: "Awaiting reply",
  follow_up_sent: "Follow-up sent",
  replied: "Replied",
  not_interested: "Not interested",
  booked_call: "Booked call",
  closed: "Closed",
};
const STATUS_COLORS = {
  awaiting_reply: "#d97706",
  follow_up_sent: "#0ea5e9",
  replied: "#16a34a",
  not_interested: "#6b7280",
  booked_call: "#7c3aed",
  closed: "#334155",
};
const PRIORITY_COLORS = { High: "#dc2626", Medium: "#d97706", Low: "#6b7280" };

// Phase 17: derived pipeline-stage colors (label comes from the server item).
const STAGE2_COLORS = {
  new_lead: "#64748b",
  research_done: "#0ea5e9",
  contact_found: "#6366f1",
  draft_created: "#8b5cf6",
  approved: "#0d9488",
  manually_sent: "#2563eb",
  awaiting_reply: "#d97706",
  follow_up_sent: "#0891b2",
  replied: "#16a34a",
  booked_call: "#7c3aed",
  not_interested: "#6b7280",
  closed: "#334155",
};

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function dueState(due) {
  if (!due) return { key: "none", label: "No follow-up set", color: "#9ca3af" };
  const d = new Date(String(due).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return { key: "none", label: "No follow-up set", color: "#9ca3af" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  if (diff < 0) return { key: "overdue", label: "Overdue", color: "#dc2626" };
  if (diff === 0) return { key: "due_today", label: "Due today", color: "#d97706" };
  return { key: "upcoming", label: "Upcoming", color: "#16a34a" };
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "due_today", label: "Due today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "awaiting_reply", label: "Awaiting reply" },
  { key: "follow_up_sent", label: "Follow-up sent" },
  { key: "replied", label: "Replied" },
  { key: "booked_call", label: "Booked call" },
  { key: "closed", label: "Closed" },
  { key: "not_interested", label: "Not interested" },
];

export default function FollowUpsClient({ items, loadError }) {
  const list = Array.isArray(items) ? items : [];
  const [filter, setFilter] = useState("all");

  // Annotate each item with its (client-computed) due state once.
  const annotated = useMemo(
    () => list.map((it) => ({ ...it, due: dueState(it.follow_up_due_date) })),
    [list]
  );

  const summary = useMemo(() => {
    const s = {
      manuallySent: 0,
      awaiting_reply: 0,
      overdue: 0,
      due_today: 0,
      upcoming: 0,
      booked_call: 0,
      closed: 0,
    };
    for (const it of annotated) {
      if (it.sent_manually_at) s.manuallySent += 1;
      if (it.follow_up_status === "awaiting_reply") s.awaiting_reply += 1;
      if (it.follow_up_status === "booked_call") s.booked_call += 1;
      if (it.follow_up_status === "closed") s.closed += 1;
      if (it.follow_up_due_date) {
        if (it.due.key === "overdue") s.overdue += 1;
        else if (it.due.key === "due_today") s.due_today += 1;
        else if (it.due.key === "upcoming") s.upcoming += 1;
      }
    }
    return s;
  }, [annotated]);

  const filtered = useMemo(() => {
    if (filter === "all") return annotated;
    if (filter === "overdue" || filter === "due_today" || filter === "upcoming") {
      return annotated.filter((it) => it.follow_up_due_date && it.due.key === filter);
    }
    return annotated.filter((it) => it.follow_up_status === filter);
  }, [annotated, filter]);

  const wrap = {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 16px 72px",
  };
  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    background: "#fff",
  };
  const stat = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "10px 14px",
    background: "#fff",
    minWidth: 120,
  };
  const statNum = { fontSize: 22, fontWeight: 800 };
  const statLabel = {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };

  function StatusPill({ status }) {
    if (!status) return <span style={{ fontSize: 12, color: "#9ca3af" }}>no follow-up</span>;
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          backgroundColor: STATUS_COLORS[status] || "#6b7280",
        }}
      >
        {STATUS_LABELS[status] || status}
      </span>
    );
  }

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Follow-ups CRM</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "6px 0 0" }}>
              Read-only overview of manually-sent drafts and follow-up actions. Nothing
              here sends or edits — open a lead to take action.
            </p>
          </div>
          <Link
            href="/sales-pipeline"
            style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", fontWeight: 600 }}
          >
            ← Back to Sales Pipeline
          </Link>
        </div>

        {loadError && (
          <div
            role="alert"
            style={{ ...card, marginTop: 16, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            Could not load follow-up overview.
          </div>
        )}

        {/* ---- Summary counts -------------------------------------------- */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0" }}>
          <div style={stat}><div style={statNum}>{summary.manuallySent}</div><div style={statLabel}>Manually sent</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#d97706" }}>{summary.awaiting_reply}</div><div style={statLabel}>Awaiting reply</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#dc2626" }}>{summary.overdue}</div><div style={statLabel}>Overdue</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#d97706" }}>{summary.due_today}</div><div style={statLabel}>Due today</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#16a34a" }}>{summary.upcoming}</div><div style={statLabel}>Upcoming</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#7c3aed" }}>{summary.booked_call}</div><div style={statLabel}>Booked call</div></div>
          <div style={stat}><div style={{ ...statNum, color: "#334155" }}>{summary.closed}</div><div style={statLabel}>Closed</div></div>
        </div>

        {/* ---- Filters --------------------------------------------------- */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid " + (filter === f.key ? "#2563eb" : "#d1d5db"),
                background: filter === f.key ? "#2563eb" : "#fff",
                color: filter === f.key ? "#fff" : "#374151",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ---- List ------------------------------------------------------ */}
        {filtered.length === 0 ? (
          <div style={{ ...card, color: "#6b7280" }}>
            {annotated.length === 0
              ? "No manual-send or follow-up activity yet."
              : "No items match this filter."}
          </div>
        ) : (
          filtered.map((it) => (
            <div key={it.draft_id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href={`/sales-pipeline/leads/${it.lead_id}`}
                  style={{ fontSize: 16, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}
                >
                  {it.lead_name}
                </Link>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {it.pipeline_stage ? (
                    <span
                      title="Derived pipeline stage"
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#fff",
                        backgroundColor: STAGE2_COLORS[it.pipeline_stage] || "#6b7280",
                      }}
                    >
                      {it.pipeline_stage_label || it.pipeline_stage}
                    </span>
                  ) : null}
                  <StatusPill status={it.follow_up_status} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: it.due.color }}>{it.due.label}</span>
                  {it.priority ? (
                    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff", backgroundColor: PRIORITY_COLORS[it.priority] || "#6b7280" }}>
                      {it.priority}
                    </span>
                  ) : null}
                  {it.fit_score != null ? <span style={{ fontSize: 12, color: "#6b7280" }}>fit {it.fit_score}</span> : null}
                </span>
              </div>

              <div style={{ fontSize: 14, color: "#111827", marginTop: 6 }}>{it.subject}</div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                {it.recipient_name ? <>To {it.recipient_name} · </> : "Team / generic channel · "}
                channel {it.channel || "—"}
                {it.sent_manually_at ? <> · sent {fmt(it.sent_manually_at)}</> : ""}
                {it.follow_up_due_date ? <> · due {it.follow_up_due_date}</> : ""}
              </div>
              {it.follow_up_notes ? (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  Notes: {it.follow_up_notes.length > 140 ? it.follow_up_notes.slice(0, 140) + "…" : it.follow_up_notes}
                </div>
              ) : null}
              {/* Phase 19: founder notes visibility (read-only) */}
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {it.notes_count > 0 ? (
                  <span style={{ color: "#475569" }}>
                    <span style={{ fontWeight: 700 }}>
                      📝 Notes: {it.notes_count}
                    </span>
                    {it.notes_preview ? (
                      <span style={{ color: "#9ca3af" }}> · {it.notes_preview}</span>
                    ) : null}
                  </span>
                ) : (
                  <span style={{ color: "#cbd5e1" }}>No notes</span>
                )}
              </div>
              <div style={{ marginTop: 6 }}>
                <Link href={`/sales-pipeline/leads/${it.lead_id}`} style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                  Open lead →
                </Link>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
