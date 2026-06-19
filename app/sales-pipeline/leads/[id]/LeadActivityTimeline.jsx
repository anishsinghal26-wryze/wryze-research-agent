// ============================================================================
// app/sales-pipeline/leads/[id]/LeadActivityTimeline.jsx
// ----------------------------------------------------------------------------
// Phase 18A: READ-ONLY lead activity timeline. Pure presentation of the events
// assembled server-side by buildLeadActivityTimeline(). No writes, no editing,
// no sending — display only. Events arrive already sorted oldest → newest, with
// the current derived pipeline stage pinned last. Inline styles, no deps.
// ============================================================================

const KEY_COLORS = {
  discovered: "#64748b",
  enriched: "#0ea5e9",
  market: "#0891b2",
  contact: "#6366f1",
  draft_created: "#8b5cf6",
  approved: "#16a34a",
  rejected: "#dc2626",
  manual: "#2563eb",
  follow_up: "#d97706",
  stage: "#0d9488",
};

function fmt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function LeadActivityTimeline({ items }) {
  const list = Array.isArray(items) ? items : [];

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    background: "#fff",
  };
  const title = { fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 12px" };

  if (list.length === 0) {
    return (
      <section style={card}>
        <h2 style={title}>Activity timeline</h2>
        <p style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic" }}>
          No activity recorded for this lead yet.
        </p>
      </section>
    );
  }

  return (
    <section style={card}>
      <h2 style={title}>Activity timeline</h2>
      <div>
        {list.map((it, i) => {
          const color = KEY_COLORS[it.key] || "#6b7280";
          const when = fmt(it.at);
          return (
            <div
              key={`${it.key}-${i}`}
              style={{
                display: "flex",
                gap: 12,
                padding: "10px 0",
                borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                alignItems: "flex-start",
              }}
            >
              {/* dot + connector */}
              <div style={{ position: "relative", width: 14, flex: "0 0 14px", marginTop: 4 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: color,
                    border: it.current ? "3px solid #99f6e4" : "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                    {it.label}
                  </span>
                  {it.badge ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        backgroundColor: color,
                      }}
                    >
                      {it.badge}
                    </span>
                  ) : null}
                  {it.current ? (
                    <span style={{ fontSize: 11, color: "#0d9488", fontWeight: 700 }}>
                      (current)
                    </span>
                  ) : null}
                </div>
                {it.details ? (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, wordBreak: "break-word" }}>
                    {it.details}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  {when || "time not recorded"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
