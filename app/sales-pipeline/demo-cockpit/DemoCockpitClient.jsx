"use client";

// ============================================================================
// app/sales-pipeline/demo-cockpit/DemoCockpitClient.jsx
// ----------------------------------------------------------------------------
// Phase 20: Founder Demo Cockpit UI. READ-ONLY presentation of the 9-step
// sales-agent workflow for one lead, plus a lead selector and a lead summary
// card. No send button, no writes, no agent triggers — every action is a link
// to an existing page. Inline styles, no dependencies.
// ============================================================================

import Link from "next/link";

const STATUS_STYLE = {
  complete: { bg: "#16a34a", label: "Complete" },
  available: { bg: "#94a3b8", label: "Available" },
  current: { bg: "#0d9488", label: "Current" },
};
const PRIORITY_COLORS = { High: "#dc2626", Medium: "#d97706", Low: "#6b7280" };

function fmt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function DemoCockpitClient({
  leads,
  selectedId,
  summary,
  steps,
  loadError,
  notFound,
}) {
  const leadList = Array.isArray(leads) ? leads : [];
  const stepList = Array.isArray(steps) ? steps : [];

  const page = { background: "#f8fafc", minHeight: "100vh" };
  const wrap = {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
    maxWidth: 1040,
    margin: "0 auto",
    padding: "24px 16px 72px",
  };
  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    background: "#fff",
  };

  function onSelect(e) {
    const id = e.target.value;
    if (id) window.location.href = `/sales-pipeline/demo-cockpit?lead=${id}`;
  }

  return (
    <div style={page}>
      <main style={wrap}>
        {/* Header --------------------------------------------------------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Founder Demo Cockpit</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "6px 0 0" }}>
              End-to-end sales-agent workflow for one lead. Read-only — every action links to
              an existing page. Nothing here sends or triggers an agent.
            </p>
          </div>
          <Link href="/sales-pipeline" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", fontWeight: 600 }}>
            ← Back to Sales Pipeline
          </Link>
        </div>

        {/* Lead selector -------------------------------------------------- */}
        {leadList.length > 0 ? (
          <div style={{ margin: "16px 0" }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, marginRight: 8 }}>
              Lead
            </label>
            <select
              value={selectedId || ""}
              onChange={onSelect}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, background: "#fff", color: "#111827", minWidth: 260 }}
            >
              {leadList.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {loadError ? (
          <div role="alert" style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>
            Could not load this lead right now. Please try again.
          </div>
        ) : null}
        {notFound ? (
          <div style={{ ...card }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Lead not found</h2>
            <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>
              Pick a different lead from the selector above.
            </p>
          </div>
        ) : null}

        {summary ? (
          <>
            {/* Lead summary card ---------------------------------------- */}
            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <Link href={`/sales-pipeline/leads/${summary.id}`} style={{ fontSize: 20, fontWeight: 800, color: "#2563eb", textDecoration: "none" }}>
                    {summary.name}
                  </Link>
                  {summary.website ? (
                    <div style={{ marginTop: 4 }}>
                      <a href={summary.website} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13 }}>
                        {summary.website}
                      </a>
                    </div>
                  ) : null}
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {summary.priority ? (
                    <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff", backgroundColor: PRIORITY_COLORS[summary.priority] || "#6b7280" }}>
                      {summary.priority}
                    </span>
                  ) : null}
                  {summary.fit_score != null ? (
                    <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>fit {summary.fit_score}</span>
                  ) : null}
                  <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff", backgroundColor: "#0d9488" }}>
                    {summary.pipeline_stage_label}
                  </span>
                </span>
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280" }}>
                {summary.notes_count > 0 ? (
                  <>
                    <span style={{ fontWeight: 700, color: "#475569" }}>📝 {summary.notes_count} note{summary.notes_count === 1 ? "" : "s"}</span>
                    {summary.notes_preview ? <span style={{ color: "#9ca3af" }}> · {summary.notes_preview}</span> : null}
                  </>
                ) : (
                  <span style={{ color: "#cbd5e1" }}>No notes</span>
                )}
              </div>
            </section>

            {/* Workflow stepper ----------------------------------------- */}
            <div>
              {stepList.map((s) => {
                const sty = STATUS_STYLE[s.status] || STATUS_STYLE.available;
                const when = fmt(s.at);
                return (
                  <div key={s.key} style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        flex: "0 0 34px",
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        background: sty.bg,
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 15,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {s.n}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{s.label}</span>
                        <span style={{ padding: "1px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: "#fff", backgroundColor: sty.bg }}>
                          {sty.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", marginTop: 4, wordBreak: "break-word" }}>{s.detail}</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                        {when ? <span style={{ fontSize: 12, color: "#9ca3af" }}>{when}</span> : null}
                        {s.href ? (
                          <Link href={s.href} style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                            {s.cta || "Open"} →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick links --------------------------------------------- */}
            <section style={{ ...card, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Link href={`/sales-pipeline/leads/${summary.id}`} style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open lead detail →</Link>
              <Link href="/sales-pipeline/approvals" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open approvals →</Link>
              <Link href="/sales-pipeline/follow-ups" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open follow-ups CRM →</Link>
              <Link href="/agent-command-center" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open agent command center →</Link>
              <Link href="/sales-pipeline" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Open sales pipeline →</Link>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
