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
const InputBar = ({ onSubmit, disabled = false }) => {
  const [value, setValue] = reactExports.useState("");
  const [isRecording, setIsRecording] = reactExports.useState(false);
  const handleKeyDown = (e) => {
    if (!disabled && e.key === "Enter" && value.trim()) {
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
        disabled,
        onChange: (e) => setValue(e.target.value),
        onKeyDown: handleKeyDown,
        style: {
          flex: 1,
          border: "none",
          background: "transparent",
          fontSize: "18px",
          outline: "none",
          color: "#1a1a1a",
          opacity: disabled ? 0.55 : 1
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
    }, children: "Press Enter" }),
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
  if (!step || typeof step.x !== "number" || typeof step.y !== "number") return null;
  const bubbleOnLeft = step.x > 70;
  const fallback = fallbackStart(step);
  const startX = typeof step.ghostStartX === "number" ? step.ghostStartX : fallback.x;
  const startY = typeof step.ghostStartY === "number" ? step.ghostStartY : fallback.y;
  const fromX = clampPercent(startX) - clampPercent(step.x);
  const fromY = clampPercent(startY) - clampPercent(step.y);
  const shouldLoop = step.ghostLoop !== false && step.action !== "wait" && !step.ghostLocked;
  const hasHint = Boolean(step.instruction || step.targetLabel);
  const motionStyle = {
    "--ghost-from-x": `${fromX}vw`,
    "--ghost-from-y": `${fromY}vh`,
    "--ghost-loop-ms": `${DEMO_LOOP_MS}ms`,
    animation: shouldLoop ? "ghost-cursor-demo var(--ghost-loop-ms) cubic-bezier(0.23, 1, 0.32, 1) infinite" : void 0
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ghost-cursor-container", style: {
    position: "absolute",
    left: `${step.x}%`,
    top: `${step.y}%`,
    transform: "translate(-2px, -2px)",
    pointerEvents: "none",
    zIndex: 9999,
    transition: "left 0.24s ease, top 0.24s ease"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ghost-cursor-ring", style: {
      position: "absolute",
      width: step.ghostLocked ? "48px" : "42px",
      height: step.ghostLocked ? "48px" : "42px",
      borderRadius: "50%",
      border: step.ghostLocked ? "2px solid rgba(48, 209, 88, 0.72)" : "2px solid rgba(10, 132, 255, 0.45)",
      background: step.ghostLocked ? "rgba(48, 209, 88, 0.14)" : "rgba(10, 132, 255, 0.10)",
      animation: step.ghostLocked ? void 0 : "ghost-ring-pulse 1.8s infinite",
      left: step.ghostLocked ? "-23px" : "-20px",
      top: step.ghostLocked ? "-23px" : "-20px",
      transition: "all 0.18s ease"
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
                opacity: step.ghostLocked ? 0.88 : 0.72,
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
      step.ghostReplayKey || `${step.index ?? "step"}:${step.x}:${step.y}`
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
  isBusy = false,
  onWalkthrough,
  onAutoExecute
}) => {
  if (!intent) return null;
  const disabled = isBusy || !nodeId;
  const buttonBase = {
    flex: 1,
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "white",
    fontSize: "13px",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1
  };
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
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
      display: "flex",
      gap: "10px",
      width: "100%"
    }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          disabled,
          onClick: onWalkthrough,
          style: {
            ...buttonBase,
            background: "rgba(255,255,255,0.14)"
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
            background: "linear-gradient(135deg, rgba(10,132,255,0.84), rgba(48,209,88,0.72))"
          },
          children: "Do it for me"
        }
      )
    ] }),
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
const SHOW_WALKTHROUGH_DEBUG = false;
const SHOW_CALIBRATION_DEBUG = false;
function messageFromError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Specter hit a temporary issue. Try again.";
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
  const handleIntentSubmit = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIntent(trimmed);
    setErrorMessage("");
    setLoadingMessage("Analyzing your screen...");
    setIsLoading(true);
    const startTime = Date.now();
    let selectedArm = null;
    try {
      const screenState = await api.analyzeScreen();
      setLoadingMessage("Planning the walkthrough...");
      const plan = await api.planSteps(trimmed, screenState, [], mode);
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
    if (kind === "auto" && !window.confirm("Specter will control your real mouse. Continue?")) return;
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
  if (!isVisible && replayState === "idle" && !isLoading) return null;
  const isReplayRunning = replayState === "running";
  const showWalkthroughDebug = SHOW_WALKTHROUGH_DEBUG;
  const statusText = currentStep ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${currentStep.instruction || currentStep.targetLabel || (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")}` : replayMode === "auto" ? "Executing workflow..." : "Walkthrough running...";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overlay-container", style: {
    width: "100vw",
    height: "100vh",
    position: "relative",
    pointerEvents: isVisible && !isReplayRunning ? "auto" : "none",
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, sans-serif"
  }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(GhostCursor, { step: currentStep }),
    showWalkthroughDebug,
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
    }, children: loadingMessage }),
    errorMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
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
    }, children: errorMessage }),
    isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
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
    }, children: statusText }),
    manualConfirmMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
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
    }, children: manualConfirmMessage }),
    isVisible && !isReplayRunning && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(InputBar, { onSubmit: handleIntentSubmit, disabled: isLoading }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            disabled: isLoading,
            onClick: prepareControlledDemo,
            style: {
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "12px",
              padding: "10px 14px",
              color: "white",
              background: "rgba(255,255,255,0.12)",
              fontSize: "13px",
              fontWeight: 700,
              cursor: isLoading ? "default" : "pointer",
              opacity: isLoading ? 0.55 : 1
            },
            children: "Use controlled demo"
          }
        ),
        SHOW_CALIBRATION_DEBUG,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SessionPanel,
          {
            intent,
            nodeId: lastNodeId,
            isBusy: isLoading,
            onWalkthrough: () => replaySavedWorkflow("walkthrough"),
            onAutoExecute: () => replaySavedWorkflow("auto")
          }
        )
      ] })
    ] })
  ] }) });
};
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(OverlayApp, {})
);
