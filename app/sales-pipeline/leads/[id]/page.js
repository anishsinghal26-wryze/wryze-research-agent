// ============================================================================
// app/sales-pipeline/leads/[id]/page.js   (URL: /sales-pipeline/leads/:id)
// ----------------------------------------------------------------------------
// Phase 7: READ-ONLY Lead Detail + Activity Timeline.
//
// Server component. Gated by the SAME sp_auth cookie as /sales-pipeline (the
// cookie is path-scoped to /sales-pipeline, so this nested route is covered).
// All data is read server-side via getLeadDetail(id) — one SSR Supabase bundle,
// no new API route. Never writes, never sends. Editing stays in the dashboard
// drawer + PATCH route. Bad/absent id renders a clean "Lead not found" state.
// ============================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import LoginForm from "../../LoginForm";
import { getLeadDetail } from "../../../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead Detail · Wryze.ai",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STAGE_COLORS = {
  New: "#64748b",
  Qualified: "#0ea5e9",
  Contacted: "#6366f1",
  "Follow-up": "#f59e0b",
  Interested: "#10b981",
  Closed: "#334155",
};
const PRIORITY_COLORS = { High: "#dc2626", Medium: "#d97706", Low: "#6b7280" };
const RISK_COLORS = {
  low: "#10b981",
  medium: "#d97706",
  high: "#dc2626",
  critical: "#7f1d1d",
  blocked: "#334155",
};
const STATUS_COLORS = {
  pending: "#d97706",
  approved: "#16a34a",
  rejected: "#dc2626",
  expired: "#6b7280",
};
const TASK_STATUS_COLORS = {
  pending: "#64748b",
  running: "#0ea5e9",
  completed: "#16a34a",
  failed: "#dc2626",
  needs_approval: "#d97706",
  cancelled: "#6b7280",
};

const PAGE_BG = "#f8fafc";
const wrap = {
  fontFamily:
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  color: "#111827",
  maxWidth: 980,
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
const sectionTitle = { fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 12px" };
const fieldLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: 0.3,
  margin: "0 0 2px",
};
const fieldValue = { fontSize: 14, color: "#111827", margin: "0 0 12px", wordBreak: "break-word" };
const emptyState = { fontSize: 14, color: "#9ca3af", fontStyle: "italic" };
const codeBox = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 13,
  color: "#1f2937",
  background: "#f9fafb",
  border: "1px solid #eef2f7",
  borderRadius: 8,
  padding: 10,
  margin: "4px 0 0",
  maxHeight: 220,
  overflow: "auto",
};

function Badge({ text, color }) {
  if (text === null || text === undefined || text === "") return <span style={fieldValue}>—</span>;
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
      {String(text)}
    </span>
  );
}

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function Field({ label, children }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div style={fieldValue}>{children === null || children === undefined || children === "" ? "—" : children}</div>
    </div>
  );
}

function Grid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "0 24px",
      }}
    >
      {children}
    </div>
  );
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  try {
    const s = JSON.stringify(payload);
    return s === "{}" ? "" : s.length > 240 ? s.slice(0, 240) + "…" : s;
  } catch {
    return "";
  }
}

function Shell({ children }) {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <main style={wrap}>{children}</main>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/sales-pipeline"
      style={{ color: "#2563eb", fontSize: 14, textDecoration: "none", fontWeight: 600 }}
    >
      ← Back to Sales Pipeline
    </Link>
  );
}

