import { r as reactExports, j as jsxRuntimeExports, c as client } from "./client-CciThgMB.js";
const api = window.api;
class MicRecorder {
  mediaRecorder = null;
  chunks = [];
  isRecording = false;
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
    this.isRecording = true;
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new ArrayBuffer(0));
        return;
      }
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
        const buffer = await blob.arrayBuffer();
        this.isRecording = false;
        resolve(buffer);
      };
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((t) => t.stop());
    });
  }
}
const recorder = new MicRecorder();
const InputBar = ({
  onSubmit,
  onRealAppTest,
  disabled = false,
  showDebugTools = false,
  onFocus,
  onBlur
}) => {
  const [value, setValue] = reactExports.useState("");
  const [isRecording, setIsRecording] = reactExports.useState(false);
  const handleKeyDown = (e) => {
    if (!disabled && e.key === "Enter" && value.trim()) {
      onSubmit(value);
      setValue("");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-bar", style: {
    width: "100%",
    background: "rgba(18, 18, 22, 0.72)",
    backdropFilter: "blur(16px)",
    borderRadius: "16px",
    padding: "12px 20px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
    display: "flex",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.1)"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        type: "text",
        placeholder: "What would you like to learn?",
        value,
        disabled,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: handleKeyDown,
        onFocus,
        onBlur,
        style: {
          flex: 1,
          border: "none",
          background: "transparent",
          fontSize: "18px",
          outline: "none",
          color: "#ffffff",
          opacity: disabled ? 0.55 : 1
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
      marginLeft: "12px",
      color: "rgba(255,255,255,0.4)",
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "1px"
    }, children: "Return" }),
    onRealAppTest && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        disabled,
        onClick: () => {
          if (disabled) return;
          onRealAppTest(value);
          setValue("");
        },
        style: {
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: "10px",
          height: "36px",
          padding: "0 10px",
          marginLeft: "10px",
          background: "rgba(10,132,255,0.12)",
          color: "#0a4d86",
          fontSize: "12px",
          fontWeight: 800,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          whiteSpace: "nowrap"
        },
        children: "Real App Test"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        disabled,
        onMouseDown: async () => {
          if (disabled) return;
          setIsRecording(true);
          await recorder.start();
        },
        onMouseUp: async () => {
          if (disabled) return;
          setIsRecording(false);
          const buffer = await recorder.stop();
          const text = await window.api.transcribe(buffer);
          if (text) onSubmit(text);
        },
        style: {
          background: isRecording ? "#ff3b30" : "rgba(0,0,0,0.1)",
          border: "none",
          borderRadius: "50%",
          width: "36px",
          height: "36px",
          cursor: disabled ? "default" : "pointer",
          marginLeft: "8px",
          opacity: disabled ? 0.55 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: isRecording ? "⏹" : "🎤"
      }
    )
  ] });
};
const DEMO_LOOP_MS = 1700;
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}
function fallbackStart(step) {
  const offsetX = step.x > 58 ? -18 : 18;
  const offsetY = step.y > 58 ? -12 : 12;
  return {
    x: clampPercent(step.x + offsetX),
    y: clampPercent(step.y + offsetY)
  };
}
const GhostCursor = ({ step }) => {
  const isIdle = !step || step.type === "idle";
  const idleX = 65;
  const idleY = 70;
  const displayX = isIdle ? idleX : step.x;
  const displayY = isIdle ? idleY : step.y;
  if (typeof displayX !== "number" || typeof displayY !== "number") return null;
  const bubbleOnLeft = displayX > 70;
  const fallback = !isIdle ? fallbackStart(step) : { x: idleX, y: idleY };
  const startX = !isIdle && typeof step.ghostStartX === "number" ? step.ghostStartX : fallback.x;
  const startY = !isIdle && typeof step.ghostStartY === "number" ? step.ghostStartY : fallback.y;
  const fromX = clampPercent(startX) - clampPercent(displayX);
  const fromY = clampPercent(startY) - clampPercent(displayY);
  const shouldLoop = !isIdle && step.ghostLoop !== false && step.action !== "wait" && !step.ghostLocked;
  const hasHint = !isIdle && Boolean(step.instruction || step.targetLabel);
  const isLocked = !isIdle && step.ghostLocked;
  const motionStyle = {
    "--ghost-from-x": `${fromX}vw`,
    "--ghost-from-y": `${fromY}vh`,
    "--ghost-loop-ms": `${DEMO_LOOP_MS}ms`,
    animation: shouldLoop ? "ghost-cursor-demo var(--ghost-loop-ms) cubic-bezier(0.23, 1, 0.32, 1) infinite" : void 0
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ghost-cursor-container", style: {
    position: "absolute",
    left: `${displayX}%`,
    top: `${displayY}%`,
    transform: "translate(-2px, -2px)",
    pointerEvents: "none",
    zIndex: 9999,
    transition: isIdle ? "left 0.8s ease, top 0.8s ease, opacity 0.5s ease" : "left 0.24s ease, top 0.24s ease",
    opacity: isIdle ? 0.55 : 1
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ghost-cursor-ring", style: {
      position: "absolute",
      width: isLocked ? "48px" : "42px",
      height: isLocked ? "48px" : "42px",
      borderRadius: "50%",
      border: isLocked ? "2px solid rgba(48, 209, 88, 0.72)" : "2px solid rgba(10, 132, 255, 0.45)",
      background: isLocked ? "rgba(48, 209, 88, 0.14)" : "rgba(10, 132, 255, 0.10)",
      animation: isLocked || isIdle ? void 0 : "ghost-ring-pulse 1.8s infinite",
      left: isLocked ? "-23px" : "-20px",
      top: isLocked ? "-23px" : "-20px",
      transition: "all 0.18s ease",
      opacity: isIdle ? 0 : 1
    } }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "ghost-cursor-motion",
        style: motionStyle,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "svg",
            {
              className: "ghost-cursor-pointer",
              width: "34",
              height: "42",
              viewBox: "0 0 28 34",
              "aria-hidden": "true",
              style: {
                display: "block",
                opacity: isLocked ? 0.88 : 0.72,
                filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.38))",
                transition: "opacity 0.18s ease"
              },
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "path",
                {
                  d: "M2.4 2.3v27.1l7.2-7.4 4.3 10 5.1-2.2-4.3-9.8h10.6L2.4 2.3Z",
                  fill: "white",
                  stroke: "rgba(8, 10, 14, 0.92)",
                  strokeWidth: "2.2",
                  strokeLinejoin: "round"
                }
              )
            }
          ),
          hasHint && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "instruction-bubble", style: {
            position: "absolute",
            ...bubbleOnLeft ? { right: "32px" } : { left: "32px" },
            top: "18px",
            background: "rgba(18, 18, 20, 0.72)",
            color: "white",
            padding: "6px 9px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: 500,
            maxWidth: "220px",
            lineHeight: 1.25,
            boxShadow: "0 4px 12px rgba(0,0,0,0.24)",
            border: "1px solid rgba(255,255,255,0.1)",
            opacity: 0.78
          }, children: step.instruction || step.targetLabel })
        ]
      },
      isIdle ? "idle" : step.ghostReplayKey || `${step.index ?? "step"}:${step.x}:${step.y}`
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        .ghost-cursor-motion {
          transform: translate(0, 0);
          transform-origin: 3px 3px;
          will-change: transform, opacity;
        }

        @keyframes ghost-cursor-demo {
          0% {
            opacity: 0;
            transform: translate(var(--ghost-from-x), var(--ghost-from-y)) scale(0.96);
          }
          12% {
            opacity: 0.5;
          }
          58% {
            opacity: 0.76;
            transform: translate(0, 0) scale(1);
          }
          82% {
            opacity: 0.76;
            transform: translate(0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(0, 0) scale(1);
          }
        }

        @keyframes ghost-ring-pulse {
          0% { transform: scale(0.55); opacity: 0.72; }
          100% { transform: scale(1.35); opacity: 0; }
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
const SessionPanel = ({
  intent,
  nodeId,
  appName,
  isBusy = false,
  isWalkthroughActive = false,
  onWalkthrough,
  onAutoExecute
}) => {
  if (!intent) return null;
  const disabled = isBusy || !nodeId;
  const buttonBase = {
    flex: 1,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "white",
    fontSize: "13px",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "all 0.2s ease"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "session-panel", style: {
    width: "100%",
    background: "rgba(18, 18, 22, 0.76)",
    backdropFilter: "blur(24px)",
    borderRadius: "18px",
    padding: "18px 22px",
    color: "white",
    boxShadow: "0 20px 50px rgba(0,0,0,0.38)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }, children: "Goal" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "18px", fontWeight: 750, marginTop: "2px" }, children: intent })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { textAlign: "right" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }, children: "App" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: "2px" }, children: appName || "Unknown" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: "6px", height: "6px", borderRadius: "50%", background: isWalkthroughActive ? "#30d158" : "rgba(255,255,255,0.3)" } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)" }, children: isWalkthroughActive ? "Walkthrough in progress" : "Ready to guide" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "flex",
      gap: "10px",
      width: "100%",
      marginTop: "4px"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          disabled,
          onClick: onWalkthrough,
          style: {
            ...buttonBase,
            background: "rgba(255,255,255,0.1)"
          },
          children: "Walk me through"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          disabled,
          onClick: onAutoExecute,
          style: {
            ...buttonBase,
            background: "rgba(255,255,255,0.92)",
            color: "#000",
            border: "none"
          },
          children: "Do it for me"
        }
      )
    ] }),
    isWalkthroughActive && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "progress-bar-container", style: { marginTop: "4px" }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "10px", color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: "6px", textAlign: "center" }, children: "Step Progress" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "progress-bar", style: {
        width: "100%",
        height: "4px",
        background: "rgba(255,255,255,0.08)",
        borderRadius: "2px",
        overflow: "hidden"
      }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
        width: "40%",
        // We could pass real progress if available
        height: "100%",
        background: "#fff",
        borderRadius: "2px",
        opacity: 0.8
      } }) })
    ] })
  ] });
};
const SHOW_WALKTHROUGH_DEBUG = false;
const DEFAULT_REAL_APP_PROMPT = "Teach me one visible action";
const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;
function messageFromError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Specter hit a temporary issue. Try again.";
}
function formatCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "?";
}
function confidencePercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}
function realAppInstruction(target) {
  const label = target.label || "target";
  if (target.action === "type") return `Move to ${label}.`;
  if (target.action === "scroll") return `Scroll near ${label}.`;
  if (target.action === "wait") return `Watch ${label}.`;
  return `Click ${label}.`;
}
function normalizedRealAppTarget(target) {
  return {
    ...target,
    label: target.label?.trim() || "Selected target",
    x: typeof target.x === "number" && Number.isFinite(target.x) ? Math.min(100, Math.max(0, target.x)) : 50,
    y: typeof target.y === "number" && Number.isFinite(target.y) ? Math.min(100, Math.max(0, target.y)) : 50,
    confidence: typeof target.confidence === "number" && Number.isFinite(target.confidence) ? Math.min(1, Math.max(0, target.confidence)) : target.source === "manual" ? 1 : void 0,
    action: ["click", "type", "scroll", "wait"].includes(target.action || "") ? target.action : "click",
    source: target.source === "manual" ? "manual" : "vision"
  };
}
function walkthroughStepFromReplay(data) {
  const ghost = data.ghost || {};
  return {
    ...data.step,
    index: data.index,
    total: data.total,
    retryReason: data.reason,
    ghostStartX: ghost.startX,
    ghostStartY: ghost.startY,
    ghostLoop: ghost.loop !== false,
    ghostLocked: false,
    ghostReplayKey: `${data.index}:${data.attempt ?? 0}`
  };
}
const OverlayApp = () => {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [mode, setMode] = reactExports.useState("silent");
  const [intent, setIntent] = reactExports.useState("");
  const [currentStep, setCurrentStep] = reactExports.useState(null);
  const [replayState, setReplayState] = reactExports.useState("idle");
  const [replayMode, setReplayMode] = reactExports.useState(null);
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [loadingMessage, setLoadingMessage] = reactExports.useState("Analyzing your screen...");
  const [errorMessage, setErrorMessage] = reactExports.useState("");
  const [lastNodeId, setLastNodeId] = reactExports.useState("");
  const [manualConfirmMessage, setManualConfirmMessage] = reactExports.useState("");
  const [calibrationMessage, setCalibrationMessage] = reactExports.useState("");
  const [realAppIntent, setRealAppIntent] = reactExports.useState("");
  const [realAppTargets, setRealAppTargets] = reactExports.useState(null);
  const [selectedRealAppTarget, setSelectedRealAppTarget] = reactExports.useState(null);
  const [isManualTargetPicking, setIsManualTargetPicking] = reactExports.useState(false);
  const [realAppNotice, setRealAppNotice] = reactExports.useState("");
  const [showDebugTools, setShowDebugTools] = reactExports.useState(false);
  const [screenState, setScreenState] = reactExports.useState(null);
  const [isInputFocused, setIsInputFocused] = reactExports.useState(false);
  const [isClickThrough, setIsClickThrough] = reactExports.useState(true);
  const setInteractivity = (interactive) => {
    if (!interactive && isInputFocused) return;
    const next = !interactive;
    setIsClickThrough(next);
    void api.setOverlayClickThrough(next);
  };
  reactExports.useEffect(() => {
    const offToggle = api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev);
    });
    const offComplete = api.onReplayComplete(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
    });
    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
    });
    const offConfirmNeeded = api.onReplayConfirmNeeded((data) => {
      setManualConfirmMessage(data?.message || "Click not detected. Press Space to confirm this step.");
      setIsLoading(false);
    });
    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage("");
    });
    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage("Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry.");
      setIsLoading(false);
    });
    return () => {
      offToggle();
      offComplete();
      offStopped();
      offConfirmNeeded();
      offConfirmCleared();
      offScreenDenied();
    };
  }, []);
  reactExports.useEffect(() => {
    if (isVisible) {
      console.log("[OVERLAY_INTERACTION] overlay became visible");
      void api.analyzeScreen().then((res) => {
        setScreenState(res);
      }).catch((err) => {
        console.error("[Overlay] Initial screen analysis failed:", err);
      });
    } else {
      console.log("[OVERLAY_INTERACTION] overlay hidden");
      setScreenState(null);
    }
  }, [isVisible]);
  reactExports.useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebugTools((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  reactExports.useEffect(() => {
    if (!isInputFocused) {
      console.log("[OVERLAY_INTERACTION] input blurred, restoring click-through");
      setInteractivity(false);
    }
  }, [isInputFocused]);
  reactExports.useEffect(() => {
    if (!manualConfirmMessage) return;
    const onKeyDown = (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      void api.confirmReplayStep().catch((error) => {
        console.error("[Overlay] Replay confirmation failed:", error);
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manualConfirmMessage]);
  reactExports.useEffect(() => {
    if (!isManualTargetPicking) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsManualTargetPicking(false);
        setRealAppNotice("Manual target picking canceled.");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isManualTargetPicking]);
  reactExports.useEffect(() => {
    if (!realAppTargets || replayState === "running") return;
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      startManualTargetPicking();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [realAppTargets, replayState]);
  reactExports.useEffect(() => {
    const offStep = api.onReplayStep((data) => {
      setCurrentStep(walkthroughStepFromReplay(data));
      setReplayMode("walkthrough");
      setReplayState("running");
      setIsLoading(false);
    });
    const offRetry = api.onReplayRetry((data) => {
      setCurrentStep(walkthroughStepFromReplay(data));
      setReplayMode("walkthrough");
      setReplayState("running");
      setIsLoading(false);
    });
    const offTargetReached = api.onReplayTargetReached((data) => {
      setCurrentStep((current) => {
        if (!current || current.index !== data.index) return current;
        return {
          ...current,
          ghostLoop: false,
          ghostLocked: true
        };
      });
    });
    return () => {
      offStep();
      offRetry();
      offTargetReached();
    };
  }, []);
  reactExports.useEffect(() => {
    const offProgress = api.onReplayProgress((data) => {
      setReplayState("running");
      setReplayMode("auto");
      setCurrentStep({ index: data.index, total: data.total });
    });
    return () => {
      offProgress();
    };
  }, []);
  const runLegacyPlannerFlow = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIntent(trimmed);
    setErrorMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setLoadingMessage("Analyzing your screen...");
    setIsLoading(true);
    const startTime = Date.now();
    let selectedArm = null;
    try {
      const res = await api.analyzeScreen(void 0, { captureUnderlying: true });
      setScreenState(res);
      setLoadingMessage("Planning the walkthrough...");
      const plan = await api.planSteps(trimmed, res, [], mode);
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        throw new Error("Specter could not create a usable plan for that intent.");
      }
      const nodeId = typeof plan.levelTitle === "string" && plan.levelTitle.trim() ? plan.levelTitle : trimmed;
      setLastNodeId(nodeId);
      setLoadingMessage("Saving the workflow...");
      await api.saveNode(nodeId, plan.steps);
      if (mode === "ultra") {
        void api.speak(`Starting: ${nodeId}`).catch((error) => {
          console.error("[Overlay] TTS failed:", error);
        });
      } else if (api.stopSpeaking) {
        void api.stopSpeaking().catch(() => void 0);
      }
      try {
        selectedArm = await api.selectStyle();
      } catch (error) {
        console.warn("[Overlay] Could not select teaching style:", error);
      }
      setLoadingMessage("Starting walkthrough...");
      setReplayMode("walkthrough");
      setReplayState("running");
      await api.walkthrough(nodeId);
      const elapsed = Date.now() - startTime;
      const reward = elapsed < 15e3 ? 1 : elapsed < 45e3 ? 0.5 : 0;
      if (selectedArm) {
        await api.recordReward(selectedArm, reward);
      }
      await api.markNodeComplete(nodeId);
    } catch (error) {
      console.error("[Overlay] Intent submission failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      setIsLoading(false);
    }
  };
  const replaySavedWorkflow = async (kind) => {
    if (!lastNodeId) return;
    if (kind === "auto") {
      console.log("[AUTO_REAL_MOUSE] confirmation shown for auto-execute");
      if (!window.confirm("Specter will control your real mouse. Continue?")) {
        console.log("[AUTO_REAL_MOUSE] confirmation canceled");
        return;
      }
      console.log("[AUTO_REAL_MOUSE] confirmation accepted");
    }
    setErrorMessage("");
    setIsLoading(true);
    setLoadingMessage(kind === "walkthrough" ? "Starting walkthrough..." : "Starting auto-execute...");
    setReplayMode(kind);
    setReplayState("running");
    try {
      if (kind === "walkthrough") {
        await api.walkthrough(lastNodeId);
      } else {
        await api.autoExecute(lastNodeId);
      }
    } catch (error) {
      console.error("[Overlay] Replay failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      setIsLoading(false);
    }
  };
  const prepareControlledDemo = async () => {
    setErrorMessage("");
    setCalibrationMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setIsLoading(true);
    setLoadingMessage("Preparing controlled demo...");
    try {
      const workflow = await api.prepareControlledDemo();
      setIntent(workflow.intent || "Controlled Specter demo");
      setLastNodeId(workflow.nodeId);
      setReplayState("idle");
      setReplayMode(null);
      setCurrentStep(null);
    } catch (error) {
      console.error("[Overlay] Demo workflow failed:", error);
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  };
  const startRealAppTest = async (text) => {
    const testIntent = text.trim() || intent.trim() || DEFAULT_REAL_APP_PROMPT;
    setIntent(testIntent);
    setRealAppIntent(testIntent);
    setLastNodeId("");
    setCurrentStep(null);
    setReplayMode(null);
    setReplayState("idle");
    setErrorMessage("");
    setCalibrationMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setIsLoading(true);
    setLoadingMessage("Capturing real app...");
    try {
      console.log("[REAL_APP_FLOW] normal Enter started real-app test", { intent: testIntent });
      const result = await api.detectRealAppTargets(testIntent);
      const normalizedTargets = Array.isArray(result?.targets) ? result.targets.map((target) => normalizedRealAppTarget(target)) : [];
      const nextTargets = {
        ...result,
        targets: normalizedTargets,
        confidenceThreshold: typeof result?.confidenceThreshold === "number" ? result.confidenceThreshold : DEFAULT_CONFIDENCE_THRESHOLD
      };
      const bestTarget = normalizedTargets[0] || null;
      const threshold = nextTargets.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
      console.log("[REAL_APP_FLOW] targets detected", {
        app: nextTargets.app,
        targetCount: normalizedTargets.length,
        topConfidence: bestTarget?.confidence ?? null,
        needsConfirmation: !bestTarget || (bestTarget.confidence ?? 0) < threshold
      });
      setRealAppTargets(nextTargets);
      setSelectedRealAppTarget(bestTarget);
      if (!bestTarget) {
        setRealAppNotice("No clear target found. Pick a target manually.");
        setIsManualTargetPicking(true);
      } else if ((bestTarget.confidence ?? 0) < threshold) {
        setRealAppNotice("Low confidence. Confirm one target or pick manually.");
      } else {
        setRealAppNotice("Confirm the target before the ghost starts.");
      }
    } catch (error) {
      console.error("[REAL_APP_TEST] failed:", error);
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  };
  const selectRealAppTarget = (target) => {
    const normalized = normalizedRealAppTarget(target);
    console.log("[REAL_APP_FLOW] target selected", {
      label: normalized.label,
      x: normalized.x,
      y: normalized.y,
      confidence: normalized.confidence,
      source: normalized.source
    });
    setSelectedRealAppTarget(normalized);
    setIsManualTargetPicking(false);
    setRealAppNotice("Confirm the target before the ghost starts.");
  };
  const startManualTargetPicking = () => {
    console.log("[MANUAL_TARGET] manual target picking armed");
    setIsManualTargetPicking(true);
    setRealAppNotice("Click the real-app target location. Press Escape to cancel.");
  };
  const handleManualTargetPick = (event) => {
    if (!isManualTargetPicking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = normalizedRealAppTarget({
      id: "manual-real-app-target",
      label: "Manual target",
      description: "Chosen by developer during Real App Test",
      x: (event.clientX - rect.left) / rect.width * 100,
      y: (event.clientY - rect.top) / rect.height * 100,
      confidence: 1,
      action: "click",
      source: "manual"
    });
    console.log("[REAL_APP_FLOW] manual target picked", {
      x: target.x,
      y: target.y
    });
    setSelectedRealAppTarget(target);
    setRealAppTargets((current) => ({
      ...current || {
        app: "Manual",
        prompt: realAppIntent || intent || DEFAULT_REAL_APP_PROMPT,
        microTask: "First, I will teach one manually selected action.",
        needsConfirmation: true,
        confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD
      },
      targets: [target, ...(current?.targets || []).filter((item) => item.source !== "manual")]
    }));
    setIsManualTargetPicking(false);
    setRealAppNotice("Manual target saved. Confirm to start the ghost.");
  };
  const startRealAppWalkthrough = async () => {
    if (!selectedRealAppTarget) {
      setRealAppNotice("Pick or confirm a target first.");
      return;
    }
    const target = normalizedRealAppTarget(selectedRealAppTarget);
    const workflowInput = {
      intent: realAppIntent || intent || DEFAULT_REAL_APP_PROMPT,
      microTask: realAppTargets?.microTask || "First, I will teach one visible action.",
      source: target.source,
      target: {
        ...target,
        instruction: realAppInstruction(target)
      }
    };
    setErrorMessage("");
    setIsLoading(true);
    setLoadingMessage("Starting real-app walkthrough...");
    try {
      const workflow = await api.createRealAppWorkflow(workflowInput);
      const nodeId = workflow?.nodeId;
      if (!nodeId) throw new Error("Specter could not save the real-app walkthrough.");
      console.log("[REAL_APP_WALKTHROUGH] starting", {
        nodeId,
        label: target.label,
        x: target.x,
        y: target.y,
        source: target.source
      });
      setLastNodeId(nodeId);
      setIntent(workflow?.intent || workflowInput.intent);
      setReplayMode("walkthrough");
      setReplayState("running");
      await api.walkthrough(nodeId);
      await api.markNodeComplete(nodeId);
      setRealAppTargets(null);
      setSelectedRealAppTarget(null);
      setRealAppNotice("");
    } catch (error) {
      console.error("[REAL_APP_WALKTHROUGH] failed:", error);
      setErrorMessage(messageFromError(error));
      setReplayState("idle");
      setReplayMode(null);
    } finally {
      setIsLoading(false);
    }
  };
  const runCoordinateCalibration = async () => {
    setErrorMessage("");
    try {
      const diagnostics = await api.getCursorCalibration();
      const percent = diagnostics?.computedPercent || {};
      const center = diagnostics?.toScreenPoint50_50 || {};
      const scale = diagnostics?.primaryDisplay?.scaleFactor;
      setCalibrationMessage(
        `Mouse ${formatCoordinate(percent.x)}, ${formatCoordinate(percent.y)} percent. Center maps to ${center.x ?? "?"}, ${center.y ?? "?"}. Scale ${scale ?? "?"}.`
      );
    } catch (error) {
      console.error("[Overlay] Coordinate diagnostics failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };
  const moveCursorToScreenCenter = async () => {
    if (!window.confirm("Move your real mouse to the screen center?")) return;
    setErrorMessage("");
    try {
      await api.moveCursorToScreenCenter();
      setCalibrationMessage("Center move requested. Verify the cursor landed at the visual center.");
    } catch (error) {
      console.error("[Overlay] Center move failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };
  if (!isVisible && replayState === "idle" && !isLoading) return null;
  const isReplayRunning = replayState === "running";
  const showWalkthroughDebug = SHOW_WALKTHROUGH_DEBUG;
  const statusText = currentStep ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${currentStep.instruction || currentStep.targetLabel || (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")}` : replayMode === "auto" ? "Executing workflow..." : "Walkthrough running...";
  const realAppConfidenceThreshold = realAppTargets?.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
  const realAppMarkerTargets = realAppTargets?.targets || [];
  const showRealAppVerification = Boolean(realAppTargets || selectedRealAppTarget || isManualTargetPicking);
  const selectedTargetConfidence = selectedRealAppTarget?.confidence;
  const selectedTargetIsLowConfidence = typeof selectedTargetConfidence === "number" && selectedTargetConfidence < realAppConfidenceThreshold;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "overlay-container",
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isVisible ? "rgba(0, 0, 0, 0.04)" : "transparent",
        fontFamily: "Inter, system-ui, sans-serif",
        transition: "background 0.5s ease"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "siri-glow-fullscreen", style: { opacity: isVisible ? 1 : 0, transition: "opacity 0.8s ease", pointerEvents: "none" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(GhostCursor, { step: currentStep || (isVisible ? { type: "idle" } : null) }),
        isManualTargetPicking && !isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            onClick: handleManualTargetPick,
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 10002,
              cursor: "crosshair",
              pointerEvents: "auto",
              background: "rgba(0, 0, 0, 0.08)"
            }
          }
        ),
        !isReplayRunning && !isManualTargetPicking && realAppMarkerTargets.map((target, index) => {
          const isSelected = selectedRealAppTarget && Math.abs(selectedRealAppTarget.x - target.x) < 0.01 && Math.abs(selectedRealAppTarget.y - target.y) < 0.01 && selectedRealAppTarget.label === target.label;
          const lowConfidence = typeof target.confidence === "number" && target.confidence < realAppConfidenceThreshold;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => selectRealAppTarget(target),
              title: `${target.label} (${confidencePercent(target.confidence)})`,
              style: {
                position: "fixed",
                left: `${target.x}vw`,
                top: `${target.y}vh`,
                transform: "translate(-50%, -50%)",
                zIndex: 10003,
                width: isSelected ? "34px" : "28px",
                height: isSelected ? "34px" : "28px",
                borderRadius: "999px",
                border: isSelected ? "2px solid rgba(255,255,255,0.92)" : "1px solid rgba(255,255,255,0.75)",
                background: lowConfidence ? "rgba(255, 159, 10, 0.92)" : "rgba(10, 132, 255, 0.92)",
                color: "#fff",
                fontSize: "12px",
                fontWeight: 900,
                lineHeight: 1,
                boxShadow: "0 8px 24px rgba(0,0,0,0.34)",
                cursor: "pointer",
                pointerEvents: "auto"
              },
              children: index + 1
            },
            `${target.id || target.label}-${index}`
          );
        }),
        selectedRealAppTarget && !isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "fixed",
              left: `${selectedRealAppTarget.x}vw`,
              top: `${selectedRealAppTarget.y}vh`,
              transform: "translate(-50%, -50%)",
              zIndex: 10001,
              width: "54px",
              height: "54px",
              borderRadius: "999px",
              border: "2px solid rgba(48, 209, 88, 0.82)",
              background: "rgba(48, 209, 88, 0.14)",
              boxShadow: "0 0 0 8px rgba(48, 209, 88, 0.08)",
              pointerEvents: "none"
            }
          }
        ),
        showWalkthroughDebug,
        false,
        isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
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
            },
            children: loadingMessage
          }
        ),
        errorMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "fixed",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(180, 32, 42, 0.88)",
              color: "#fff",
              padding: "10px 16px",
              borderRadius: "16px",
              fontSize: "13px",
              fontWeight: 600,
              maxWidth: "min(620px, calc(100vw - 32px))",
              textAlign: "center",
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
              zIndex: 1e4
            },
            children: errorMessage
          }
        ),
        isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "fixed",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(20, 20, 24, 0.76)",
              color: "#fff",
              padding: "9px 14px",
              borderRadius: "16px",
              fontSize: "13px",
              fontWeight: 600,
              maxWidth: "min(520px, calc(100vw - 32px))",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
              zIndex: 9999
            },
            children: statusText
          }
        ),
        manualConfirmMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "fixed",
              bottom: "72px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10, 84, 150, 0.9)",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: "14px",
              fontSize: "13px",
              fontWeight: 700,
              maxWidth: "min(520px, calc(100vw - 32px))",
              textAlign: "center",
              boxShadow: "0 10px 28px rgba(0,0,0,0.24)",
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
              zIndex: 1e4
            },
            children: manualConfirmMessage
          }
        ),
        isVisible && !isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onMouseEnter: () => {
              console.log("[OVERLAY_INTERACTION] mouse entered Specter UI");
              setInteractivity(true);
            },
            onMouseLeave: () => {
              console.log("[OVERLAY_INTERACTION] mouse left Specter UI");
              setInteractivity(false);
            },
            style: {
              position: "absolute",
              bottom: "10%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              width: "80%",
              maxWidth: "600px",
              pointerEvents: "auto",
              zIndex: 10004
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "12px", width: "100%", justifyContent: "center" }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ModeToggle, { mode, onChange: setMode }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setShowDebugTools(!showDebugTools),
                    style: {
                      background: showDebugTools ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "8px",
                      padding: "4px 8px",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    },
                    children: showDebugTools ? "⚙️ Hide Debug" : "⚙️ Debug"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  onMouseEnter: () => setInteractivity(true),
                  onMouseLeave: () => setInteractivity(false),
                  style: { width: "100%", position: "relative" },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      InputBar,
                      {
                        onSubmit: startRealAppTest,
                        disabled: isLoading,
                        onFocus: () => {
                          console.log("[OVERLAY_INTERACTION] input focused");
                          setIsInputFocused(true);
                        },
                        onBlur: () => {
                          console.log("[OVERLAY_INTERACTION] input blurred");
                          setIsInputFocused(false);
                        }
                      }
                    ),
                    !intent && screenState?.app && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                      position: "absolute",
                      top: "-24px",
                      left: "20px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.42)",
                      letterSpacing: "0.2px"
                    }, children: [
                      "Looking at ",
                      screenState.app
                    ] })
                  ]
                }
              ),
              showDebugTools && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
                width: "100%",
                background: "rgba(12, 14, 18, 0.45)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "14px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: "10px", fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }, children: "Debug / Demo Tools" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      disabled: isLoading,
                      onClick: prepareControlledDemo,
                      style: {
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,255,255,0.1)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      },
                      children: "Use controlled demo"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      disabled: isLoading,
                      onClick: runCoordinateCalibration,
                      style: {
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(10,132,255,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      },
                      children: "Log calibration"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      disabled: isLoading || !intent,
                      onClick: () => runLegacyPlannerFlow(intent),
                      style: {
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(191,90,242,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      },
                      children: "Legacy planner"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      disabled: isLoading,
                      onClick: moveCursorToScreenCenter,
                      style: {
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(48,209,88,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer"
                      },
                      children: "Move center"
                    }
                  )
                ] }),
                calibrationMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "rgba(255,255,255,0.5)", fontSize: "10px" }, children: calibrationMessage }),
                showRealAppVerification && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "div",
                  {
                    onClick: (event) => event.stopPropagation(),
                    style: {
                      width: "100%",
                      background: "rgba(12, 14, 18, 0.86)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "16px",
                      padding: "14px",
                      color: "#fff",
                      boxShadow: "0 16px 42px rgba(0,0,0,0.34)",
                      backdropFilter: "blur(18px)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    },
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px"
                          },
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  style: {
                                    fontSize: "11px",
                                    color: "rgba(255,255,255,0.58)",
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    letterSpacing: 0
                                  },
                                  children: "Real App Test"
                                }
                              ),
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  style: {
                                    fontSize: "15px",
                                    fontWeight: 800,
                                    marginTop: "2px"
                                  },
                                  children: realAppTargets?.microTask || "First, I will teach one visible action."
                                }
                              )
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                              "div",
                              {
                                style: {
                                  fontSize: "11px",
                                  color: "rgba(255,255,255,0.72)",
                                  fontWeight: 700,
                                  textAlign: "right",
                                  maxWidth: "160px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                },
                                children: realAppTargets?.app || "Real app"
                              }
                            )
                          ]
                        }
                      ),
                      realAppNotice && /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "div",
                        {
                          style: {
                            color: selectedTargetIsLowConfidence ? "#ffd60a" : "rgba(255,255,255,0.72)",
                            fontSize: "12px",
                            fontWeight: 700,
                            lineHeight: 1.35
                          },
                          children: realAppNotice
                        }
                      ),
                      selectedRealAppTarget ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          style: {
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: "10px",
                            alignItems: "center",
                            background: "rgba(255,255,255,0.07)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "12px",
                            padding: "10px"
                          },
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { minWidth: 0 }, children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  style: {
                                    fontSize: "14px",
                                    fontWeight: 850,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  },
                                  children: selectedRealAppTarget.label
                                }
                              ),
                              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                "div",
                                {
                                  style: {
                                    marginTop: "4px",
                                    color: "rgba(255,255,255,0.58)",
                                    fontSize: "11px",
                                    fontWeight: 650,
                                    lineHeight: 1.35
                                  },
                                  children: [
                                    "X ",
                                    formatCoordinate(selectedRealAppTarget.x),
                                    " / Y ",
                                    formatCoordinate(selectedRealAppTarget.y),
                                    " / Confidence",
                                    " ",
                                    confidencePercent(selectedRealAppTarget.confidence)
                                  ]
                                }
                              ),
                              selectedRealAppTarget.description && /* @__PURE__ */ jsxRuntimeExports.jsx(
                                "div",
                                {
                                  style: {
                                    marginTop: "4px",
                                    color: "rgba(255,255,255,0.48)",
                                    fontSize: "11px",
                                    lineHeight: 1.35
                                  },
                                  children: selectedRealAppTarget.description
                                }
                              )
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                              "div",
                              {
                                style: {
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "999px",
                                  background: selectedTargetIsLowConfidence ? "#ff9f0a" : "#30d158",
                                  boxShadow: selectedTargetIsLowConfidence ? "0 0 0 5px rgba(255,159,10,0.15)" : "0 0 0 5px rgba(48,209,88,0.15)"
                                }
                              }
                            )
                          ]
                        }
                      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "div",
                        {
                          style: {
                            color: "rgba(255,255,255,0.64)",
                            fontSize: "12px",
                            fontWeight: 700,
                            lineHeight: 1.35
                          },
                          children: "Pick a numbered marker, or set the target manually."
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: "8px", width: "100%" }, children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            disabled: isLoading || !selectedRealAppTarget,
                            onClick: startRealAppWalkthrough,
                            style: {
                              flex: 1.2,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "10px",
                              padding: "9px 10px",
                              color: "white",
                              background: "rgba(48,209,88,0.28)",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: isLoading || !selectedRealAppTarget ? "default" : "pointer",
                              opacity: isLoading || !selectedRealAppTarget ? 0.48 : 1
                            },
                            children: "Looks right, start"
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            disabled: isLoading,
                            onClick: startManualTargetPicking,
                            style: {
                              flex: 1,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "10px",
                              padding: "9px 10px",
                              color: "white",
                              background: "rgba(10,132,255,0.24)",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: isLoading ? "default" : "pointer",
                              opacity: isLoading ? 0.48 : 1
                            },
                            children: "Pick target manually"
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            disabled: isLoading,
                            onClick: prepareControlledDemo,
                            style: {
                              flex: 1,
                              border: "1px solid rgba(255,255,255,0.12)",
                              borderRadius: "10px",
                              padding: "9px 10px",
                              color: "white",
                              background: "rgba(255,255,255,0.12)",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: isLoading ? "default" : "pointer",
                              opacity: isLoading ? 0.48 : 1
                            },
                            children: "Use controlled demo instead"
                          }
                        )
                      ] })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                SessionPanel,
                {
                  intent,
                  nodeId: lastNodeId,
                  appName: screenState?.app,
                  isBusy: isLoading,
                  isWalkthroughActive: replayMode === "walkthrough" && replayState === "running",
                  onWalkthrough: () => replaySavedWorkflow("walkthrough"),
                  onAutoExecute: () => replaySavedWorkflow("auto")
                }
              )
            ]
          }
        ) })
      ]
    }
  ) });
};
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(OverlayApp, {})
);
