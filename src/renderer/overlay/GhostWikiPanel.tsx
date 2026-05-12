import React, { useState, useEffect } from "react";
import { api } from "../src/api";

export const GhostWikiPanel: React.FC = () => {
  const [status, setStatus] = useState({
    active: false,
    mode: "unknown",
    lastIngest: "never",
    wikiPages: 0,
    lintIssues: 0,
    confidence: 0,
  });

  const [queryInput, setQueryInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    // Initial health check if desired
    refreshStatus();
  }, []);

  const refreshStatus = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8765/health").then((r) =>
        r.json(),
      );
      setStatus((s) => ({
        ...s,
        mode: res.cognee_enabled ? "cognee" : "fallback",
        active: true,
      }));
    } catch {
      setStatus((s) => ({ ...s, active: false }));
    }
  };

  const handleIngest = async () => {
    setIsBusy(true);
    try {
      const res = await api.ghostwikiIngestSession(
        "event-recap-session-1",
        "Specter",
      ); // Fake session ID
      setStatus((s) => ({
        ...s,
        lastIngest: new Date().toLocaleTimeString(),
        mode: res.mode,
        wikiPages: res.sources_ingested || s.wikiPages,
      }));
    } catch (e) {
      console.error(e);
    }
    setIsBusy(false);
  };

  const handleQuery = async () => {
    if (!queryInput) return;
    setIsBusy(true);
    try {
      const res = await api.ghostwikiQuery(queryInput);
      setQueryResult(res);
      setStatus((s) => ({ ...s, mode: res.mode }));
    } catch (e) {
      console.error(e);
    }
    setIsBusy(false);
  };

  const handleLint = async () => {
    setIsBusy(true);
    try {
      const res = await api.ghostwikiLint();
      setStatus((s) => ({
        ...s,
        mode: res.mode,
        lintIssues: res.issues ? res.issues.length : 0,
      }));
      alert(`Lint found ${res.issues ? res.issues.length : 0} issues.`);
    } catch (e) {
      console.error(e);
    }
    setIsBusy(false);
  };

  const handleFeedback = async (type: "correct" | "wrong" | "missing-step") => {
    setIsBusy(true);
    try {
      await api.ghostwikiQuery(
        "",
        "event-recap-session-1",
        type,
        `User marked as ${type}`,
      );
      alert("Feedback recorded and re-ingested.");
    } catch (e) {
      console.error(e);
    }
    setIsBusy(false);
  };

  return (
    <div
      style={{
        padding: "12px",
        background: "rgba(0,0,0,0.8)",
        borderRadius: "12px",
        color: "white",
        marginTop: "10px",
        width: "100%",
      }}
    >
      <h3 style={{ margin: "0 0 10px 0" }}>GhostWiki Tools</h3>

      <div style={{ marginBottom: "10px", fontSize: "12px" }}>
        <div>
          Status: {status.active ? "Online" : "Offline"}
          <span
            style={{
              marginLeft: "8px",
              padding: "2px 6px",
              borderRadius: "4px",
              background:
                status.mode === "fallback"
                  ? "rgba(255,165,0,0.3)"
                  : "rgba(48,209,88,0.3)",
              color: status.mode === "fallback" ? "#ffa500" : "#30d158",
              fontWeight: "bold",
            }}
          >
            {status.mode === "cognee"
              ? "Cognee Active"
              : status.mode === "fallback"
                ? "Cognee Fallback"
                : "Unknown"}
          </span>
        </div>
        <div>Last Ingest: {status.lastIngest}</div>
        <div>Wiki Pages: {status.wikiPages}</div>
        <div>Lint Issues: {status.lintIssues}</div>
        <div>Replay Confidence: {status.confidence}%</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <button onClick={() => {}} disabled={isBusy} style={btnStyle}>
          Record
        </button>
        <button onClick={() => {}} disabled={isBusy} style={btnStyle}>
          Compile Wiki
        </button>
        <button onClick={handleIngest} disabled={isBusy} style={btnStyle}>
          Ingest
        </button>
        <button onClick={handleLint} disabled={isBusy} style={btnStyle}>
          Lint
        </button>
        <button onClick={() => {}} disabled={isBusy} style={btnStyle}>
          Replay
        </button>
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Ask memory..."
          style={{
            flex: 1,
            padding: "6px",
            borderRadius: "4px",
            border: "1px solid #444",
            background: "#222",
            color: "white",
          }}
        />
        <button
          onClick={handleQuery}
          disabled={isBusy || !queryInput}
          style={{ ...btnStyle, background: "#0a84ff" }}
        >
          Query
        </button>
      </div>

      {queryResult && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Answer:</div>
          <div style={{ fontSize: "13px", marginBottom: "8px" }}>
            {queryResult.answer}
          </div>

          {queryResult.warnings && queryResult.warnings.length > 0 && (
            <div
              style={{
                color: "#ffcc00",
                fontSize: "11px",
                marginBottom: "8px",
              }}
            >
              Warnings: {queryResult.warnings.join(", ")}
            </div>
          )}

          {queryResult.sources && queryResult.sources.length > 0 && (
            <div
              style={{ fontSize: "11px", color: "#aaa", marginBottom: "8px" }}
            >
              Sources: {queryResult.sources.map((s: any) => s.title).join(", ")}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={() => handleFeedback("correct")}
              style={{ ...fbBtnStyle, color: "#30d158" }}
            >
              Correct
            </button>
            <button
              onClick={() => handleFeedback("wrong")}
              style={{ ...fbBtnStyle, color: "#ff453a" }}
            >
              Wrong
            </button>
            <button
              onClick={() => handleFeedback("missing-step")}
              style={{ ...fbBtnStyle, color: "#ffcc00" }}
            >
              Missing Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const btnStyle = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.1)",
  color: "white",
  cursor: "pointer",
  fontSize: "12px",
};

const fbBtnStyle = {
  flex: 1,
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(255,255,255,0.2)",
  background: "transparent",
  cursor: "pointer",
  fontSize: "11px",
  fontWeight: "bold" as const,
};
