"use client";

// ============================================================================
// SalesPipelineClient.jsx
// ----------------------------------------------------------------------------
// The whole dashboard UI lives here. It is a "client component" (note the
// "use client" line at the very top) because it uses interactivity: clicking
// rows, typing in filters, changing dropdowns. In Next.js App Router, any
// component that uses useState/onClick must be a client component.
//
// Everything is styled with plain inline styles so it does NOT depend on
// Tailwind, CSS files, or any other library. Nothing here can affect or break
// the styles of the rest of your app.
//
// v1 keeps all data in memory (React state). Editing a lead's status or notes
// updates the screen but does not save to a database yet -- that comes later.
// ============================================================================

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  SAMPLE_LEADS,
  PIPELINE_STAGES,
  CATEGORIES,
} from "./leadsData";
import DiscoverPanel from "./DiscoverPanel";

// A color for each pipeline stage, used by the status badges.
const STAGE_COLORS = {
  New: "#64748b", // slate
  Qualified: "#0ea5e9", // sky
  Contacted: "#6366f1", // indigo
  "Follow-up": "#f59e0b", // amber
  Interested: "#10b981", // green
  Closed: "#334155", // dark slate
};

// A color for each priority label.
const PRIORITY_COLORS = {
  High: "#dc2626", // red
  Medium: "#d97706", // amber
  Low: "#6b7280", // gray
};

// Phase 8b: quality classification from lead enrichment (metadata).
const QUALITY_COLORS = {
  strong_fit: "#16a34a",
  possible_fit: "#d97706",
  wrong_category: "#dc2626",
  duplicate_or_unclear: "#6b7280",
};
const QUALITY_LABELS = {
  strong_fit: "Strong fit",
  possible_fit: "Possible fit",
  wrong_category: "Wrong category",
  duplicate_or_unclear: "Unclear",
};

