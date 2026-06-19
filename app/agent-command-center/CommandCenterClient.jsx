"use client";

// ============================================================================
// app/agent-command-center/CommandCenterClient.jsx
// ----------------------------------------------------------------------------
// Phase 8.5: READ-ONLY founder-facing Agent Command Center / Agent Map.
//
// Renders the full Founder OS / Sales Agent pipeline as a visual map of agent
// cards in flow order. Pure presentation: it receives a `signals` object
// (computed read-only on the server) and overlays the latest real task/event
// data onto otherwise-static agent metadata. Never triggers any agent, never
// writes. Inline styles, no dependencies (same pattern as the Sales Pipeline).
// ============================================================================

import Link from "next/link";

const STATUS_META = {
  live: { label: "Live", color: "#16a34a", bg: "#ecfdf5", border: "#a7f3d0" },
  partial: { label: "Partially live", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  planned: { label: "Planned", color: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb" },
  blocked: { label: "Blocked", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  disabled: { label: "Disabled", color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0" },
};

function fmt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

// ---- Static agent flow config (the 10-stage Founder OS / Sales Agent map) ---
// `live(signals)` returns a short "latest activity" line from real data when
// available, else null. Keys map to the read-only signals built on the server.
const AGENTS = [
  {
    n: 0,
    name: "Founder / CEO Orchestrator",
    status: "planned",
    purpose:
      "Top-level brain: decide what runs next, sequence the sub-agents, and surface what needs founder attention. No autonomous CEO agent yet — this map is the manual stand-in.",
    input: "All agent outputs + events (leads, tasks, assessments, approvals).",
    output: "Orchestration decisions / next-action queue.",
    route: "— (not implemented)",
    nextDep: "Stable Discovery → Enrichment → Scoring → Outreach loop first.",
    link: null,
    live: () => null,
  },
  {
    n: 1,
    name: "Discovery Agent",
    status: "live",
    purpose: "Find real SAT-prep / test-prep institutes to add as B2B leads.",
    input: "ICP / search seeds (founder-triggered “Discover Real Leads”).",
    output: "New rows in leads (source = sales_discovery).",
    route: "lib/salesDiscovery.js · Discover panel on /sales-pipeline",
    nextDep: "Feeds Enrichment Agent.",
    link: { href: "/sales-pipeline", label: "Sales Pipeline" },
    live: (s) => {
      const t = s.latestByMode && s.latestByMode.discover;
      const ev = s.latestEventByType && s.latestEventByType.lead_created;
      if (t) return `Last discovery task: ${t.status} · ${fmt(t.created_at)}`;
      if (ev) return `Last lead created: ${fmt(ev.created_at)}`;
      return null;
    },
  },
  {
    n: 2,
    name: "Enrichment Agent",
    status: "live",
    purpose:
      "Verify a lead with a public web pass and classify fit (strong/possible/wrong/unclear). Phase 8b.1 calibrated: neutral identity vs SAT-specific evidence + country normalization.",
    input: "One lead (founder-triggered “Verify & Enrich”).",
    output:
      "leads.metadata.enrichment (quality_classification, primary_business, sat_prep_evidence, …).",
    route: "lib/leadEnrichment.js · POST /sales-pipeline/api/enrich",
    nextDep: "Triggers re-score by the Scoring Agent.",
    link: { href: "/sales-pipeline", label: "Sales Pipeline" },
    live: (s) => {
      const t = s.latestByMode && s.latestByMode.enrich;
      const ev = s.latestEventByType && s.latestEventByType.lead_researched;
      if (ev)
        return `Last enrichment: ${ev.payload?.quality_classification || "?"} · ${fmt(
          ev.created_at
        )}`;
      if (t) return `Last enrichment task: ${t.status} · ${fmt(t.created_at)}`;
      return null;
    },
  },
  {
    n: 3,
    name: "Scoring Agent",
    status: "live",
    purpose: "Score lead fit and priority with the fixed Phase 4 rubric (b2b-v1).",
    input: "Lead fields (location, size, website, category, enrichment class).",
    output: "fit_score + priority on the lead, rows in sales_assessments.",
    route: "lib/salesScoring.js (scoreLead) · sales_assessments",
    nextDep: "Prioritizes leads for the Outreach Draft Agent.",
    link: { href: "/sales-pipeline", label: "Sales Pipeline" },
    live: (s) => {
      const ev = s.latestEventByType && s.latestEventByType.lead_scored;
      if (ev)
        return `Last score: fit ${ev.payload?.fit_score ?? "?"} · ${
          ev.payload?.priority ?? "?"
        } · ${fmt(ev.created_at)}`;
      return null;
    },
  },
  {
    n: 4,
    name: "Market Intelligence Agent",
    status: "live",
    purpose:
      "Analyze a lead's PUBLIC marketing/acquisition signals: ads activity, social presence, themes, acquisition sophistication, and a recommended outreach angle. Read-only — links to (never scrapes) the Meta Ad Library.",
    input: "One lead (founder-triggered “Analyze market signals”).",
    output:
      "leads.metadata.market_intelligence (acquisition_stage/score, meta_ads_active, social URLs, outreach angle, …).",
    route: "lib/marketIntelligence.js · POST /sales-pipeline/api/market-intel",
    nextDep: "Informs Contact Intelligence + Outreach Draft angle.",
    link: { href: "/sales-pipeline", label: "Sales Pipeline" },
    live: (s) => {
      const t = s.latestByMode && s.latestByMode.market_intel;
      return t ? `Last market scan: ${t.status} · ${fmt(t.created_at)}` : null;
    },
  },
  {
    n: 5,
    name: "Contact / Decision-Maker Intelligence Agent",
    status: "live",
    purpose:
      "Identify likely decision-makers (founder/owner, admissions or program lead, center manager) and public contact channels for founder-led outreach. Read-only; never hallucinates emails — contacts are grounded in public sources.",
    input: "One lead (founder-triggered “Research contacts”).",
    output:
      "leads.metadata.contact_intelligence (people[], generic_contact_channels, recommended primary contact + next step).",
    route: "lib/contactIntelligence.js · POST /sales-pipeline/api/contact-intel",
    nextDep: "Feeds the Outreach Draft Agent with a target contact.",
    link: { href: "/sales-pipeline", label: "Sales Pipeline" },
    live: (s) => {
      const t = s.latestByMode && s.latestByMode.contact_intel;
      return t ? `Last contact scan: ${t.status} · ${fmt(t.created_at)}` : null;
    },
  },
  {
    n: 6,
    name: "Outreach Draft Agent",
    status: "partial",
    purpose: "Draft personalized outreach for a qualified lead (never sends).",
    input: "Enriched + scored lead (+ contact, once available).",
    output: "Rows in outreach_drafts (status = pending).",
    route: "lib/outreachDraft.js · outreach_drafts (route/shell partially live)",
    nextDep: "Drafts flow to the Approval Agent.",
    link: { href: "/sales-pipeline/approvals", label: "Approvals" },
    live: (s) =>
      s.draftsCount != null ? `Outreach drafts on file: ${s.draftsCount}` : null,
  },
  {
    n: 7,
    name: "Approval Agent",
    status: "live",
    purpose:
      "Human-in-the-loop review: founder approves or rejects drafts. Approve/reject only marks status — nothing is ever sent.",
    input: "Pending outreach drafts / approval_queue items.",
    output: "Approval decisions (status + notes).",
    route: "/sales-pipeline/approvals · approval_queue",
    nextDep: "Approved items hand off to Sending + Follow-up.",
    link: { href: "/sales-pipeline/approvals", label: "Approvals" },
    live: (s) =>
      s.approvalsPendingCount != null
        ? `Pending approvals: ${s.approvalsPendingCount}`
        : null,
  },
  {
    n: 8,
    name: "Sending + Follow-up Agent",
    status: "planned",
    purpose:
      "Send approved outreach and schedule follow-ups on a cadence. Not implemented — no sending anywhere in the system yet.",
    input: "Approved outreach drafts.",
    output: "Sent messages + scheduled follow-up tasks (future).",
    route: "— (planned; sending intentionally not built)",
    nextDep: "Outcomes feed the Outcome Learning Agent.",
    link: null,
    live: () => null,
  },
  {
    n: 9,
    name: "Outcome Learning Agent",
    status: "planned",
    purpose:
      "Learn from replies/outcomes and feed signals back into Discovery, Scoring, and Outreach.",
    input: "Outcome events (replies, conversions, rejections).",
    output: "Learning signals / rubric feedback (future).",
    route: "— (planned)",
    nextDep: "Closes the loop back to the Orchestrator.",
    link: null,
    live: () => null,
  },
];

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.planned;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function Row({ label, children, mono }) {
  return (
    <div style={{ margin: "8px 0 0" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#374151",
          marginTop: 2,
          wordBreak: "break-word",
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            : "inherit",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AgentCard({ agent, signals }) {
  const m = STATUS_META[agent.status] || STATUS_META.planned;
  const latest = agent.live ? agent.live(signals) : null;
  return (
    <div
      style={{
        border: `1px solid ${m.border}`,
        borderLeft: `4px solid ${m.color}`,
        borderRadius: 12,
        padding: 16,
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 999,
              background: "#111827",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {agent.n}
          </span>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "#111827" }}>
            {agent.name}
          </h3>
        </div>
        <StatusPill status={agent.status} />
      </div>

      <p style={{ fontSize: 13, color: "#374151", margin: "10px 0 0", lineHeight: 1.5 }}>
        {agent.purpose}
      </p>

      <Row label="Input">{agent.input}</Row>
      <Row label="Output">{agent.output}</Row>
      <Row label="Implemented route / function" mono>
        {agent.route}
      </Row>
      <Row label="Next dependency">{agent.nextDep}</Row>

      <div style={{ margin: "10px 0 0" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          Latest activity
        </div>
        {latest ? (
          <div
            style={{
              fontSize: 13,
              color: "#065f46",
              marginTop: 2,
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            {latest}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2, fontStyle: "italic" }}>
            No activity recorded yet.
          </div>
        )}
      </div>

      {agent.link && (
        <div style={{ marginTop: 12 }}>
          <Link
            href={agent.link.href}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#2563eb",
              textDecoration: "none",
            }}
          >
            Open {agent.link.label} →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function CommandCenterClient({ signals, loadError }) {
  const s = signals || {};
  const bySource = s.leadsBySource || {};
  const byQuality = s.leadsByQuality || {};

  const wrap = {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    color: "#111827",
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 16px 72px",
  };
  const chip = {
    display: "inline-block",
    fontSize: 12,
    color: "#374151",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "4px 10px",
  };

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <main style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
              Agent Command Center
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "6px 0 0" }}>
              Read-only map of the Founder OS / Sales Agent pipeline. Status + live
              activity only — nothing here triggers an agent.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/sales-pipeline" style={chipLink}>Sales Pipeline</Link>
            <Link href="/sales-pipeline/approvals" style={chipLink}>Approvals</Link>
            <Link href="/monitor" style={chipLink}>SAT Monitor</Link>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              fontSize: 14,
            }}
          >
            Live data could not be loaded — showing the agent map without activity
            overlays.
          </div>
        )}

        {/* ---- Pipeline snapshot (read-only) ------------------------------- */}
        <section
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{s.leadsTotal ?? "—"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 }}>
                Total leads
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(bySource).length > 0 ? (
                Object.entries(bySource).map(([k, v]) => (
                  <span key={k} style={chip}>
                    source: {k} · {v}
                  </span>
                ))
              ) : (
                <span style={{ ...chip, color: "#9ca3af" }}>no source data</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(byQuality).map(([k, v]) => (
                <span key={k} style={chip}>
                  {k}: {v}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Status legend ----------------------------------------------- */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 4px" }}>
          {Object.keys(STATUS_META).map((k) => (
            <StatusPill key={k} status={k} />
          ))}
        </div>

        {/* ---- Agent map --------------------------------------------------- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
            marginTop: 12,
          }}
        >
          {AGENTS.map((a) => (
            <AgentCard key={a.n} agent={a} signals={s} />
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 24 }}>
          Flow: Founder/CEO Orchestrator → Discovery → Enrichment → Scoring → Market
          Intelligence → Contact Intelligence → Outreach Draft → Approval → Sending +
          Follow-up → Outcome Learning. This view is read-only.
        </p>
      </main>
    </div>
  );
}

const chipLink = {
  fontSize: 13,
  fontWeight: 600,
  color: "#2563eb",
  textDecoration: "none",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "8px 12px",
};
