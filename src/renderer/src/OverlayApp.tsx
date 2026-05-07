import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";
import { InputBar } from "../overlay/InputBar";
import { GhostCursor } from "../overlay/GhostCursor";
import { ModeToggle } from "../overlay/ModeToggle";
import { SessionPanel } from "../overlay/SessionPanel";

type SpecterMode = "silent" | "ultra";
type ReplayState = "idle" | "running" | "paused";
type ReplayMode = "walkthrough" | "auto" | null;
type RealAppAction = "click" | "type" | "scroll" | "wait";
type EdgeLightState = "hidden" | "summon" | "idle" | "walkthrough";

interface HudPosition {
  left: number;
  top: number;
}

interface RealAppTarget {
  id?: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  confidence?: number;
  action?: RealAppAction;
  source?: "vision" | "manual";
}

interface RealAppTargetsResult {
  app?: string;
  prompt?: string;
  microTask?: string;
  targets?: RealAppTarget[];
  needsConfirmation?: boolean;
  reason?: string;
  confidenceThreshold?: number;
  error?: string;
  fallbackAvailable?: boolean;
}

const SHOW_WALKTHROUGH_DEBUG = import.meta.env.DEV;
const DEFAULT_REAL_APP_PROMPT = "Teach me one visible action";
const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;
const HUD_VIEWPORT_MARGIN = 12;
const CURSOR_REVEAL_POLL_MS = 70;
const NEAR_TARGET_REVEAL_DISTANCE_PX = 180;
const IDLE_REVEAL_RADIUS = 110;
const WALKTHROUGH_REVEAL_RADIUS = 150;
const NEAR_TARGET_REVEAL_RADIUS = 210;
const IDLE_REVEAL_STRENGTH = 0.28;
const WALKTHROUGH_REVEAL_STRENGTH = 0.48;
const NEAR_TARGET_REVEAL_STRENGTH = 0.72;

function clampHudPosition(
  position: HudPosition,
  width: number,
  height: number,
): HudPosition {
  const maxLeft = Math.max(
    HUD_VIEWPORT_MARGIN,
    window.innerWidth - width - HUD_VIEWPORT_MARGIN,
  );
  const maxTop = Math.max(
    HUD_VIEWPORT_MARGIN,
    window.innerHeight - height - HUD_VIEWPORT_MARGIN,
  );

  return {
    left: Math.min(maxLeft, Math.max(HUD_VIEWPORT_MARGIN, position.left)),
    top: Math.min(maxTop, Math.max(HUD_VIEWPORT_MARGIN, position.top)),
  };
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Specter hit a temporary issue. Try again.";
}

function finitePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

function cursorTargetDistancePx(
  cursorX: number,
  cursorY: number,
  targetX: number,
  targetY: number,
): number {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return Math.hypot(
    ((cursorX - targetX) / 100) * width,
    ((cursorY - targetY) / 100) * height,
  );
}

function cursorRevealTuning(
  isWalkthroughActive: boolean,
  targetDistancePx: number | null,
) {
  const nearTargetFactor =
    targetDistancePx === null
      ? 0
      : Math.max(
          0,
          Math.min(1, 1 - targetDistancePx / NEAR_TARGET_REVEAL_DISTANCE_PX),
        );
  const baseRadius = isWalkthroughActive
    ? WALKTHROUGH_REVEAL_RADIUS
    : IDLE_REVEAL_RADIUS;
  const baseStrength = isWalkthroughActive
    ? WALKTHROUGH_REVEAL_STRENGTH
    : IDLE_REVEAL_STRENGTH;
  const radius = Math.round(
    baseRadius + (NEAR_TARGET_REVEAL_RADIUS - baseRadius) * nearTargetFactor,
  );
  const strength =
    baseStrength +
    (NEAR_TARGET_REVEAL_STRENGTH - baseStrength) * nearTargetFactor;

  return {
    nearTargetFactor,
    radius,
    strength,
  };
}

function formatCoordinate(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1)
    : "?";
}

function confidencePercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function realAppInstruction(target: RealAppTarget): string {
  const label = target.label || "target";
  if (target.action === "type") return `Move to ${label}.`;
  if (target.action === "scroll") return `Scroll near ${label}.`;
  if (target.action === "wait") return `Watch ${label}.`;
  return `Click ${label}.`;
}

