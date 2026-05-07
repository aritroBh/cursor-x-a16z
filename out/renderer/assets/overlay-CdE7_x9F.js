import { r as reactExports, j as jsxRuntimeExports, c as client, R as React } from "./client-CciThgMB.js";
const api = window.api;
const InputBar = ({ onSubmit }) => {
  const [value, setValue] = reactExports.useState("");
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && value.trim()) {
      onSubmit(value);
      setValue("");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-bar siri-glow-input", style: {
    width: "100%",
    background: "rgba(255, 255, 255, 0.9)",
    backdropFilter: "blur(10px)",
    borderRadius: "16px",
    padding: "12px 20px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
    display: "flex",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.2)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        type: "text",
        placeholder: "What would you like to learn?",
        value,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: handleKeyDown,
        style: {
          flex: 1,
          border: "none",
          background: "transparent",
          fontSize: "18px",
          outline: "none",
          color: "#1a1a1a"
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      marginLeft: "12px",
      color: "#666",
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "1px"
    }, children: "Press Enter" })
  ] });
};
const GhostCursor = ({ step }) => {
  if (!step) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ghost-cursor-container", style: {
    position: "absolute",
    left: `${step.targetX}%`,
    top: `${step.targetY}%`,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: 9999,
    transition: "all 0.4s cubic-bezier(0.23, 1, 0.32, 1)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pulse-ring", style: {
      position: "absolute",
      width: "60px",
      height: "60px",
      borderRadius: "50%",
      border: "3px solid rgba(124, 58, 237, 0.5)",
      animation: "pulse 2s infinite",
      left: "-30px",
      top: "-30px"
    } }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cursor-dot", style: {
      width: "12px",
      height: "12px",
      background: "#7c3aed",
      borderRadius: "50%",
      boxShadow: "0 0 15px rgba(124, 58, 237, 0.8)"
    } }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "instruction-bubble", style: {
      position: "absolute",
      left: "20px",
      top: "-10px",
      background: "#1a1a1a",
      color: "white",
      padding: "8px 14px",
      borderRadius: "12px",
      fontSize: "14px",
      fontWeight: 500,
      whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.1)"
    }, children: step.instruction }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      ` })
  ] });
};
const ModeToggle = ({ mode, onChange }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mode-toggle", style: {
    display: "flex",
    background: "rgba(0, 0, 0, 0.2)",
    padding: "4px",
    borderRadius: "24px",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.1)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => onChange("silent"),
        style: {
          padding: "6px 16px",
          borderRadius: "20px",
          border: "none",
          background: mode === "silent" ? "#fff" : "transparent",
          color: mode === "silent" ? "#000" : "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s"
        },
        children: "Silent"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => onChange("ultra"),
        style: {
          padding: "6px 16px",
          borderRadius: "20px",
          border: "none",
          background: mode === "ultra" ? "#fff" : "transparent",
          color: mode === "ultra" ? "#000" : "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s"
        },
        children: "Ultra"
      }
    )
  ] });
};
const SessionPanel = ({ intent }) => {
  if (!intent) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "session-panel", style: {
    width: "100%",
    background: "rgba(26, 26, 26, 0.8)",
    backdropFilter: "blur(20px)",
    borderRadius: "16px",
    padding: "20px",
    color: "white",
    boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "12px", color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase" }, children: "Current Goal" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "20px", fontWeight: 700 }, children: intent }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "progress-bar", style: {
      width: "100%",
      height: "6px",
      background: "rgba(255,255,255,0.1)",
      borderRadius: "3px",
      marginTop: "8px",
      overflow: "hidden"
    }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      width: "30%",
      // Simulated progress
      height: "100%",
      background: "linear-gradient(90deg, #7c3aed, #ec4899)",
      borderRadius: "3px"
    } }) })
  ] });
};
const OverlayApp = () => {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [mode, setMode] = reactExports.useState("silent");
  const [intent, setIntent] = reactExports.useState("");
  const [currentStep, setCurrentStep] = reactExports.useState(null);
  const [replayState, setReplayState] = reactExports.useState("idle");
  const [isLoading, setIsLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev);
    });
    api.onReplayComplete(() => {
      setCurrentStep(null);
      setReplayState("idle");
    });
    api.onReplayStopped(() => {
      setCurrentStep(null);
      setReplayState("idle");
    });
  }, []);
  reactExports.useEffect(() => {
    api.onReplayStep((data) => {
      setCurrentStep(data.step);
      setReplayState("running");
      setIsLoading(false);
    });
  }, []);
  reactExports.useEffect(() => {
    api.onReplayProgress((data) => {
      setReplayState("running");
      setCurrentStep({ index: data.index, total: data.total });
    });
  }, []);
  const handleIntentSubmit = async (text) => {
    setIntent(text);
    setIsLoading(true);
    const screenState = await api.analyzeScreen();
    const plan = await api.planSteps(text, screenState, [], mode);
    if (!plan || !plan.steps || plan.steps.length === 0) {
      setIsLoading(false);
      return;
    }
    if (mode === "ultra") {
      await api.speak(`Starting: ${plan.levelTitle}`);
    }
    await api.saveNode(plan.levelTitle, plan.steps);
    const arm = await api.selectStyle();
    const startTime = Date.now();
    await api.walkthrough(plan.levelTitle);
    setIsLoading(false);
    const elapsed = Date.now() - startTime;
    const reward = elapsed < 15e3 ? 1 : elapsed < 45e3 ? 0.5 : 0;
    await api.recordReward(arm, reward);
    await api.markNodeComplete(plan.levelTitle);
  };
  if (!isVisible && replayState === "idle" && !isLoading) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overlay-container", style: {
    width: "100vw",
    height: "100vh",
    position: "relative",
    pointerEvents: isVisible ? "auto" : "none",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, sans-serif"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(GhostCursor, { step: currentStep }),
    isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.75)",
      color: "#fff",
      padding: "10px 20px",
      borderRadius: "20px",
      fontSize: "14px",
      fontWeight: 500,
      backdropFilter: "blur(8px)",
      pointerEvents: "none",
      zIndex: 9999
    }, children: "Analyzing your screen..." }),
    isVisible && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "siri-glow-fullscreen" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
        position: "absolute",
        bottom: "10%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
        width: "80%",
        maxWidth: "600px",
        pointerEvents: "auto"
      }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ModeToggle, { mode, onChange: setMode }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(InputBar, { onSubmit: handleIntentSubmit }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SessionPanel, { intent })
      ] })
    ] })
  ] });
};
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(OverlayApp, {}) })
);
