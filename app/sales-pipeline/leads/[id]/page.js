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
import EnrichPanel from "./EnrichPanel";
import MarketIntelPanel from "./MarketIntelPanel";
import ContactIntelPanel from "./ContactIntelPanel";

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

const CLASS_COLORS = {
  strong_fit: "#16a34a",
  possible_fit: "#d97706",
  wrong_category: "#dc2626",
  duplicate_or_unclear: "#6b7280",
};
const CLASS_LABELS = {
  strong_fit: "Strong fit",
  possible_fit: "Possible fit",
  wrong_category: "Wrong category — not a SAT lead",
  duplicate_or_unclear: "Unclear / needs review",
};

function Social({ label, url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13, marginRight: 12 }}>
      {label}
    </a>
  );
}

function EnrichmentSection({ lead }) {
  const e = lead && lead.metadata && lead.metadata.enrichment;
  return (
    <section style={card}>
      <h2 style={sectionTitle}>Enrichment & verification</h2>

      {/* Founder-triggered button (no auto-run) */}
      <EnrichPanel leadId={lead.id} alreadyEnriched={Boolean(e)} />

      {!e && (
        <p style={{ ...emptyState, marginTop: 12 }}>
          Not enriched yet. Run a public-web verification to confirm website,
          category, location and SAT-prep fit.
        </p>
      )}

      {e && (
        <div style={{ marginTop: 14 }}>
          {e.quality_classification === "wrong_category" && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Not a SAT lead — kept visible for QA. {e.explanation || ""}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <Badge
              text={CLASS_LABELS[e.quality_classification] || e.quality_classification}
              color={CLASS_COLORS[e.quality_classification]}
            />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              Enriched {fmt(e.enriched_at)}
            </span>
            {e.task_id ? (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>
                · Task <code>{e.task_id}</code>
              </span>
            ) : null}
          </div>

          <Grid>
            <Field label="Real business">{e.is_real_business === null ? "—" : String(e.is_real_business)}</Field>
            <Field label="Offers SAT prep">{e.offers_sat_prep === null ? "—" : String(e.offers_sat_prep)}</Field>
            <Field label="Primary business">{e.primary_business || "—"}</Field>
            <Field label="Verified website">
              {e.verified_website ? (
                <a href={e.verified_website} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{e.verified_website}</a>
              ) : null}
            </Field>
            <Field label="Contact page">
              {e.contact_page_url ? (
                <a href={e.contact_page_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{e.contact_page_url}</a>
              ) : null}
            </Field>
            <Field label="Verified location">
              {[e.location && e.location.city, e.location && e.location.state, e.location && e.location.country].filter(Boolean).join(", ")}
            </Field>
            <Field label="Category confidence">
              {e.confidence && e.confidence.category != null ? e.confidence.category : "—"}
            </Field>
          </Grid>

          {(e.socials && (e.socials.linkedin || e.socials.instagram || e.socials.facebook || e.socials.youtube)) ? (
            <>
              <div style={fieldLabel}>Public social profiles</div>
              <div style={{ marginBottom: 12 }}>
                <Social label="LinkedIn" url={e.socials.linkedin} />
                <Social label="Instagram" url={e.socials.instagram} />
                <Social label="Facebook" url={e.socials.facebook} />
                <Social label="YouTube" url={e.socials.youtube} />
              </div>
            </>
          ) : null}

          {Array.isArray(e.marketing_signals) && e.marketing_signals.length > 0 ? (
            <>
              <div style={fieldLabel}>Marketing signals</div>
              <ul style={{ margin: "2px 0 12px", paddingLeft: 18, fontSize: 13, color: "#374151" }}>
                {e.marketing_signals.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </>
          ) : null}

          {e.explanation && e.quality_classification !== "wrong_category" ? (
            <>
              <div style={fieldLabel}>Why this classification</div>
              <div style={codeBox}>{e.explanation}</div>
            </>
          ) : null}

          {Array.isArray(e.sat_prep_evidence) && e.sat_prep_evidence.length > 0 ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>SAT-prep evidence (public sources)</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {e.sat_prep_evidence.map((ev, i) => (
                  <li key={i}>
                    <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{ev.url}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {Array.isArray(e.evidence) && e.evidence.length > 0 ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>Supporting sources (public)</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {e.evidence.map((ev, i) => (
                  <li key={i}>
                    <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{ev.url}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

const MI_STAGE_COLORS = {
  high: "#16a34a",
  medium: "#d97706",
  low: "#6b7280",
  unknown: "#94a3b8",
};

function MarketIntelligenceSection({ lead }) {
  const m = lead && lead.metadata && lead.metadata.market_intelligence;
  return (
    <section style={card}>
      <h2 style={sectionTitle}>Market intelligence</h2>

      {/* Founder-triggered button (no auto-run, single lead) */}
      <MarketIntelPanel leadId={lead.id} alreadyAnalyzed={Boolean(m)} />

      {!m && (
        <p style={{ ...emptyState, marginTop: 12 }}>
          Not analyzed yet. Run a public-web scan to see ads/marketing signals,
          social presence, acquisition sophistication, and a recommended outreach
          angle.
        </p>
      )}

      {m && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <Badge
              text={`acquisition: ${m.acquisition_stage || "unknown"}`}
              color={MI_STAGE_COLORS[m.acquisition_stage] || "#94a3b8"}
            />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              Analyzed {fmt(m.created_at)}
              {m.task_id ? (
                <> · Task <code>{m.task_id}</code></>
              ) : null}
            </span>
          </div>

          <Grid>
            <Field label="Acquisition score">{m.acquisition_score ?? "—"}</Field>
            <Field label="Meta ads active">
              {m.meta_ads_active === null || m.meta_ads_active === undefined
                ? "unknown"
                : String(m.meta_ads_active)}
            </Field>
            <Field label="Active ad count (est.)">
              {m.active_ad_count_estimate ?? "unknown"}
            </Field>
            <Field label="Confidence">{m.confidence ?? "—"}</Field>
          </Grid>

          {Array.isArray(m.ad_platforms_seen) && m.ad_platforms_seen.length > 0 ? (
            <>
              <div style={fieldLabel}>Ad platforms seen</div>
              <div style={{ ...fieldValue }}>{m.ad_platforms_seen.join(", ")}</div>
            </>
          ) : null}

          {Array.isArray(m.ad_themes) && m.ad_themes.length > 0 ? (
            <>
              <div style={fieldLabel}>Marketing / ad themes</div>
              <ul style={{ margin: "2px 0 12px", paddingLeft: 18, fontSize: 13, color: "#374151" }}>
                {m.ad_themes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </>
          ) : null}

          {(m.facebook_url || m.instagram_url || m.youtube_url || m.linkedin_url || m.x_url) ? (
            <>
              <div style={fieldLabel}>Public social profiles</div>
              <div style={{ marginBottom: 12 }}>
                <Social label="Facebook" url={m.facebook_url} />
                <Social label="Instagram" url={m.instagram_url} />
                <Social label="YouTube" url={m.youtube_url} />
                <Social label="LinkedIn" url={m.linkedin_url} />
                <Social label="X" url={m.x_url} />
              </div>
            </>
          ) : null}

          {m.ad_library_url ? (
            <>
              <div style={fieldLabel}>Meta Ad Library (public search)</div>
              <div style={{ marginBottom: 12 }}>
                <a href={m.ad_library_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontSize: 13, wordBreak: "break-all" }}>
                  {m.ad_library_url}
                </a>
              </div>
            </>
          ) : null}

          {m.social_activity_summary ? (
            <>
              <div style={fieldLabel}>Social activity summary</div>
              <div style={fieldValue}>{m.social_activity_summary}</div>
            </>
          ) : null}

          {m.recommended_outreach_angle ? (
            <>
              <div style={fieldLabel}>Recommended outreach angle</div>
              <div style={codeBox}>{m.recommended_outreach_angle}</div>
            </>
          ) : null}

          {m.explanation ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>Why this assessment</div>
              <div style={codeBox}>{m.explanation}</div>
            </>
          ) : null}

          {Array.isArray(m.evidence_urls) && m.evidence_urls.length > 0 ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>Evidence (public sources)</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {m.evidence_urls.map((ev, i) => (
                  <li key={i}>
                    <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{ev.url}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ContactIntelligenceSection({ lead }) {
  const c = lead && lead.metadata && lead.metadata.contact_intelligence;
  const gc = (c && c.generic_contact_channels) || {};
  const hasGeneric =
    gc.website_contact_url || gc.general_email || gc.phone || gc.contact_form_url || gc.admissions_url;
  return (
    <section style={card}>
      <h2 style={sectionTitle}>Contact &amp; decision-maker intelligence</h2>

      {/* Founder-triggered button (no auto-run, single lead) */}
      <ContactIntelPanel leadId={lead.id} alreadyResearched={Boolean(c)} />

      {!c && (
        <p style={{ ...emptyState, marginTop: 12 }}>
          Not researched yet. Run a public-web scan to surface likely decision-makers
          (founder/owner, admissions or program lead, center manager) and public
          contact channels for founder-led outreach.
        </p>
      )}

      {c && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <Badge
              text={`${c.contacts_found_count ?? 0} contact${c.contacts_found_count === 1 ? "" : "s"}`}
              color={c.contacts_found_count > 0 ? "#0d9488" : "#6b7280"}
            />
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              Researched {fmt(c.created_at)}
              {c.task_id ? (
                <> · Task <code>{c.task_id}</code></>
              ) : null}
            </span>
          </div>

          <Grid>
            <Field label="Decision-maker confidence">
              {c.decision_maker_confidence ?? "—"}
            </Field>
            <Field label="Recommended primary contact">
              {c.recommended_primary_contact || "—"}
            </Field>
          </Grid>

          {c.recommended_contact_reason ? (
            <>
              <div style={fieldLabel}>Why this contact</div>
              <div style={fieldValue}>{c.recommended_contact_reason}</div>
            </>
          ) : null}

          {/* ---- Named people (separate from generic channels) ------------- */}
          {Array.isArray(c.people) && c.people.length > 0 ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 6 }}>People</div>
              <div style={{ marginBottom: 12 }}>
                {c.people.map((p, i) => (
                  <div key={i} style={{ border: "1px solid #eef2f7", borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                      {p.title ? <span style={{ fontSize: 13, color: "#374151" }}>· {p.title}</span> : null}
                      {p.role_type ? <Badge text={p.role_type} color="#475569" /> : null}
                      {p.confidence != null ? (
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>conf {p.confidence}</span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      {p.linkedin_url ? (
                        <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", marginRight: 12 }}>LinkedIn</a>
                      ) : null}
                      {p.email ? (
                        <a href={`mailto:${p.email}`} style={{ color: "#2563eb", marginRight: 12 }}>{p.email}</a>
                      ) : null}
                      {p.phone ? <span style={{ color: "#374151", marginRight: 12 }}>{p.phone}</span> : null}
                      {p.source_url ? (
                        <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>source</a>
                      ) : null}
                    </div>
                    {p.notes ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>{p.notes}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ ...emptyState, margin: "6px 0 12px" }}>
              No named decision-maker found — use the generic contact channels below.
            </p>
          )}

          {/* ---- Generic contact channels (separate from named people) ----- */}
          {hasGeneric ? (
            <>
              <div style={fieldLabel}>Generic contact channels</div>
              <ul style={{ margin: "2px 0 12px", paddingLeft: 18, fontSize: 13 }}>
                {gc.website_contact_url ? <li><a href={gc.website_contact_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>Contact page</a></li> : null}
                {gc.contact_form_url ? <li><a href={gc.contact_form_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>Contact form</a></li> : null}
                {gc.admissions_url ? <li><a href={gc.admissions_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>Admissions page</a></li> : null}
                {gc.general_email ? <li><a href={`mailto:${gc.general_email}`} style={{ color: "#2563eb" }}>{gc.general_email}</a></li> : null}
                {gc.phone ? <li>{gc.phone}</li> : null}
              </ul>
            </>
          ) : (
            <p style={{ ...emptyState, margin: "6px 0 12px" }}>No public generic contact channels found.</p>
          )}

          {c.recommended_next_step ? (
            <>
              <div style={fieldLabel}>Recommended next step</div>
              <div style={codeBox}>{c.recommended_next_step}</div>
            </>
          ) : null}

          {c.explanation ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>Notes</div>
              <div style={codeBox}>{c.explanation}</div>
            </>
          ) : null}

          {Array.isArray(c.evidence_urls) && c.evidence_urls.length > 0 ? (
            <>
              <div style={{ ...fieldLabel, marginTop: 10 }}>Evidence (public sources)</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13 }}>
                {c.evidence_urls.map((ev, i) => (
                  <li key={i}>
                    <a href={ev.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{ev.url}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}
    </section>
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

      {/* ---- Enrichment & verification (Phase 8b) -------------------------- */}
      <EnrichmentSection lead={lead} />

      {/* ---- Market intelligence (Phase 9) -------------------------------- */}
      <MarketIntelligenceSection lead={lead} />

      {/* ---- Contact & decision-maker intelligence (Phase 10) ------------- */}
      <ContactIntelligenceSection lead={lead} />

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
