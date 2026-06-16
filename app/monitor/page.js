"use client";

// A clean, read-only status dashboard for humans.
// It reads the LAST saved run from /api/latest (no secret needed, no side
// effects). The Refresh button just re-fetches that data.
// /api/run-now is left completely untouched for raw JSON.

import { useState, useEffect } from "react";

export default function MonitorPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/latest", { cache: "no-store" });
      const data = await res.json();
      // /api/latest returns { brief, runStatus, sources }.
      // runStatus has the same shape as status in /api/run-now.
      setStatus(data.runStatus || null);
    } catch (err) {
      setError("Could not load status. Please try again.");
    }
    setLoading(false);
  }

  const sources = (status && status.sourceStatuses) || [];
  const hasChanges = status && status.changedCount > 0;

  return (
    <main className="page">
      <div className="header">
        <h1>SAT Monitor</h1>
        <button className="refresh" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {loading && !status && <p className="muted">Loading…</p>}

      {!loading && !status && !error && (
        <div className="card">
          <p className="muted">
            No checks have run yet. Once the monitor runs, the latest status
            will appear here.
          </p>
        </div>
      )}

      {status && (
        <>
          {/* Summary card */}
          <div className={`card summary ${hasChanges ? "amber" : "green"}`}>
            <div className="summaryTop">
              <span className={`badge ${hasChanges ? "badge-amber" : "badge-green"}`}>
                {hasChanges ? "Changes found" : "No major changes"}
              </span>
              <span className="time">Last checked: {formatTime(status.time)}</span>
            </div>
            <div className="metric">
              <span className="metricNumber">{status.changedCount ?? 0}</span>
              <span className="metricLabel">source(s) changed</span>
            </div>
            {status.message && <p className="message">{status.message}</p>}
          </div>

          {/* Per-source cards */}
          <h2 className="sectionTitle">Sources ({sources.length})</h2>
          <div className="grid">
            {sources.map((s, i) => (
              <div key={i} className={`card source ${s.ok ? "green" : "red"}`}>
                <div className="sourceTop">
                  <span className="sourceName">{s.name || s.id}</span>
                  <span className={`dot ${s.ok ? "dot-green" : "dot-red"}`}>
                    {s.ok ? "OK" : "Attention"}
                  </span>
                </div>
                {s.note && <p className="note">{s.note}</p>}
              </div>
            ))}
            {sources.length === 0 && (
              <p className="muted">No per-source details in the last run.</p>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        .page {
          max-width: 760px;
          margin: 0 auto;
          padding: 32px 18px 80px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
          color: #1a1a1a;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 22px;
        }
        h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
        }
        .refresh {
          padding: 9px 16px;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          background: #2f6fed;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .refresh:disabled {
          background: #9db8f3;
          cursor: not-allowed;
        }
        .card {
          background: #fff;
          border: 1px solid #e6e6ec;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 14px;
        }
        .summary {
          border-left: 5px solid #ccc;
        }
        .summary.green {
          border-left-color: #1a9f53;
        }
        .summary.amber {
          border-left-color: #d98a0b;
        }
        .summaryTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
        }
        .badge-green {
          background: #e7f6ec;
          color: #1a7f43;
        }
        .badge-amber {
          background: #fdeede;
          color: #b3590a;
        }
        .time {
          font-size: 13px;
          color: #777;
        }
        .metric {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 8px;
        }
        .metricNumber {
          font-size: 30px;
          font-weight: 700;
        }
        .metricLabel {
          font-size: 14px;
          color: #777;
        }
        .message {
          font-size: 15px;
          margin: 4px 0 0;
        }
        .sectionTitle {
          font-size: 15px;
          font-weight: 700;
          color: #555;
          margin: 26px 0 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .source {
          margin-bottom: 0;
          border-left: 5px solid #ccc;
        }
        .source.green {
          border-left-color: #1a9f53;
        }
        .source.red {
          border-left-color: #d23b3b;
        }
        .sourceTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .sourceName {
          font-size: 15px;
          font-weight: 600;
        }
        .dot {
          font-size: 12px;
          font-weight: 700;
          padding: 3px 9px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .dot-green {
          background: #e7f6ec;
          color: #1a7f43;
        }
        .dot-red {
          background: #fdecec;
          color: #b32020;
        }
        .note {
          font-size: 13px;
          color: #666;
          margin: 0;
        }
        .muted {
          color: #888;
          font-size: 14px;
        }
        .banner {
          padding: 12px 14px;
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 14px;
        }
        .banner.error {
          background: #fdecef;
          color: #b00020;
          border: 1px solid #f6c9d2;
        }

        /* Mobile: stack source cards into one column */
        @media (max-width: 560px) {
          .grid {
            grid-template-columns: 1fr;
          }
          h1 {
            font-size: 21px;
          }
        }
      `}</style>
    </main>
  );
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "—";
  }
}
