"use client";

import { useState } from "react";

export default function Home() {
  const [topic, setTopic] = useState("");
  // status can be: "idle" | "loading" | "error" | "success"
  const [status, setStatus] = useState("idle");
  const [summary, setSummary] = useState("");
  const [sources, setSources] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim()) return;

    setStatus("loading");
    setErrorMsg("");
    setSummary("");
    setSources([]);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong.");
        setStatus("error");
        return;
      }

      setSummary(data.summary);
      setSources(data.sources || []);
      setStatus("success");
    } catch (err) {
      setErrorMsg("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className="wrap">
      <h1 className="title">Wryze.ai Research Agent</h1>
      <p className="subtitle">
        Enter an SAT topic. The app searches the web and Claude writes a short
        summary.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. digital SAT test anxiety"
          disabled={status === "loading"}
        />
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Researching…" : "Run research"}
        </button>
      </form>

      {status === "idle" && (
        <p className="muted">Your summary will appear here.</p>
      )}

      {status === "loading" && (
        <div className="card">
          <p className="muted">Searching the web and summarizing… this takes a few seconds.</p>
        </div>
      )}

      {status === "error" && (
        <div className="card error">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {status === "success" && (
        <div className="card">
          <h2>Summary</h2>
          <div className="summary">{summary}</div>

          {sources.length > 0 && (
            <div className="sources">
              <h3>Sources</h3>
              {sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
