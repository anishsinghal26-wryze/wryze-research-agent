"use client";

// ============================================================================
// app/sales-pipeline/campaigns/CampaignsClient.jsx
// ----------------------------------------------------------------------------
// Phase 21: Campaign Builder UI. Create a campaign (name / target query /
// geography / ICP notes / desired lead count 1..25) and run founder-triggered
// batch discovery per campaign. NO send button, NO automation — discovery only
// fires when the founder clicks "Discover leads". After create/discover the page
// reloads so the list reflects the new state. Inline styles, no dependencies.
// ============================================================================

import { useState } from "react";
import Link from "next/link";

const MAX_LEADS = 25;
const DEFAULT_LEADS = 10;

const STATUS_COLORS = { draft: "#6b7280", active: "#16a34a", paused: "#d97706" };

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function CampaignsClient({ campaigns, loadError }) {
  const list = Array.isArray(campaigns) ? campaigns : [];

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [geography, setGeography] = useState("");
  const [icp, setIcp] = useState("");
  const [count, setCount] = useState(DEFAULT_LEADS);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState(null);

  // Per-campaign discovery state.
  const [discoveringId, setDiscoveringId] = useState(null);
  const [discoverErr, setDiscoverErr] = useState(null);

  // Per-lead qualification state (keyed by `${campaignId}:${leadId}`).
  const [qualifyingKey, setQualifyingKey] = useState(null);
  const [qualifyErr, setQualifyErr] = useState(null);

  async function handleQualify(campaignId, leadId, status) {
    const key = `${campaignId}:${leadId}`;
    setQualifyingKey(key);
    setQualifyErr(null);
    try {
      const res = await fetch("/sales-pipeline/api/campaigns/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, lead_id: leadId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setQualifyErr(data.error || "Could not save the qualification.");
        setQualifyingKey(null);
        return;
      }
      window.location.reload();
    } catch {
      setQualifyErr("Network error — please try again.");
      setQualifyingKey(null);
    }
  }

  const canCreate = name.trim() && query.trim() && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const res = await fetch("/sales-pipeline/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          target_query: query.trim(),
          geography: geography.trim() || null,
          icp_notes: icp.trim() || null,
          desired_lead_count: Math.max(1, Math.min(MAX_LEADS, Number(count) || DEFAULT_LEADS)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setCreateErr(data.error || "Could not create the campaign.");
        setCreating(false);
        return;
      }
      window.location.reload();
    } catch {
      setCreateErr("Network error — please try again.");
      setCreating(false);
    }
  }

  async function handleDiscover(id) {
    setDiscoveringId(id);
    setDiscoverErr(null);
    try {
      const res = await fetch("/sales-pipeline/api/campaigns/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setDiscoverErr(data.error || "Discovery failed.");
        setDiscoveringId(null);
        return;
      }
      window.location.reload();
    } catch {
      setDiscoverErr("Network error — please try again.");
      setDiscoveringId(null);
    }
  }

  const page = { background: "#f8fafc", minHeight: "100vh" };
  const wrap = {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
    maxWidth: 1040,
    margin: "0 auto",
    padding: "24px 16px 72px",
  };
  const card = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16, background: "#fff" };
  const title = { fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 12px" };
  const label = { fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 4px" };
  const input = { width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, fontFamily: "inherit" };

  return (
    <div style={page}>
      <main style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Campaigns</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "6px 0 0" }}>
              Define a market/niche and batch-discover leads into a campaign. Discovery runs
              only when you click — nothing is enriched, drafted, approved, or sent automatically.
            </p>
          </div>
          <Link href="/sales-pipeline" style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", fontWeight: 600 }}>
            ← Back to Sales Pipeline
          </Link>
        </div>

        {loadError ? (
          <div role="alert" style={{ ...card, marginTop: 16, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
            Could not load campaigns. If this is the first time, run the Phase 21 migration
            (<code>supabase/migrations/0002_sales_campaigns.sql</code>) in the Supabase SQL Editor,
            then reload.
          </div>
        ) : null}

        {/* Create campaign ----------------------------------------------- */}
        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={title}>New campaign</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <div>
              <div style={label}>Campaign name</div>
              <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NYC SAT prep centers" />
            </div>
            <div>
              <div style={label}>Target market / query</div>
              <input style={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. SAT prep tutoring centers" />
            </div>
            <div>
              <div style={label}>Geography</div>
              <input style={input} value={geography} onChange={(e) => setGeography(e.target.value)} placeholder="e.g. New York, USA" />
            </div>
            <div>
              <div style={label}>Desired lead count (max {MAX_LEADS})</div>
              <input style={input} type="number" min={1} max={MAX_LEADS} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={label}>Ideal customer profile notes</div>
            <textarea style={{ ...input, resize: "vertical" }} rows={3} value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="Who is the ideal customer for this campaign?" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid " + (canCreate ? "#2563eb" : "#d1d5db"),
                background: canCreate ? "#2563eb" : "#f3f4f6",
                color: canCreate ? "#fff" : "#9ca3af",
                fontSize: 14,
                fontWeight: 600,
                cursor: canCreate ? "pointer" : "not-allowed",
              }}
            >
              {creating ? "Creating…" : "Create campaign"}
            </button>
            {createErr ? <span role="alert" style={{ fontSize: 13, color: "#b91c1c" }}>{createErr}</span> : null}
          </div>
        </section>

        {/* Campaign list ------------------------------------------------- */}
        <h2 style={{ ...title, margin: "8px 0 12px" }}>Campaigns ({list.length})</h2>
        {discoverErr ? (
          <div role="alert" style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}>{discoverErr}</div>
        ) : null}
        {list.length === 0 ? (
          <div style={{ ...card, color: "#9ca3af", fontStyle: "italic" }}>No campaigns yet. Create one above.</div>
        ) : (
          list.map((c) => (
            <section key={c.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{c.name}</span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff", backgroundColor: STATUS_COLORS[c.status] || "#6b7280" }}>
                    {c.status}
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{fmt(c.created_at)}</span>
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>
                <strong>Query:</strong> {c.target_query}
                {c.geography ? <> · <strong>Geo:</strong> {c.geography}</> : null}
                {" · "}<strong>Target:</strong> {c.desired_lead_count} leads
              </div>
              {c.icp_notes ? (
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>ICP: {c.icp_notes}</div>
              ) : null}

              {/* Phase 22: qualification queue counts */}
              <div style={{ fontSize: 13, color: "#111827", marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span><strong>{c.discovered_count}</strong> discovered</span>
                <span style={{ color: "#16a34a" }}><strong>{c.qualified_count || 0}</strong> qualified</span>
                <span style={{ color: "#dc2626" }}><strong>{c.rejected_count || 0}</strong> rejected</span>
                <span style={{ color: "#d97706" }}><strong>{c.maybe_count || 0}</strong> maybe</span>
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, fontStyle: "italic" }}>
                Qualification is a manual decision only — it does not run enrichment, contact/market
                intelligence, drafting, or any outreach.
              </div>

              {/* Phase 22: per-lead qualification queue */}
              {c.discovered_leads && c.discovered_leads.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                  {c.discovered_leads.map((l) => {
                    const key = `${c.id}:${l.id}`;
                    const busy = qualifyingKey === key;
                    return (
                      <div key={l.id} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/sales-pipeline/leads/${l.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
                              {l.name}
                            </Link>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              {l.website ? (
                                <a href={l.website} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{l.website}</a>
                              ) : "no website"}
                              {l.fit_score != null ? <> · fit {l.fit_score}</> : null}
                              {l.priority ? <> · {l.priority}</> : null}
                            </div>
                          </div>
                          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {l.qualification ? (
                              <span style={{
                                padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff",
                                backgroundColor: l.qualification === "qualified" ? "#16a34a" : l.qualification === "rejected" ? "#dc2626" : "#d97706",
                              }}>
                                {l.qualification === "qualified" ? "Qualified" : l.qualification === "rejected" ? "Rejected" : "Maybe / later"}
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "#9ca3af" }}>Not reviewed</span>
                            )}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {[
                            { s: "qualified", label: "Mark qualified", bg: "#16a34a" },
                            { s: "rejected", label: "Mark rejected", bg: "#dc2626" },
                            { s: "maybe", label: "Maybe / later", bg: "#d97706" },
                          ].map((b) => (
                            <button
                              key={b.s}
                              type="button"
                              onClick={() => handleQualify(c.id, l.id, b.s)}
                              disabled={busy}
                              style={{
                                padding: "5px 10px",
                                borderRadius: 8,
                                border: "1px solid " + b.bg,
                                background: l.qualification === b.s ? b.bg : "#fff",
                                color: l.qualification === b.s ? "#fff" : b.bg,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: busy ? "wait" : "pointer",
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              {busy ? "Saving…" : b.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {qualifyErr ? <div role="alert" style={{ fontSize: 13, color: "#b91c1c", marginTop: 6 }}>{qualifyErr}</div> : null}

              <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleDiscover(c.id)}
                  disabled={discoveringId === c.id}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid #0d9488",
                    background: discoveringId === c.id ? "#99f6e4" : "#0d9488",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: discoveringId === c.id ? "wait" : "pointer",
                  }}
                >
                  {discoveringId === c.id ? "Discovering…" : "Discover leads"}
                </button>
                <Link href="/sales-pipeline" style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                  View in sales pipeline →
                </Link>
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
