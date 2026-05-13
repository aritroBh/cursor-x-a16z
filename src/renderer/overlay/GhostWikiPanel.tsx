import React, { useState, useEffect } from "react";
import { api } from "../src/api";

export const GhostWikiPanel: React.FC = () => {
  const [lintResultIssues, setLintResultIssues] = useState<any[]>([]);
  const [status, setStatus] = useState({
    active: false,
    mode: "unknown",
    lastIngest: "never",
    wikiPages: 0,
    lintIssues: 0,
    confidence: 0,
  });

  const [peekabooStatus, setPeekabooStatus] = useState<any>({
    enabled: false,
    available: false,
    platform: "unknown",
  });

  const [queryInput, setQueryInput] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [logs, setLogs] = useState<
    {
      id: number;
      timestamp: string;
      label: string;
      status: "pending" | "pass" | "fail";
      error?: string;
    }[]
  >([]);
  const [memoryDiff, setMemoryDiff] = useState<any>(null);

  const addLog = (
    label: string,
    status: "pending" | "pass" | "fail" = "pending",
    error?: string,
  ) => {
    setLogs((prev) => {
      const newLog = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        label,
        status,
        error,
      };
      return [newLog, ...prev].slice(0, 20);
    });
  };

  const updateLastLog = (status: "pass" | "fail", error?: string) => {
    setLogs((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], status, error };
      return updated;
    });
  };

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
    try {
      const pStatus = await api.getPeekabooStatus();
      setPeekabooStatus(pStatus);
    } catch (e) {
      console.error(e);
    }
  };

  const handleIngest = async () => {
    setIsBusy(true);
    addLog("Ingesting session data...");
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
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const handleQuery = async () => {
    if (!queryInput) return;
    setIsBusy(true);
    addLog(`Querying: "${queryInput}"`);
    try {
      const res = await api.ghostwikiQuery(queryInput);
      setQueryResult(res);
      setStatus((s) => ({ ...s, mode: res.mode }));
      setMemoryDiff(null); // Reset diff on a new normal query
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const handleLint = async () => {
    setIsBusy(true);
    addLog("Running Lint...");
    try {
      const res = await api.ghostwikiLint();
      setStatus((s) => ({
        ...s,
        mode: res.mode,
        lintIssues: res.issues ? res.issues.length : 0,
      }));
      setLintResultIssues(res.issues || []);
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const [feedbackPrompt, setFeedbackPrompt] = useState<{
    type: "correct" | "wrong" | "missing-step";
  } | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  const handleRecord = async () => {
    addLog("Demo recording already loaded", "pass");
  };

  const handleCompileWiki = async () => {
    setIsBusy(true);
    addLog("Compiling Wiki...");
    try {
      // "event-recap-session-1" is the ID expected to be found in demo-workflows/event-recap/graph.json
      // By calling ghostwikiIngestSession, the main process explicitely loads the demo workflow and compiles it.
      await api.ghostwikiIngestSession("event-recap-session-1", "Specter");
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const handleReplay = async () => {
    setIsBusy(true);
    addLog("Starting Replay...");
    try {
      await api.autoExecute();
      updateLastLog("pass");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", "Replay not implemented yet");
    }
    setIsBusy(false);
  };

  const submitFeedback = async () => {
    if (!feedbackPrompt || !feedbackText) return;
    setIsBusy(true);
    addLog("Submitting feedback and re-ingesting...");
    try {
      const previousAnswer = queryResult?.answer;
      const result = await api.ghostwikiQuery(
        queryInput, // pass the original query string
        "event-recap-session-1",
        feedbackPrompt.type,
        feedbackText,
      );
      setQueryResult(result);
      setMemoryDiff({
        beforeAnswer: previousAnswer,
        afterAnswer: result.answer,
        correctionText: feedbackText,
        correctionPath:
          result.correctionPath || "Correction file written; path unavailable",
        sources: result.sources,
      });
      updateLastLog("pass");
      setFeedbackPrompt(null);
      setFeedbackText("");
    } catch (e) {
      console.error(e);
      updateLastLog("fail", String(e));
    }
    setIsBusy(false);
  };

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runWinningDemo = async () => {
    setIsBusy(true);

    // 1. Compile
    addLog("Demo: Compiling + Ingesting Wiki...");
    try {
      await api.ghostwikiIngestSession("event-recap-session-1", "Specter");
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 2. Ingest
    addLog("Demo: Ingesting session data...");
    try {
      const res = await api.ghostwikiIngestSession(
        "event-recap-session-1",
        "Specter",
      );
      setStatus((s) => ({
        ...s,
        lastIngest: new Date().toLocaleTimeString(),
        mode: res.mode,
        wikiPages: res.sources_ingested || s.wikiPages,
      }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 3. Query
    const demoQuery = "How do I create a calendar event from this event page?";
    setQueryInput(demoQuery);
    addLog(`Demo: Querying "${demoQuery}"`);
    let beforeAnswer = "";
    try {
      const res = await api.ghostwikiQuery(demoQuery);
      beforeAnswer = res.answer;

      const missingKeys = [
        "Create Event",
        "title",
        "date",
        "time",
        "location",
        "host",
      ].filter((k) => !res.answer.includes(k));
      if (missingKeys.length > 0)
        throw new Error(`Query answer missing: ${missingKeys.join(", ")}`);
      if (!res.sources || res.sources.length === 0)
        throw new Error("Query sources missing or empty");

      setQueryResult(res);
      setStatus((s) => ({ ...s, mode: res.mode }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 4. Lint
    addLog("Demo: Running Lint...");
    try {
      const res = await api.ghostwikiLint();
      const numIssues = res.issues ? res.issues.length : 0;
      if (numIssues === 0)
        throw new Error("Lint issues expected but none found");

      setStatus((s) => ({
        ...s,
        mode: res.mode,
        lintIssues: numIssues,
      }));
      setLintResultIssues(res.issues || []);
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 5, 6 & 7. Correct, Re-ingest & Re-query
    addLog("Demo: Submitting Correction & Re-ingesting...");
    try {
      const correctionText = "It needs a success condition";
      const result = await api.ghostwikiQuery(
        demoQuery,
        "event-recap-session-1",
        "missing-step",
        correctionText,
      );

      if (!result.answer)
        throw new Error("afterAnswer is missing in correction result");
      const cPath =
        result.correctionPath || "Correction file written; path unavailable";

      // Diff panel will catch the correction file if we have it in result
      setQueryResult(result);
      setMemoryDiff({
        beforeAnswer: beforeAnswer,
        afterAnswer: result.answer,
        correctionText: correctionText,
        correctionPath: cPath,
        sources: result.sources,
      });
      setStatus((s) => ({ ...s, mode: result.mode }));
      updateLastLog("pass");
      await delay(700);
    } catch (e) {
      updateLastLog("fail", String(e));
      setIsBusy(false);
      return;
    }

    // 8. Replay
    addLog("Demo: Starting Replay...");
    try {
      await api.autoExecute();
      updateLastLog("pass");
    } catch (e) {
      updateLastLog("fail", "Replay not implemented yet");
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
          <span
            style={{
              marginLeft: "8px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: !peekabooStatus.enabled
                ? "rgba(255,255,255,0.2)"
                : !peekabooStatus.available
                  ? "rgba(255,165,0,0.3)"
                  : "rgba(48,209,88,0.3)",
              color: !peekabooStatus.enabled
                ? "#aaa"
                : !peekabooStatus.available
                  ? "#ffa500"
                  : "#30d158",
              fontWeight: "bold",
            }}
            title={peekabooStatus.warning || ""}
          >
            {!peekabooStatus.enabled
              ? "Peekaboo Disabled"
              : !peekabooStatus.available
                ? "Peekaboo Missing"
                : "Peekaboo Available"}
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
        <button
          onClick={handleRecord}
          disabled={true}
          style={btnStyle}
          title="Demo recording already loaded"
        >
          Demo recording already loaded
        </button>
        <button onClick={handleCompileWiki} disabled={isBusy} style={btnStyle}>
          Compile + Ingest
        </button>
        <button onClick={handleIngest} disabled={isBusy} style={btnStyle}>
          Ingest
        </button>
        <button onClick={handleLint} disabled={isBusy} style={btnStyle}>
          Lint
        </button>
        <button
          onClick={runWinningDemo}
          disabled={isBusy}
          style={{
            ...btnStyle,
            background: "rgba(100, 210, 255, 0.2)",
            color: "#64d2ff",
            fontWeight: "bold",
          }}
        >
          Run Winning Demo
        </button>
        <button
          onClick={handleReplay}
          disabled={!peekabooStatus.available}
          style={{ ...btnStyle, opacity: peekabooStatus.available ? 1 : 0.5 }}
          title={
            peekabooStatus.available
              ? "Replay using Peekaboo"
              : "Replay disabled (needs Peekaboo)"
          }
        >
          {peekabooStatus.available
            ? "Replay Workflow"
            : "Replay Disabled (Missing Peekaboo)"}
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

      {logs.length > 0 && (
        <div
          style={{
            marginTop: "12px",
            padding: "8px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "8px",
            fontSize: "11px",
            maxHeight: "150px",
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
            Activity Log:
          </div>
          {logs.map((log) => (
            <div
              key={log.id}
              style={{ display: "flex", gap: "8px", marginBottom: "4px" }}
            >
              <span style={{ color: "#888" }}>[{log.timestamp}]</span>
              <span
                style={{
                  color:
                    log.status === "pass"
                      ? "#30d158"
                      : log.status === "fail"
                        ? "#ff453a"
                        : "#ffcc00",
                  fontWeight: "bold",
                }}
              >
                {log.status.toUpperCase()}
              </span>
              <span>{log.label}</span>
              {log.error && (
                <span style={{ color: "#ff453a" }}> - {log.error}</span>
              )}
            </div>
          ))}
        </div>
      )}

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
              Sources:{" "}
              {queryResult.sources.length
                ? queryResult.sources.map((s: any) => s.title).join(", ")
                : "None"}
            </div>
          )}

          {memoryDiff && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px",
                background: "rgba(10, 132, 255, 0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(10, 132, 255, 0.3)",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "8px",
                  color: "#64d2ff",
                }}
              >
                Memory Diff
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#aaa",
                  }}
                >
                  Before Answer:
                </span>
                <div
                  style={{
                    fontSize: "12px",
                    fontStyle: "italic",
                    color: "#bbb",
                  }}
                >
                  {memoryDiff.beforeAnswer || "None"}
                </div>
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#ffcc00",
                  }}
                >
                  Correction Applied:
                </span>
                <div style={{ fontSize: "12px" }}>
                  {memoryDiff.correctionText}
                </div>
                <div
                  style={{ fontSize: "10px", color: "#888", marginTop: "2px" }}
                >
                  Path: {memoryDiff.correctionPath}
                </div>
              </div>

              <div style={{ marginBottom: "6px" }}>
                <span
                  style={{
                    fontWeight: "bold",
                    fontSize: "11px",
                    color: "#30d158",
                  }}
                >
                  After Answer:
                </span>
                <div style={{ fontSize: "12px" }}>{memoryDiff.afterAnswer}</div>
              </div>

              {memoryDiff.sources && (
                <div style={{ fontSize: "10px", color: "#888" }}>
                  Sources updated:{" "}
                  {memoryDiff.sources.map((s: any) => s.title).join(", ")}
                </div>
              )}
            </div>
          )}

          {status.lintIssues > 0 && (
            <div
              style={{
                color: "#ffcc00",
                fontSize: "11px",
                marginBottom: "8px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Lint Issues Found:
              </strong>
              <ul style={{ paddingLeft: "16px", margin: 0 }}>
                {lintResultIssues && lintResultIssues.length > 0 ? (
                  lintResultIssues.map((issue: any, i: number) => (
                    <li key={i}>
                      {typeof issue === "string"
                        ? issue
                        : `${issue.rule}: ${issue.message}`}
                    </li>
                  ))
                ) : (
                  <li>
                    Lint issue count reported, but no issue details returned.
                  </li>
                )}
              </ul>
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              onClick={() => setFeedbackPrompt({ type: "correct" })}
              style={{ ...fbBtnStyle, color: "#30d158" }}
            >
              Correct
            </button>
            <button
              onClick={() => setFeedbackPrompt({ type: "wrong" })}
              style={{ ...fbBtnStyle, color: "#ff453a" }}
            >
              Wrong
            </button>
            <button
              onClick={() => setFeedbackPrompt({ type: "missing-step" })}
              style={{ ...fbBtnStyle, color: "#ffcc00" }}
            >
              Missing Step
            </button>
          </div>

          {feedbackPrompt && (
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                Provide correction for {feedbackPrompt.type}:
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  background: "#222",
                  color: "white",
                  fontSize: "12px",
                }}
                placeholder="What should it be?"
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={submitFeedback}
                  disabled={isBusy || !feedbackText}
                  style={{ ...btnStyle, background: "#0a84ff", flex: 1 }}
                >
                  Submit Feedback
                </button>
                <button
                  onClick={() => {
                    setFeedbackPrompt(null);
                    setFeedbackText("");
                  }}
                  disabled={isBusy}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
