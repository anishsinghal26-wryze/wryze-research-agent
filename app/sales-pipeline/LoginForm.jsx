"use client";

// ============================================================================
// app/sales-pipeline/LoginForm.jsx
// The password screen shown when you are NOT logged in. Self-contained styling,
// no dependencies.
// ============================================================================

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/sales-pipeline/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Success: login cookie is set. Reload so the server shows the dashboard.
        window.location.reload();
      } else if (res.status === 500) {
        setError(
          "This page isn't configured with a password yet. (Set the SALES_PIPELINE_PASSWORD environment variable.)"
        );
        setLoading(false);
      } else {
        setError("Incorrect password. Please try again.");
        setLoading(false);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
          Sales Pipeline Agent
        </h1>
        <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 18px" }}>
          Internal access only. Enter the team password to continue.
        </p>

        <label
          htmlFor="sp-password"
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#374151",
            marginBottom: 6,
          }}
        >
          Password
        </label>
        <input
          id="sp-password"
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />

        {error && (
          <div
            style={{
              backgroundColor: "#fef2f2",
              color: "#b91c1c",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            backgroundColor:
              loading || password.length === 0 ? "#93c5fd" : "#2563eb",
            cursor: loading || password.length === 0 ? "default" : "pointer",
          }}
        >
          {loading ? "Checking…" : "Enter dashboard"}
        </button>
      </form>
    </div>
  );
}