export default async function LeadDetailPage({ params }) {
  // ---- Auth gate (same cookie + pattern as /sales-pipeline) ----------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;
  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const { id } = await params;

  // ---- Validate id before touching the DB ----------------------------------
  if (!id || !UUID_RE.test(String(id))) {
    return (
      <Shell>
        <BackLink />
        <div style={{ ...card, marginTop: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Lead not found</h1>
          <p style={emptyState}>That lead id is not valid.</p>
        </div>
      </Shell>
    );
  }

  const detail = await getLeadDetail(id);

  // ---- Distinguish DB load error from a missing lead -----------------------
  if (detail === null) {
    return (
      <Shell>
        <BackLink />
        <div
          role="alert"
          style={{ ...card, marginTop: 16, borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
        >
          Could not load this lead right now. Please try again.
        </div>
      </Shell>
    );
  }
  if (!detail.found) {
    return (
      <Shell>
        <BackLink />
        <div style={{ ...card, marginTop: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Lead not found</h1>
          <p style={emptyState}>No lead exists with that id.</p>
        </div>
      </Shell>
    );
  }

  const { lead, assessment, drafts, approvals, events, tasks } = detail;
  const location = [lead.city, lead.state, lead.country].filter(Boolean).join(", ");

  return (
    <Shell>
      <div style={{ marginBottom: 14 }}>
        <BackLink />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
          {lead.institute_name || "(unnamed lead)"}
        </h1>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge text={lead.priority} color={PRIORITY_COLORS[lead.priority]} />
          <Badge text={lead.pipeline_stage} color={STAGE_COLORS[lead.pipeline_stage]} />
        </span>
      </div>
      {lead.website ? (
        <p style={{ margin: "0 0 18px" }}>
          <a href={lead.website} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 14 }}>
            {lead.website}
          </a>
        </p>
      ) : (
        <div style={{ marginBottom: 18 }} />
      )}

      {/* ---- Profile -------------------------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Lead profile</h2>
        <Grid>
          <Field label="Institute name">{lead.institute_name}</Field>
          <Field label="Lead type">{lead.lead_type}</Field>
          <Field label="Contact person">{lead.contact_person}</Field>
          <Field label="Contact email">
            {lead.contact_email ? (
              <a href={`mailto:${lead.contact_email}`} style={{ color: "#2563eb" }}>{lead.contact_email}</a>
            ) : null}
          </Field>
          <Field label="Contact link">
            {lead.contact_link ? (
              <a href={lead.contact_link} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{lead.contact_link}</a>
            ) : null}
          </Field>
          <Field label="Location">{location}</Field>
          <Field label="Category">{lead.category}</Field>
          <Field label="Estimated size">{lead.estimated_size}</Field>
        </Grid>
      </section>

      {/* ---- Pipeline / scoring -------------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Pipeline & scoring</h2>
        <Grid>
          <Field label="Stage"><Badge text={lead.pipeline_stage} color={STAGE_COLORS[lead.pipeline_stage]} /></Field>
          <Field label="Priority"><Badge text={lead.priority} color={PRIORITY_COLORS[lead.priority]} /></Field>
          <Field label="Fit score">{lead.fit_score ?? "—"}</Field>
          <Field label="Source">{lead.source}</Field>
          <Field label="Created">{fmt(lead.created_at)}</Field>
          <Field label="Updated">{fmt(lead.updated_at)}</Field>
        </Grid>
        {lead.notes ? (
          <>
            <div style={fieldLabel}>Notes</div>
            <div style={codeBox}>{lead.notes}</div>
          </>
        ) : null}
      </section>

      {/* ---- Latest sales assessment --------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Latest sales assessment</h2>
        {assessment ? (
          <>
            <Grid>
              <Field label="Fit score">{assessment.fit_score ?? "—"}</Field>
              <Field label="Priority"><Badge text={assessment.priority} color={PRIORITY_COLORS[assessment.priority]} /></Field>
              <Field label="Lead type">{assessment.lead_type}</Field>
              <Field label="Rubric">{assessment.rubric_version}</Field>
              <Field label="Assessed">{fmt(assessment.created_at)}</Field>
            </Grid>
            {assessment.rationale ? (
              <>
                <div style={fieldLabel}>Rationale</div>
                <div style={codeBox}>{assessment.rationale}</div>
              </>
            ) : null}
            {assessment.signals && Object.keys(assessment.signals).length > 0 ? (
              <>
                <div style={{ ...fieldLabel, marginTop: 10 }}>Signals</div>
                <div style={codeBox}>{JSON.stringify(assessment.signals, null, 2)}</div>
              </>
            ) : null}
          </>
        ) : (
          <p style={emptyState}>No sales assessment yet for this lead.</p>
        )}
      </section>

      {/* ---- Outreach drafts ----------------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Outreach drafts ({drafts.length})</h2>
        {drafts.length === 0 ? (
          <p style={emptyState}>No outreach drafts for this lead.</p>
        ) : (
          drafts.map((d) => (
            <div key={d.id} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <Badge text={d.status} color={STATUS_COLORS[d.status]} />
                <Badge text={`risk: ${d.risk_level}`} color={RISK_COLORS[d.risk_level]} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{d.channel}</span>
                <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{fmt(d.created_at)}</span>
              </div>
              {d.subject ? <div style={{ fontSize: 14, fontWeight: 600 }}>{d.subject}</div> : null}
              <div style={codeBox}>{d.body || "(no body)"}</div>
            </div>
          ))
        )}
      </section>

      {/* ---- Approvals & decisions ----------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Approvals & decisions ({approvals.length})</h2>
        {approvals.length === 0 ? (
          <p style={emptyState}>No approval items for this lead.</p>
        ) : (
          approvals.map((a) => (
            <div key={a.id} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <Badge text={a.status} color={STATUS_COLORS[a.status]} />
                <Badge text={`risk: ${a.risk_level}`} color={RISK_COLORS[a.risk_level]} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{a.entity_type}</span>
                <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{fmt(a.created_at)}</span>
              </div>
              {a.summary ? <div style={{ fontSize: 14 }}>{a.summary}</div> : null}
              {a.decision_notes ? (
                <>
                  <div style={{ ...fieldLabel, marginTop: 8 }}>Decision notes</div>
                  <div style={codeBox}>{a.decision_notes}</div>
                </>
              ) : null}
              {a.reviewed_at ? (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Reviewed {fmt(a.reviewed_at)}</div>
              ) : null}
            </div>
          ))
        )}
      </section>

      {/* ---- Events timeline ----------------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Events timeline (latest {events.length})</h2>
        {events.length === 0 ? (
          <p style={emptyState}>No events recorded for this lead.</p>
        ) : (
          <div>
            {events.map((e) => {
              const sum = summarizePayload(e.payload);
              return (
                <div key={e.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 12, color: "#9ca3af", minWidth: 150 }}>{fmt(e.created_at)}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{e.event_type}</span>
                    {sum ? <div style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-word" }}>{sum}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Agent tasks --------------------------------------------------- */}
      <section style={card}>
        <h2 style={sectionTitle}>Agent tasks (latest {tasks.length})</h2>
        {tasks.length === 0 ? (
          <p style={emptyState}>No agent tasks for this lead.</p>
        ) : (
          <div>
            {tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "#9ca3af", minWidth: 150 }}>{fmt(t.created_at)}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.agent_type}</span>
                <Badge text={t.status} color={TASK_STATUS_COLORS[t.status]} />
                {t.completed_at ? (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>done {fmt(t.completed_at)}</span>
                ) : null}
                {t.error ? <span style={{ fontSize: 12, color: "#b91c1c" }}>{t.error}</span> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ marginTop: 8 }}>
        <BackLink />
      </div>
    </Shell>
  );
}