// Small reusable colored "pill" / badge.
function Badge({ text, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        backgroundColor: color || "#6b7280",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// A small colored bar that visually represents the 0-100 fit score.
function ScoreBar({ score }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#9ca3af";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 70,
          height: 8,
          borderRadius: 999,
          backgroundColor: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            backgroundColor: color,
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {score}
      </span>
    </div>
  );
}

export default function SalesPipelineClient({ initialLeads }) {
  // The list of leads is held in state so we can edit status/notes live.
  // Phase 2: real leads arrive from the server (Supabase).
  // Use the server-provided array as-is. Empty means empty/error, not dummy data.
  const [leads, setLeads] = useState(initialLeads ?? SAMPLE_LEADS);

  // Filter controls.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  // Which lead is open in the detail card (null = none).
  const [selectedId, setSelectedId] = useState(null);

  // Phase 2.1: persistence robustness.
  // saveError surfaces failed saves instead of silently swallowing them.
  // saveTimers debounces free-text saves so only the final value is sent.
  const [saveError, setSaveError] = useState("");
  const saveTimers = useRef({});

  // ---- Filtering -----------------------------------------------------------
  // useMemo recalculates the filtered list only when something it depends on
  // changes, which keeps things fast.
  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch =
        term === "" ||
        lead.instituteName.toLowerCase().includes(term) ||
        (lead.city || "").toLowerCase().includes(term) ||
        (lead.state || "").toLowerCase().includes(term) ||
        (lead.contactPerson || "").toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === "All" || lead.status === statusFilter;
      const matchesCategory =
        categoryFilter === "All" || lead.category === categoryFilter;
      const matchesPriority =
        priorityFilter === "All" || lead.priority === priorityFilter;
      return (
        matchesSearch && matchesStatus && matchesCategory && matchesPriority
      );
    });
  }, [leads, search, statusFilter, categoryFilter, priorityFilter]);

  // The currently open lead object (or undefined).
  const selectedLead = leads.find((l) => l.id === selectedId);

  // ---- Editing helpers -----------------------------------------------------
  // Map the dashboard's field names to the API / DB field names.
  const FIELD_TO_API = {
    status: "pipeline_stage",
    notes: "notes",
    outreachDraft: "outreach_draft",
  };

  // Persist a single field to Supabase via the gated PATCH route.
  // Surfaces failures via saveError instead of swallowing them.
  async function persistField(id, apiField, value) {
    try {
      const res = await fetch(`/sales-pipeline/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [apiField]: value }),
      });

      if (!res.ok) {
        let msg = `Save failed (HTTP ${res.status}).`;
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {}
        setSaveError(msg);
        return;
      }

      setSaveError("");
    } catch {
      setSaveError(
        "Save failed — network error. Your change is on screen but not yet saved."
      );
    }
  }

  // Update a single field in state immediately, then persist it.
  // Status saves immediately. Notes/outreach draft are debounced.
  function updateLead(id, field, value) {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );

    const apiField = FIELD_TO_API[field];
    if (!apiField) return;

    if (field === "status") {
      persistField(id, apiField, value);
      return;
    }

    const key = `${id}:${field}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);

    saveTimers.current[key] = setTimeout(() => {
      persistField(id, apiField, value);
      delete saveTimers.current[key];
    }, 500);
  }

  // Log out: ask the server to clear the login cookie, then reload the page.
  // Reloading re-runs the server check in page.js, which now finds no cookie
  // and shows the password screen again.
  async function handleLogout() {
    try {
      await fetch("/sales-pipeline/api/logout", { method: "POST" });
    } catch (e) {
      // Even if the request hiccups, still send the user back to the gate.
    }
    window.location.href = "/sales-pipeline";
  }

  // Count leads in each stage, for the little summary row at the top.
  const stageCounts = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: leads.filter((l) => l.status === stage).length,
  }));

  // Reusable style for the filter dropdowns / inputs.
  const controlStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    backgroundColor: "#fff",
    color: "#111827",
  };

  return (
    <div
      style={{
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        color: "#111827",
        maxWidth: 1200,
        margin: "0 auto",
        padding: "24px 16px 64px",
      }}
    >
      {saveError && (
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
          {saveError}
        </div>
      )}
      {/* Header ------------------------------------------------------------ */}
      <header
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
            Sales Pipeline Agent
          </h1>
          <p style={{ color: "#6b7280", marginTop: 6, fontSize: 14 }}>
            Internal dashboard · Wryze.ai B2B outreach to SAT institutes ·{" "}
            {leads.length} leads
          </p>
          <Link
            href="/sales-pipeline/follow-ups"
            style={{
              display: "inline-block",
              marginTop: 8,
              color: "#2563eb",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Follow-ups CRM →
          </Link>
        </div>

        {/* Logout button: clears the login cookie, then reloads so the
            password screen appears again. */}
        <button
          type="button"
          onClick={handleLogout}
          style={{
            flex: "0 0 auto",
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            backgroundColor: "#fff",
            color: "#374151",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </header>

      {/* Discover Real Leads (Phase 8) ------------------------------------ */}
      <DiscoverPanel />

      {/* Stage summary ----------------------------------------------------- */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        {stageCounts.map(({ stage, count }) => (
          <div
            key={stage}
            style={{
              flex: "1 1 140px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "10px 14px",
              backgroundColor: "#fafafa",
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <Badge text={stage} color={STAGE_COLORS[stage]} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Filters ----------------------------------------------------------- */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Search institute, city, contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...controlStyle, flex: "1 1 240px", minWidth: 200 }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={controlStyle}
        >
          <option value="All">All statuses</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={controlStyle}
        >
          <option value="All">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={controlStyle}
        >
          <option value="All">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      {/* Leads table ------------------------------------------------------- */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
              minWidth: 820,
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", textAlign: "left" }}>
                <Th>Institute</Th>
                <Th>Location</Th>
                <Th>Category</Th>
                <Th>Size</Th>
                <Th>Fit score</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  style={{
                    borderTop: "1px solid #f1f5f9",
                    cursor: "pointer",
                    backgroundColor:
                      selectedId === lead.id ? "#eff6ff" : "transparent",
                  }}
                >
                  <Td>
                    <Link
                      href={`/sales-pipeline/leads/${lead.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        fontWeight: 600,
                        color: "#2563eb",
                        textDecoration: "none",
                      }}
                    >
                      {lead.instituteName}
                    </Link>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {lead.contactPerson}
                    </div>
                    {lead.quality ? (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 4,
                          padding: "1px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#fff",
                          backgroundColor: QUALITY_COLORS[lead.quality] || "#6b7280",
                        }}
                      >
                        {QUALITY_LABELS[lead.quality] || lead.quality}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {lead.city}
                    {lead.state ? `, ${lead.state}` : ""}
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {lead.country}
                    </div>
                  </Td>
                  <Td>{lead.category}</Td>
                  <Td>{lead.estimatedSize}</Td>
                  <Td>
                    <ScoreBar score={lead.satFitScore} />
                  </Td>
                  <Td>
                    <Badge
                      text={lead.priority}
                      color={PRIORITY_COLORS[lead.priority]}
                    />
                  </Td>
                  <Td>
                    <Badge
                      text={lead.status}
                      color={STAGE_COLORS[lead.status]}
                    />
                  </Td>
                </tr>
              ))}

              {filteredLeads.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "#6b7280",
                    }}
                  >
                    No leads match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 10 }}>
        Tip: click any row to open the lead detail card.
      </p>

      {/* Lead detail card -------------------------------------------------- */}
      {selectedLead && (
        <LeadDetailCard
          lead={selectedLead}
          onClose={() => setSelectedId(null)}
          onUpdate={updateLead}
        />
      )}
    </div>
  );
}

// Table header cell.
function Th({ children }) {
  return (
    <th
      style={{
        padding: "12px 14px",
        fontSize: 12,
        fontWeight: 700,
        color: "#6b7280",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  );
}

// Table body cell.
function Td({ children }) {
  return (
    <td style={{ padding: "12px 14px", verticalAlign: "top" }}>{children}</td>
  );
}

// ----------------------------------------------------------------------------
// The detail card. Slides in as an overlay panel on the right. Lets you read
// every field and edit status / notes / outreach draft. Edits are live in
// memory (not yet saved to a database).
// ----------------------------------------------------------------------------
function LeadDetailCard({ lead, onClose, onUpdate }) {
  const labelStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  };
  const valueStyle = { fontSize: 14, marginBottom: 14, color: "#111827" };

  return (
    // Dark backdrop. Clicking it closes the card.
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      {/* The panel. stopPropagation prevents clicks inside from closing it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          height: "100%",
          backgroundColor: "#fff",
          boxShadow: "-8px 0 24px rgba(0,0,0,0.15)",
          padding: 24,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {lead.instituteName}
          </h2>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "#f3f4f6",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              color: "#374151",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={labelStyle}>Website</div>
        <div style={valueStyle}>
          {lead.website ? (
            <a
              href={lead.website}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#2563eb" }}
            >
              {lead.website}
            </a>
          ) : (
            "—"
          )}
        </div>

        <div style={labelStyle}>Location</div>
        <div style={valueStyle}>
          {lead.city}
          {lead.state ? `, ${lead.state}` : ""} · {lead.country}
        </div>

        <div style={labelStyle}>Category</div>
        <div style={valueStyle}>{lead.category}</div>

        <div style={labelStyle}>Estimated size</div>
        <div style={valueStyle}>{lead.estimatedSize}</div>

        <div style={labelStyle}>Contact person</div>
        <div style={valueStyle}>{lead.contactPerson || "—"}</div>

        <div style={labelStyle}>Contact email</div>
        <div style={valueStyle}>
          {lead.contactEmail ? (
            <a href={`mailto:${lead.contactEmail}`} style={{ color: "#2563eb" }}>
              {lead.contactEmail}
            </a>
          ) : (
            "—"
          )}
        </div>

        <div style={labelStyle}>LinkedIn / contact page</div>
        <div style={valueStyle}>
          {lead.contactLink ? (
            <a
              href={lead.contactLink}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#2563eb" }}
            >
              {lead.contactLink}
            </a>
          ) : (
            "—"
          )}
        </div>

        <div style={labelStyle}>SAT fit score</div>
        <div style={valueStyle}>
          <ScoreBar score={lead.satFitScore} /> &nbsp; ({lead.priority}{" "}
          priority)
        </div>

        {/* Editable: status -------------------------------------------------*/}
        <div style={labelStyle}>Status</div>
        <select
          value={lead.status}
          onChange={(e) => onUpdate(lead.id, "status", e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Editable: notes --------------------------------------------------*/}
        <div style={labelStyle}>Notes</div>
        <textarea
          value={lead.notes}
          onChange={(e) => onUpdate(lead.id, "notes", e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            marginBottom: 16,
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />

        {/* Editable: outreach draft ----------------------------------------*/}
        <div style={labelStyle}>Outreach draft</div>
        <textarea
          value={lead.outreachDraft}
          onChange={(e) => onUpdate(lead.id, "outreachDraft", e.target.value)}
          rows={5}
          placeholder="Draft your outreach email here. (Auto-generation comes in a later version.)"
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            resize: "vertical",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />

        <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 14 }}>
          Edits are live on screen for now. Saving to a database comes in a
          later version.
        </p>
      </div>
    </div>
  );
}