function normalizedRealAppTarget(target: RealAppTarget): RealAppTarget {
  return {
    ...target,
    label: target.label?.trim() || "Selected target",
    x:
      typeof target.x === "number" && Number.isFinite(target.x)
        ? Math.min(100, Math.max(0, target.x))
        : 50,
    y:
      typeof target.y === "number" && Number.isFinite(target.y)
        ? Math.min(100, Math.max(0, target.y))
        : 50,
    confidence:
      typeof target.confidence === "number" &&
      Number.isFinite(target.confidence)
        ? Math.min(1, Math.max(0, target.confidence))
        : target.source === "manual"
          ? 1
          : undefined,
    action: ["click", "type", "scroll", "wait"].includes(target.action || "")
      ? target.action
      : "click",
    source: target.source === "manual" ? "manual" : "vision",
  };
}

function walkthroughStepFromReplay(data: any) {
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
    ghostReplayKey: `${data.index}:${data.attempt ?? 0}`,
  };
}

const OverlayApp: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mode, setMode] = useState<SpecterMode>("silent");
  const [intent, setIntent] = useState("");
  const [currentStep, setCurrentStep] = useState<any>(null);
  const [replayState, setReplayState] = useState<ReplayState>("idle");
  const [replayMode, setReplayMode] = useState<ReplayMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Analyzing your screen...",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [lastNodeId, setLastNodeId] = useState("");
  const [manualConfirmMessage, setManualConfirmMessage] = useState("");
  const [calibrationMessage, setCalibrationMessage] = useState("");
  const [realAppIntent, setRealAppIntent] = useState("");
  const [realAppTargets, setRealAppTargets] =
    useState<RealAppTargetsResult | null>(null);
  const [selectedRealAppTarget, setSelectedRealAppTarget] =
    useState<RealAppTarget | null>(null);
  const [isManualTargetPicking, setIsManualTargetPicking] = useState(false);
  const [realAppNotice, setRealAppNotice] = useState("");
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [screenState, setScreenState] = useState<any>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isClickThrough, setIsClickThrough] = useState(true);
  const [hudPosition, setHudPosition] = useState<HudPosition | null>(null);
  const [isHudDragging, setIsHudDragging] = useState(false);
  const [summonSettled, setSummonSettled] = useState(false);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const hudDragOffsetRef = useRef({ x: 0, y: 0 });
  const isHudHoveredRef = useRef(false);
  const isHudDraggingRef = useRef(false);
  const isInputFocusedRef = useRef(false);

  const setInteractivity = (interactive: boolean) => {
    // Only go click-through if mouse is out AND input is not focused
    if (!interactive && (isInputFocusedRef.current || isHudDraggingRef.current))
      return;
    const next = !interactive;
    setIsClickThrough(next);
    void api.setOverlayClickThrough(next);
  };

  useEffect(() => {
    isInputFocusedRef.current = isInputFocused;
  }, [isInputFocused]);

  useEffect(() => {
    if (!isVisible) {
      setSummonSettled(false);
      return;
    }

    setSummonSettled(false);
    const timer = window.setTimeout(() => setSummonSettled(true), 1100);
    return () => window.clearTimeout(timer);
  }, [isVisible]);

  useEffect(() => {
    const clampToViewport = () => {
      const hud = hudRef.current;
      if (!hud) return;

      const rect = hud.getBoundingClientRect();
      setHudPosition((current) =>
        current ? clampHudPosition(current, rect.width, rect.height) : current,
      );
    };

    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  useEffect(() => {
    const shouldTrackCursor = isVisible || replayState !== "idle" || isLoading;
    if (!shouldTrackCursor) return;

    let isDisposed = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;
    let hasLoggedCursorError = false;

    const isWalkthroughActive =
      replayMode === "walkthrough" && replayState === "running";
    const revealTarget =
      isWalkthroughActive && currentStep ? currentStep : selectedRealAppTarget;
    const targetX = finitePercent(revealTarget?.x);
    const targetY = finitePercent(revealTarget?.y);

    const updateCursorReveal = async () => {
      try {
        const position = api.getCursorPercent
          ? await api.getCursorPercent()
          : null;
        const cursorX = finitePercent(position?.x);
        const cursorY = finitePercent(position?.y);
        const overlay = overlayRef.current;

        if (overlay && cursorX !== null && cursorY !== null) {
          const distancePx =
            targetX !== null && targetY !== null
              ? cursorTargetDistancePx(cursorX, cursorY, targetX, targetY)
              : null;
          const reveal = cursorRevealTuning(isWalkthroughActive, distancePx);
          const centerAlpha = Math.max(0.18, 1 - reveal.strength);
          const midAlpha = Math.min(1, centerAlpha + reveal.strength * 0.55);

          overlay.style.setProperty("--cursor-x", `${cursorX}vw`);
          overlay.style.setProperty("--cursor-y", `${cursorY}vh`);
          overlay.style.setProperty("--reveal-radius", `${reveal.radius}px`);
          overlay.style.setProperty(
            "--reveal-strength",
            reveal.strength.toFixed(3),
          );
          overlay.style.setProperty(
            "--reveal-center-alpha",
            centerAlpha.toFixed(3),
          );
          overlay.style.setProperty("--reveal-mid-alpha", midAlpha.toFixed(3));
          overlay.dataset.cursorReveal =
            reveal.nearTargetFactor > 0.35
              ? "near-target"
              : isWalkthroughActive
                ? "walkthrough"
                : "idle";
        }
      } catch (error) {
        if (!hasLoggedCursorError) {
          console.warn("[CURSOR_REVEAL] cursor tracking unavailable:", error);
          hasLoggedCursorError = true;
        }
      } finally {
        if (!isDisposed) {
          timer = window.setTimeout(
            updateCursorReveal,
            isWalkthroughActive ? 55 : CURSOR_REVEAL_POLL_MS,
          );
        }
      }
    };

    void updateCursorReveal();

    return () => {
      isDisposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isVisible,
    isLoading,
    replayMode,
    replayState,
    currentStep?.x,
    currentStep?.y,
    selectedRealAppTarget?.x,
    selectedRealAppTarget?.y,
  ]);

  // Overlay visibility + replay lifecycle events
  useEffect(() => {
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

    const offConfirmNeeded = api.onReplayConfirmNeeded((data: any) => {
      setManualConfirmMessage(
        data?.message ||
          "Click not detected. Press Space to confirm this step.",
      );
      setIsLoading(false);
    });

    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage("");
    });

    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage(
        "Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry.",
      );
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

  // Detect current app context when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      // Cheap text only; do not call Claude Vision on toggle
      setScreenState((prev: any) => prev || { app: "current app" });
    } else {
      setScreenState(null);
    }
  }, [isVisible]);

  // Option + D to toggle debug tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setShowDebugTools((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Return to click-through if input is blurred and mouse is not over UI
  useEffect(() => {
    if (!isInputFocused) {
      console.log(
        "[OVERLAY_INTERACTION] input blurred, restoring click-through",
      );
      setInteractivity(false);
    }
  }, [isInputFocused]);

  useEffect(() => {
    if (!manualConfirmMessage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      void api.confirmReplayStep().catch((error: unknown) => {
        console.error("[Overlay] Replay confirmation failed:", error);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manualConfirmMessage]);

  useEffect(() => {
    if (!isManualTargetPicking) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsManualTargetPicking(false);
        setRealAppNotice("Manual target picking canceled.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isManualTargetPicking]);

  useEffect(() => {
    if (!realAppTargets || replayState === "running") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      startManualTargetPicking();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [realAppTargets, replayState]);

  // Listen for walkthrough step events (clears loading once first step fires)
  useEffect(() => {
    const offStep = api.onReplayStep((data: any) => {
      setCurrentStep(walkthroughStepFromReplay(data));
      setReplayMode("walkthrough");
      setReplayState("running");
      setIsLoading(false);
    });

    const offRetry = api.onReplayRetry((data: any) => {
      setCurrentStep(walkthroughStepFromReplay(data));
      setReplayMode("walkthrough");
      setReplayState("running");
      setIsLoading(false);
    });

    const offTargetReached = api.onReplayTargetReached((data: any) => {
      setCurrentStep((current: any) => {
        if (!current || current.index !== data.index) return current;
        return {
          ...current,
          ghostLoop: false,
          ghostLocked: true,
        };
      });
    });

    return () => {
      offStep();
      offRetry();
      offTargetReached();
    };
  }, []);

  // Listen for auto-execute progress events
  useEffect(() => {
    const offProgress = api.onReplayProgress((data: any) => {
      setReplayState("running");
      setReplayMode("auto");
      setCurrentStep({ index: data.index, total: data.total });
    });

    return () => {
      offProgress();
    };
  }, []);

  const runLegacyPlannerFlow = async (text: string) => {
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
    let selectedArm: string | null = null;

    try {
      const res = await api.analyzeScreen(undefined, {
        captureUnderlying: true,
      });
      if (res?.error === "AI_BACKEND_UNAVAILABLE") {
        setErrorMessage(
          "AI vision is unavailable right now. You can still use Controlled Demo or pick a target manually.",
        );
        setIsLoading(false);
        return;
      }
      setScreenState(res);

      setLoadingMessage("Planning the walkthrough...");
      const plan = await api.planSteps(trimmed, res, [], mode);
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        throw new Error(
          "Specter could not create a usable plan for that intent.",
        );
      }

      const nodeId =
        typeof plan.levelTitle === "string" && plan.levelTitle.trim()
          ? plan.levelTitle
          : trimmed;
      setLastNodeId(nodeId);

      setLoadingMessage("Saving the workflow...");
      await api.saveNode(nodeId, plan.steps);

      if (mode === 'ultra') {
        void api.speak(`Starting: ${nodeId}`).catch((error: unknown) => {
          console.error("[Overlay] TTS failed:", error);
        });
      } else if (api.stopSpeaking) {
        void api.stopSpeaking().catch(() => undefined);
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
      const reward = elapsed < 15000 ? 1 : elapsed < 45000 ? 0.5 : 0;
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

  const replaySavedWorkflow = async (kind: Exclude<ReplayMode, null>) => {
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
    setLoadingMessage(
      kind === "walkthrough"
        ? "Starting walkthrough..."
        : "Starting auto-execute...",
    );
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

  const startRealAppTest = async (text: string) => {
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
      const result = await api.detectRealAppTargets(testIntent);
      if (result?.error === "AI_BACKEND_UNAVAILABLE") {
        setRealAppTargets({
          error: "AI_BACKEND_UNAVAILABLE",
          fallbackAvailable: true,
          targets: [],
          microTask:
            "AI vision is unavailable right now. You can still use Controlled Demo or pick a target manually.",
          app: "Unavailable",
          confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
        });
        setSelectedRealAppTarget(null);
        setIsLoading(false);
        return;
      }
      const normalizedTargets = Array.isArray(result?.targets)
        ? result.targets.map((target: RealAppTarget) =>
            normalizedRealAppTarget(target),
          )
        : [];
      const nextTargets: RealAppTargetsResult = {
        ...result,
        targets: normalizedTargets,
        confidenceThreshold:
          typeof result?.confidenceThreshold === "number"
            ? result.confidenceThreshold
            : DEFAULT_CONFIDENCE_THRESHOLD,
      };
      const bestTarget = normalizedTargets[0] || null;
      const threshold =
        nextTargets.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;

      setRealAppTargets(nextTargets);
      setSelectedRealAppTarget(bestTarget);

      if (!bestTarget) {
        setRealAppNotice("No clear target found. Pick a target manually.");
        setIsManualTargetPicking(true);
      } else if ((bestTarget.confidence ?? 0) < threshold) {
        setRealAppNotice(
          "Low confidence. Confirm one target or pick manually.",
        );
      } else {
        setRealAppNotice("Confirm the target before the ghost starts.");
      }
    } catch (error) {
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const selectRealAppTarget = (target: RealAppTarget) => {
    const normalized = normalizedRealAppTarget(target);
    console.log("[REAL_APP_FLOW] target selected", {
      label: normalized.label,
      x: normalized.x,
      y: normalized.y,
      confidence: normalized.confidence,
      source: normalized.source,
    });
    setSelectedRealAppTarget(normalized);
    setIsManualTargetPicking(false);
    setRealAppNotice("Confirm the target before the ghost starts.");
  };

  const startManualTargetPicking = () => {
    console.log("[MANUAL_TARGET] manual target picking armed");
    setIsManualTargetPicking(true);
    setRealAppNotice(
      "Click the real-app target location. Press Escape to cancel.",
    );
  };

  const handleManualTargetPick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isManualTargetPicking) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const target = normalizedRealAppTarget({
      id: "manual-real-app-target",
      label: "Manual target",
      description: "Chosen by developer during Real App Test",
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
      confidence: 1,
      action: "click",
      source: "manual",
    });

    console.log("[REAL_APP_FLOW] manual target picked", {
      x: target.x,
      y: target.y,
    });
    setSelectedRealAppTarget(target);
    setRealAppTargets((current) => ({
      ...(current || {
        app: "Manual",
        prompt: realAppIntent || intent || DEFAULT_REAL_APP_PROMPT,
        microTask: "First, I will teach one manually selected action.",
        needsConfirmation: true,
        confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
      }),
      targets: [
        target,
        ...(current?.targets || []).filter((item) => item.source !== "manual"),
      ],
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
      microTask:
        realAppTargets?.microTask || "First, I will teach one visible action.",
      source: target.source,
      target: {
        ...target,
        instruction: realAppInstruction(target),
      },
    };

    setErrorMessage("");
    setIsLoading(true);
    setLoadingMessage("Starting real-app walkthrough...");

    try {
      const workflow = await api.createRealAppWorkflow(workflowInput);
      const nodeId = workflow?.nodeId;
      if (!nodeId)
        throw new Error("Specter could not save the real-app walkthrough.");

      console.log("[REAL_APP_WALKTHROUGH] starting", {
        nodeId,
        label: target.label,
        x: target.x,
        y: target.y,
        source: target.source,
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
        `Mouse ${formatCoordinate(percent.x)}, ${formatCoordinate(percent.y)} percent. Center maps to ${center.x ?? "?"}, ${center.y ?? "?"}. Scale ${scale ?? "?"}.`,
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
      setCalibrationMessage(
        "Center move requested. Verify the cursor landed at the visual center.",
      );
    } catch (error) {
      console.error("[Overlay] Center move failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };

  const startHudDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const hud = hudRef.current;
    if (!hud) return;

    const rect = hud.getBoundingClientRect();
    hudDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    isHudDraggingRef.current = true;
    setIsHudDragging(true);
    setHudPosition({ left: rect.left, top: rect.top });
    setInteractivity(true);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveHudDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHudDraggingRef.current) return;

    const hud = hudRef.current;
    if (!hud) return;

    const rect = hud.getBoundingClientRect();
    const nextPosition = {
      left: event.clientX - hudDragOffsetRef.current.x,
      top: event.clientY - hudDragOffsetRef.current.y,
    };
    setHudPosition(clampHudPosition(nextPosition, rect.width, rect.height));
  };

  const stopHudDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isHudDraggingRef.current) return;

    isHudDraggingRef.current = false;
    setIsHudDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (isHudHoveredRef.current) {
      setInteractivity(true);
    } else {
      setInteractivity(false);
    }
  };

  const resetHudPosition = () => {
    setHudPosition(null);
  };

  if (!isVisible && replayState === "idle" && !isLoading) return null;

  const isReplayRunning = replayState === "running";
  const showWalkthroughDebug =
    SHOW_WALKTHROUGH_DEBUG && replayMode === "walkthrough" && currentStep;
  const statusText = currentStep
    ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${
        currentStep.instruction ||
        currentStep.targetLabel ||
        (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")
      }`
    : replayMode === "auto"
      ? "Executing workflow..."
      : "Walkthrough running...";
  const realAppConfidenceThreshold =
    realAppTargets?.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
  const realAppMarkerTargets = realAppTargets?.targets || [];
  const showRealAppVerification = Boolean(
    realAppTargets || selectedRealAppTarget || isManualTargetPicking,
  );
  const showFallbackWorkflow = Boolean(realAppTargets?.fallbackAvailable);
  const showWorkflowCard = showFallbackWorkflow || showRealAppVerification;
  const selectedTargetConfidence = selectedRealAppTarget?.confidence;
  const selectedTargetIsLowConfidence =
    typeof selectedTargetConfidence === "number" &&
    selectedTargetConfidence < realAppConfidenceThreshold;
  const edgeLightState: EdgeLightState = !isVisible
    ? "hidden"
    : isReplayRunning
      ? "walkthrough"
      : summonSettled
        ? "idle"
        : "summon";
  const overlayClassName = [
    "overlay-container",
    `overlay-state-${edgeLightState}`,
    isInputFocused ? "overlay-state-focused" : "",
    isHudDragging ? "overlay-hud-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const hudStyle: React.CSSProperties = hudPosition
    ? {
        position: "absolute",
        left: `${hudPosition.left}px`,
        top: `${hudPosition.top}px`,
      }
    : {
        position: "absolute",
        left: "50%",
        bottom: "10%",
        transform: "translateX(-50%)",
      };

  return (
    <>
      <div
        ref={overlayRef}
        className={overlayClassName}
        style={
          {
            "--cursor-x": "50vw",
            "--cursor-y": "50vh",
            "--reveal-radius": `${IDLE_REVEAL_RADIUS}px`,
            "--reveal-strength": `${IDLE_REVEAL_STRENGTH}`,
            "--reveal-center-alpha": `${1 - IDLE_REVEAL_STRENGTH}`,
            "--reveal-mid-alpha": "0.88",
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
            background: "transparent",
            fontFamily: "Inter, system-ui, sans-serif",
            transition: "background 0.5s ease",
          } as React.CSSProperties
        }
      >
        <div className="specter-overlay-wash" />
        <div
          className="siri-glow-fullscreen"
          style={{ pointerEvents: "none" }}
        />
        <GhostCursor
          step={currentStep || (isVisible ? { type: "idle" } : null)}
        />

        {isManualTargetPicking && !isReplayRunning && (
          <div
            onClick={handleManualTargetPick}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10002,
              cursor: "crosshair",
              pointerEvents: "auto",
              background: "rgba(0, 0, 0, 0.08)",
            }}
          />
        )}

        {!isReplayRunning &&
          !isManualTargetPicking &&
          realAppMarkerTargets.map((target, index) => {
            const isSelected =
              selectedRealAppTarget &&
              Math.abs(selectedRealAppTarget.x - target.x) < 0.01 &&
              Math.abs(selectedRealAppTarget.y - target.y) < 0.01 &&
              selectedRealAppTarget.label === target.label;
            const lowConfidence =
              typeof target.confidence === "number" &&
              target.confidence < realAppConfidenceThreshold;

            return (
              <button
                key={`${target.id || target.label}-${index}`}
                onClick={() => selectRealAppTarget(target)}
                title={`${target.label} (${confidencePercent(target.confidence)})`}
                style={{
                  position: "fixed",
                  left: `${target.x}vw`,
                  top: `${target.y}vh`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10003,
                  width: isSelected ? "34px" : "28px",
                  height: isSelected ? "34px" : "28px",
                  borderRadius: "999px",
                  border: isSelected
                    ? "2px solid rgba(255,255,255,0.92)"
                    : "1px solid rgba(255,255,255,0.75)",
                  background: lowConfidence
                    ? "rgba(255, 159, 10, 0.92)"
                    : "rgba(10, 132, 255, 0.92)",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 900,
                  lineHeight: 1,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.34)",
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
              >
                {index + 1}
              </button>
            );
          })}

        {selectedRealAppTarget && !isReplayRunning && (
          <div
            style={{
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
              pointerEvents: "none",
            }}
          />
        )}

        {showWalkthroughDebug && (
          <div
            className="walkthrough-debug-pill"
            style={{
              position: "fixed",
              top: "12px",
              left: "12px",
              background: "rgba(18, 18, 22, 0.72)",
              color: "rgba(255, 255, 255, 0.92)",
              padding: "5px 8px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: 0,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
              zIndex: 10001,
            }}
          >
            {`STEP ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}  X ${formatCoordinate(currentStep.x)}  Y ${formatCoordinate(currentStep.y)}`}
          </div>
        )}

        {import.meta.env.DEV && isReplayRunning && currentStep && (
          <div
            style={{
              position: "fixed",
              top: "12px",
              right: "12px",
              background: "rgba(18, 18, 22, 0.72)",
              color: "rgba(255, 255, 255, 0.92)",
              padding: "5px 8px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: 0,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
              backdropFilter: "blur(10px)",
              pointerEvents: "none",
              zIndex: 10001,
            }}
          >
            {`click-through: ${isClickThrough ? "ON" : "OFF"} | step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"} | target X ${formatCoordinate(currentStep.x)} Y ${formatCoordinate(currentStep.y)} | waiting: ${manualConfirmMessage ? "fallback" : currentStep.ghostLocked ? "click" : currentStep.ghostLoop !== false ? "approach" : "parked"}`}
          </div>
        )}

        {isLoading && (
          <div
            style={{
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
              zIndex: 9999,
            }}
          >
            {loadingMessage}
          </div>
        )}

        {errorMessage && (
          <div
            style={{
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
              zIndex: 10000,
            }}
          >
            {errorMessage}
          </div>
        )}

        {isReplayRunning && (
          <div
            style={{
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
              zIndex: 9999,
            }}
          >
            {statusText}
          </div>
        )}

        {manualConfirmMessage && (
          <div
            style={{
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
              zIndex: 10000,
            }}
          >
            {manualConfirmMessage}
          </div>
        )}

        {isVisible && !isReplayRunning && (
          <>
            <div
              ref={hudRef}
              className={`specter-hud-shell ${isHudDragging ? "is-dragging" : ""}`}
              onMouseEnter={() => {
                console.log("[OVERLAY_INTERACTION] mouse entered Specter UI");
                isHudHoveredRef.current = true;
                setInteractivity(true);
              }}
              onMouseLeave={() => {
                console.log("[OVERLAY_INTERACTION] mouse left Specter UI");
                isHudHoveredRef.current = false;
                setInteractivity(false);
              }}
              style={hudStyle}
            >
              <div
                className="specter-hud-drag-handle"
                aria-label="Move Specter HUD"
                title="Move Specter HUD"
                onPointerDown={startHudDrag}
                onPointerMove={moveHudDrag}
                onPointerUp={stopHudDrag}
                onPointerCancel={stopHudDrag}
              >
                <span />
              </div>
              {showWorkflowCard && (
                <div
                  className="specter-workflow-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="specter-workflow-header">
                    <div>
                      <div className="specter-kicker">
                        {showFallbackWorkflow ? "Fallback" : "Guided Workspace"}
                      </div>
                      <div className="specter-workflow-title">
                        {showFallbackWorkflow
                          ? "AI vision is unavailable right now. You can still use Controlled Demo or pick a target manually."
                          : realAppTargets?.microTask ||
                            "First, I will teach one visible action."}
                      </div>
                    </div>
                    <div className="specter-workflow-meta">
                      {showFallbackWorkflow
                        ? "Local demo safe"
                        : realAppTargets?.app || "Real app"}
                    </div>
                  </div>

                  {!showFallbackWorkflow && realAppNotice && (
                    <div
                      className={`specter-workflow-note ${selectedTargetIsLowConfidence ? "is-warning" : ""}`}
                    >
                      {realAppNotice}
                    </div>
                  )}

                  {!showFallbackWorkflow &&
                    (selectedRealAppTarget ? (
                      <div className="specter-target-summary">
                        <div style={{ minWidth: 0 }}>
                          <div className="specter-target-title">
                            {selectedRealAppTarget.label}
                          </div>
                          <div className="specter-target-detail">
                            X {formatCoordinate(selectedRealAppTarget.x)} / Y{" "}
                            {formatCoordinate(selectedRealAppTarget.y)} /
                            Confidence{" "}
                            {confidencePercent(
                              selectedRealAppTarget.confidence,
                            )}
                          </div>
                          {selectedRealAppTarget.description && (
                            <div className="specter-target-detail">
                              {selectedRealAppTarget.description}
                            </div>
                          )}
                        </div>
                        <div
                          className={`specter-target-dot ${selectedTargetIsLowConfidence ? "is-warning" : ""}`}
                        />
                      </div>
                    ) : (
                      <div className="specter-workflow-note">
                        Pick a numbered marker, or set the target manually.
                      </div>
                    ))}

                  <div className="specter-action-row">
                    {showFallbackWorkflow ? (
                      <>
                        <button
                          className="specter-action-button primary"
                          disabled={isLoading}
                          onClick={prepareControlledDemo}
                        >
                          Controlled Demo
                        </button>
                        <button
                          className="specter-action-button blue"
                          disabled={isLoading}
                          onClick={startManualTargetPicking}
                        >
                          Pick manually
                        </button>
                        <button
                          className="specter-action-button"
                          disabled={isLoading}
                          onClick={() => {
                            setRealAppTargets(null);
                            startRealAppTest(
                              realAppIntent ||
                                intent ||
                                DEFAULT_REAL_APP_PROMPT,
                            );
                          }}
                        >
                          Retry AI
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="specter-action-button primary"
                          disabled={isLoading || !selectedRealAppTarget}
                          onClick={startRealAppWalkthrough}
                        >
                          Start ghost
                        </button>
                        <button
                          className="specter-action-button blue"
                          disabled={isLoading}
                          onClick={startManualTargetPicking}
                        >
                          Pick manually
                        </button>
                        <button
                          className="specter-action-button"
                          disabled={isLoading}
                          onClick={prepareControlledDemo}
                        >
                          Controlled Demo
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <ModeToggle mode={mode} onChange={setMode} />
                <button
                  onClick={() => setShowDebugTools(!showDebugTools)}
                  style={{
                    background: showDebugTools
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px",
                    padding: "4px 8px",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {showDebugTools ? "⚙️ Hide Debug" : "⚙️ Debug"}
                </button>
              </div>

              <div
                onMouseEnter={() => setInteractivity(true)}
                onMouseLeave={() => setInteractivity(false)}
                style={{ width: "100%", position: "relative" }}
              >
                <InputBar
                  onSubmit={startRealAppTest}
                  disabled={isLoading}
                  onFocus={() => {
                    console.log("[OVERLAY_INTERACTION] input focused");
                    setIsInputFocused(true);
                  }}
                  onBlur={() => {
                    console.log("[OVERLAY_INTERACTION] input blurred");
                    setIsInputFocused(false);
                  }}
                />
                {!intent && screenState?.app && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-24px",
                      left: "20px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.42)",
                      letterSpacing: "0.2px",
                    }}
                  >
                    Looking at {screenState.app}
                  </div>
                )}
              </div>

              {showDebugTools && (
                <div
                  style={{
                    width: "100%",
                    background: "rgba(12, 14, 18, 0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 800,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase",
                    }}
                  >
                    Debug / Demo Tools
                  </div>
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    <button
                      disabled={isLoading}
                      onClick={prepareControlledDemo}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,255,255,0.1)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Use controlled demo
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={runCoordinateCalibration}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(10,132,255,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Log calibration
                    </button>
                    <button
                      disabled={isLoading || !intent}
                      onClick={() => runLegacyPlannerFlow(intent)}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(191,90,242,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Legacy planner
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={moveCursorToScreenCenter}
                      style={{
                        flex: 1,
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(48,209,88,0.15)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Move center
                    </button>
                    <button
                      onClick={resetHudPosition}
                      style={{
                        flex: 1,
                        minWidth: "110px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        padding: "8px",
                        color: "white",
                        background: "rgba(255,255,255,0.08)",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Reset HUD
                    </button>
                  </div>
                  {calibrationMessage && (
                    <div
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "10px",
                      }}
                    >
                      {calibrationMessage}
                    </div>
                  )}
                </div>
              )}
              {lastNodeId && !showWorkflowCard && (
                <SessionPanel
                  intent={intent}
                  nodeId={lastNodeId}
                  appName={screenState?.app}
                  isBusy={isLoading}
                  isWalkthroughActive={false}
                  onWalkthrough={() => replaySavedWorkflow("walkthrough")}
                  onAutoExecute={() => replaySavedWorkflow("auto")}
                />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default OverlayApp;
