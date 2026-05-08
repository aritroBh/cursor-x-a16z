import { r as reactExports, j as jsxRuntimeExports, c as client } from "./client-CciThgMB.js";
const api = window.api;
class MicError extends Error {
  userMessage;
  constructor(message, userMessage) {
    super(message);
    this.name = "MicError";
    this.userMessage = userMessage;
  }
}
function classifyGetUserMediaError(error) {
  const name = (error instanceof Error ? error.name : "") || "";
  const message = (error instanceof Error ? error.message : String(error)) || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new MicError(message, "Microphone permission denied. Allow access in System Preferences.");
  }
  if (name === "NotReadableError" || name === "AbortError" || message.toLowerCase().includes("failed to allocate") || message.toLowerCase().includes("could not start")) {
    return new MicError(
      message,
      "Microphone unavailable. Close other voice apps (e.g. ChatGPT voice, Meet) and try again."
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MicError(message, "No microphone found. Plug in a mic and try again.");
  }
  if (name === "SecurityError") {
    return new MicError(message, "Microphone access blocked by security policy.");
  }
  return new MicError(message, "Microphone unavailable. Check permission and try again.");
}
class MicRecorder {
  mediaRecorder = null;
  stream = null;
  chunks = [];
  mimeType = "audio/webm";
  startedAt = 0;
  isRecording = false;
  audioContext = null;
  analyser = null;
  dataArray = null;
  chooseMimeType() {
    if (typeof MediaRecorder.isTypeSupported !== "function") return void 0;
    for (const mimeType of ["audio/webm;codecs=opus", "audio/webm"]) {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    }
    return void 0;
  }
  stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
  async start() {
    console.log("[MIC] start requested");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError(
        "Microphone capture is not available in this browser context.",
        "Microphone capture is not available. Check browser permissions."
      );
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const micError = classifyGetUserMediaError(error);
      console.error("[MIC] getUserMedia failed", { name: error?.name, userMessage: micError.userMessage });
      throw micError;
    }
    console.log("[MIC] permission granted");
    const mimeType = this.chooseMimeType();
    const options = mimeType ? { mimeType } : void 0;
    this.chunks = [];
    this.stream = stream;
    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (error) {
      this.stopTracks();
      throw classifyGetUserMediaError(error);
    }
    this.mimeType = this.mediaRecorder.mimeType || mimeType || "audio/webm";
    this.mediaRecorder.ondataavailable = (e) => {
      console.log("[MIC] data chunk received", { size: e.data.size });
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onerror = (event) => {
      console.error("[MIC] recorder error", event);
    };
    this.mediaRecorder.start(250);
    this.startedAt = Date.now();
    this.isRecording = true;
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.7;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      console.log("[MIC] waveform analyser active");
    } catch (error) {
      console.warn("[MIC] analyser setup failed", error);
    }
  }
  getAudioLevels() {
    if (!this.analyser || !this.dataArray) return null;
    this.analyser.getByteFrequencyData(this.dataArray);
    return this.dataArray;
  }
  async stop() {
    console.log("[MIC] stop requested");
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch (_) {
      }
    }
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    const recorder = this.mediaRecorder;
    if (!recorder) {
      this.isRecording = false;
      this.stopTracks();
      return new ArrayBuffer(0);
    }
    const elapsedMs = Date.now() - this.startedAt;
    if (elapsedMs < 300) {
      await new Promise((resolve) => window.setTimeout(resolve, 300 - elapsedMs));
    }
    return new Promise((resolve) => {
      const finish = async () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        console.log("[MIC] final blob size", { size: blob.size });
        const buffer = await blob.arrayBuffer();
        this.isRecording = false;
        this.mediaRecorder = null;
        this.chunks = [];
        this.stopTracks();
        resolve(buffer);
      };
      recorder.onstop = finish;
      if (recorder.state === "inactive") {
        void finish();
        return;
      }
      try {
        recorder.requestData();
      } catch (error) {
        console.warn("[MIC] requestData failed before stop", error);
      }
      recorder.stop();
    });
  }
}
const CancelIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  "path",
  {
    d: "M6 6l12 12M18 6L6 18",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2"
  }
) });
const ConfirmIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  "path",
  {
    d: "M5 13l4 4L19 7",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2"
  }
) });
const MAX_RECORDING_SECONDS = 30;
const RecordingOverlay = ({
  recorder,
  isTranscribing,
  onCancel,
  onConfirm,
  onMouseEnter,
  onMouseLeave
}) => {
  const canvasRef = reactExports.useRef(null);
  const animRef = reactExports.useRef(0);
  const [elapsed, setElapsed] = reactExports.useState(0);
  const startRef = reactExports.useRef(Date.now());
  const onConfirmRef = reactExports.useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  reactExports.useEffect(() => {
    startRef.current = Date.now();
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startRef.current) / 1e3);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) {
        window.clearInterval(timer);
        console.log("[MIC] max recording duration reached, auto-stopping");
        onConfirmRef.current();
      }
    }, 1e3);
    return () => window.clearInterval(timer);
  }, []);
  reactExports.useEffect(() => {
    if (isTranscribing) return;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const levels = recorder.getAudioLevels();
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);
      if (levels && levels.length > 0) {
        const barCount = 20;
        const gap = 2;
        const barWidth = (width - (barCount - 1) * gap) / barCount;
        for (let i = 0; i < barCount; i++) {
          const idx = Math.floor(i / barCount * levels.length);
          const value = levels[idx] || 0;
          const percent = value / 255;
          const barHeight = Math.max(4, percent * height * 0.9);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, "rgba(10, 132, 255, 0.92)");
          gradient.addColorStop(1, "rgba(191, 90, 242, 0.82)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          ctx.fill();
        }
      } else {
        const t = Date.now() / 400;
        const pulse = 0.5 + 0.5 * Math.sin(t);
        const barHeight = Math.max(4, pulse * height * 0.6);
        const barWidth = width * 0.2;
        const x = (width - barWidth) / 2;
        const y = (height - barHeight) / 2;
        ctx.fillStyle = "rgba(10, 132, 255, 0.72)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    console.log("[MIC] waveform active");
    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [recorder, isTranscribing]);
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs.toString().padStart(2, "0")}`;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `recording-overlay ${isTranscribing ? "is-transcribing" : ""}`,
      role: "dialog",
      "aria-label": "Recording overlay",
      onMouseEnter,
      onMouseLeave,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "recording-overlay-inner", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "canvas",
          {
            ref: canvasRef,
            width: 160,
            height: 32,
            className: "recording-waveform",
            "aria-hidden": "true"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recording-timer", children: isTranscribing ? "Transcribing…" : elapsed >= MAX_RECORDING_SECONDS ? "Recording limit reached" : `Listening… ${formatTime(elapsed)}` }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "recording-overlay-actions", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "recording-overlay-button recording-cancel",
              onClick: onCancel,
              disabled: isTranscribing,
              "aria-label": "Cancel recording",
              title: "Cancel recording",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(CancelIcon, {})
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              className: "recording-overlay-button recording-confirm",
              onClick: onConfirm,
              disabled: isTranscribing,
              "aria-label": "Transcribe recording",
              title: "Transcribe recording",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(ConfirmIcon, {})
            }
          )
        ] })
      ] })
    }
  );
};
const SpecterMarkIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "input-bar-brand-icon", viewBox: "0 0 24 24", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "path",
    {
      d: "M12 2.75l1.75 6.05L19.75 7 15.5 11.95l4.25 5-6-1.8L12 21.25l-1.75-6.1-6 1.8 4.25-5L4.25 7l6 1.8L12 2.75z",
      fill: "currentColor"
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "2.25", fill: "rgba(12, 16, 24, 0.92)" })
] });
const MicrophoneIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "path",
    {
      d: "M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 0 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z",
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.8"
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "path",
    {
      d: "M5.75 10.5v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.5v3M9 20.5h6",
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.8"
    }
  )
] });
const ChevronDownIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  "path",
  {
    d: "M4 6l4 4 4-4",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "1.7"
  }
) });
const SendArrowIcon = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
  "path",
  {
    d: "M5 12h13.5M13.5 6.5 19 12l-5.5 5.5",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: "2"
  }
) });
const InputBar = ({
  onSubmit,
  onNewChat,
  disabled = false,
  onFocus,
  onBlur,
  onRecordingOverlayMouseEnter,
  onRecordingOverlayMouseLeave,
  mode = "silent",
  onUltraSpokenInput
}) => {
  const recorderRef = reactExports.useRef(new MicRecorder());
  const [value, setValue] = reactExports.useState("");
  const [micState, setMicState] = reactExports.useState("idle");
  const [micMessage, setMicMessage] = reactExports.useState("");
  const inputRef = reactExports.useRef(null);
  const recordingActiveRef = reactExports.useRef(false);
  const recordingStartRef = reactExports.useRef(null);
  const recorder = recorderRef.current;
  const canSubmit = Boolean(value.trim()) && !disabled;
  reactExports.useEffect(() => {
    return () => {
      if (recorderRef.current.isRecording) {
        void recorderRef.current.stop().catch(() => void 0);
      }
    };
  }, []);
  const submitValue = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue("");
    setMicMessage("");
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      submitValue();
    }
  };
  const handleNewChat = () => {
    if (disabled) return;
    setValue("");
    onNewChat?.();
  };
  const startRecording = async () => {
    if (disabled || recordingActiveRef.current || micState !== "idle") return;
    setMicMessage("");
    recordingActiveRef.current = true;
    setMicState("recording");
    console.log("[MIC] recording overlay opened");
    recordingStartRef.current = recorder.start();
    try {
      await recordingStartRef.current;
      console.log("[MIC] recording started");
    } catch (error) {
      console.error("[InputBar] Microphone recording failed:", error);
      recordingActiveRef.current = false;
      setMicMessage(error?.userMessage || "Microphone unavailable. Check permission and try again.");
      setMicState("idle");
    }
  };
  const handleCancel = async () => {
    if (micState !== "recording") return;
    console.log("[MIC] cancel clicked");
    recordingActiveRef.current = false;
    setMicState("idle");
    try {
      await recordingStartRef.current;
      await recorder.stop();
    } catch (error) {
      console.warn("[MIC] cancel cleanup error", error);
    } finally {
      recordingStartRef.current = null;
    }
    console.log("[MIC] overlay closed");
  };
  const handleConfirm = async () => {
    if (micState !== "recording" || !recordingActiveRef.current) return;
    console.log("[MIC] confirm clicked");
    recordingActiveRef.current = false;
    setMicState("transcribing");
    try {
      await recordingStartRef.current;
      const buffer = await recorder.stop();
      console.log("[MIC] recording stopped");
      if (!buffer.byteLength) {
        setMicMessage("No audio captured. Speak a little longer.");
        setMicState("idle");
        return;
      }
      console.log("[MIC] transcription started", { size: buffer.byteLength });
      const text = await window.api.transcribe(buffer);
      console.log("[MIC] transcription success", {
        length: typeof text === "string" ? text.length : 0
      });
      if (typeof text === "string" && text.trim()) {
        if (mode === "ultra" && onUltraSpokenInput) {
          console.log("[MIC] ultra mode auto-sending transcription");
          onUltraSpokenInput(text.trim());
          setMicState("idle");
        } else {
          setValue(text.trim());
          setMicMessage("");
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }
      } else {
        setMicMessage("No transcription returned. Try speaking again.");
      }
    } catch (error) {
      console.error("[MIC] transcription failed", error);
      if (error?.code === "WHISPER_TIMEOUT") {
        setMicMessage("Transcription timed out. Try again.");
      } else {
        setMicMessage("Voice transcription failed. You can type instead.");
      }
      setMicState("idle");
    } finally {
      recordingStartRef.current = null;
      if (micState !== "idle") setMicState("idle");
      console.log("[MIC] overlay reset to idle");
    }
  };
  reactExports.useEffect(() => {
    if (micState !== "recording") return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void handleCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [micState]);
  const isOverlayVisible = micState === "recording" || micState === "transcribing";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-bar-wrapper", children: [
    isOverlayVisible && /* @__PURE__ */ jsxRuntimeExports.jsx(
      RecordingOverlay,
      {
        recorder,
        isTranscribing: micState === "transcribing",
        onCancel: handleCancel,
        onConfirm: handleConfirm,
        onMouseEnter: onRecordingOverlayMouseEnter,
        onMouseLeave: onRecordingOverlayMouseLeave
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `input-bar ${disabled ? "is-disabled" : ""}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "input-bar-brand", title: "Specter", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SpecterMarkIcon, {}) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: inputRef,
          autoFocus: true,
          className: "input-bar-field",
          type: "text",
          placeholder: "What can I help you with today?",
          value,
          disabled,
          onChange: (e) => setValue(e.target.value),
          onKeyDown: handleKeyDown,
          onFocus,
          onBlur
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-bar-actions", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: `input-bar-icon-button input-bar-mic-button ${micState === "recording" ? "is-recording" : ""}`,
            disabled: disabled || micState !== "idle",
            onClick: startRecording,
            "aria-label": micState === "recording" ? "Recording in progress" : "Record voice input",
            title: micState === "recording" ? "Recording in progress" : "Record voice input",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(MicrophoneIcon, {})
          }
        ),
        onNewChat && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: "input-bar-new-chat",
            disabled,
            onClick: handleNewChat,
            "aria-label": "Start a new chat",
            title: "Start a new chat",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "New Chat" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDownIcon, {})
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            className: "input-bar-send-button",
            disabled: !canSubmit,
            onClick: submitValue,
            "aria-label": "Send message",
            title: "Send message",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(SendArrowIcon, {})
          }
        )
      ] }),
      micMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "input-bar-mic-message", children: micMessage })
    ] })
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
const UltraReplyBubble = ({ reply, state }) => {
  if (state === "idle" && !reply) return null;
  const getStateText = () => {
    switch (state) {
      case "listening":
        return "Listening...";
      case "transcribing":
        return "Thinking...";
      case "thinking":
        return "Thinking...";
      case "speaking":
        return "Speaking...";
      case "guiding":
        return "Guiding...";
      case "error":
        return "Error";
      case "waitingForUser":
      case "idle":
      default:
        return "Ready";
    }
  };
  const isBusy = ["listening", "transcribing", "thinking", "speaking"].includes(state);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `ultra-reply-bubble ${isBusy ? "is-busy" : ""}`,
      style: {
        marginBottom: "12px",
        padding: "12px 16px",
        background: "rgba(18, 18, 22, 0.85)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        color: "#fff",
        width: "100%",
        boxSizing: "border-box"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: isBusy ? "rgba(191, 90, 242, 0.9)" : "rgba(255, 255, 255, 0.5)",
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }, children: [
          isBusy && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "rgba(191, 90, 242, 0.9)",
            animation: "pulse 1.5s infinite ease-in-out"
          } }),
          !isBusy && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.5)"
          } }),
          getStateText()
        ] }),
        reply && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          fontSize: "14px",
          fontWeight: 500,
          lineHeight: 1.4,
          color: "rgba(255, 255, 255, 0.95)"
        }, children: reply })
      ]
    }
  );
};
const SHOW_WALKTHROUGH_DEBUG = false;
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
function clampHudPosition(position, width, height) {
  const maxLeft = Math.max(
    HUD_VIEWPORT_MARGIN,
    window.innerWidth - width - HUD_VIEWPORT_MARGIN
  );
  const maxTop = Math.max(
    HUD_VIEWPORT_MARGIN,
    window.innerHeight - height - HUD_VIEWPORT_MARGIN
  );
  return {
    left: Math.min(maxLeft, Math.max(HUD_VIEWPORT_MARGIN, position.left)),
    top: Math.min(maxTop, Math.max(HUD_VIEWPORT_MARGIN, position.top))
  };
}
function messageFromError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Specter hit a temporary issue. Try again.";
}
function finitePercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}
function cursorTargetDistancePx(cursorX, cursorY, targetX, targetY) {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return Math.hypot(
    (cursorX - targetX) / 100 * width,
    (cursorY - targetY) / 100 * height
  );
}
function cursorRevealTuning(isWalkthroughActive, targetDistancePx) {
  const nearTargetFactor = targetDistancePx === null ? 0 : Math.max(
    0,
    Math.min(1, 1 - targetDistancePx / NEAR_TARGET_REVEAL_DISTANCE_PX)
  );
  const baseRadius = isWalkthroughActive ? WALKTHROUGH_REVEAL_RADIUS : IDLE_REVEAL_RADIUS;
  const baseStrength = isWalkthroughActive ? WALKTHROUGH_REVEAL_STRENGTH : IDLE_REVEAL_STRENGTH;
  const radius = Math.round(
    baseRadius + (NEAR_TARGET_REVEAL_RADIUS - baseRadius) * nearTargetFactor
  );
  const strength = baseStrength + (NEAR_TARGET_REVEAL_STRENGTH - baseStrength) * nearTargetFactor;
  return {
    nearTargetFactor,
    radius,
    strength
  };
}
function formatCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "?";
}
function confidencePercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}
function formatAIHealthStatus(health) {
  const anthropic = health?.anthropic || {};
  const anthropicKey = anthropic.key || {};
  const testRequest = anthropic.testRequest || {};
  const openai = health?.openai || {};
  const openaiKey = openai.key || {};
  const overall = health?.overall || {};
  const claudeTextStatus = testRequest.pass ? "Claude text test: pass" : `Claude text test: failed (${testRequest.category || "unknown"})`;
  const claudeVisionStatus = `Claude vision/config: ${anthropic.configured ? "ready" : "not configured"}`;
  const whisperStatus = `Whisper voice: ${openai.whisperConfigured ? "ready" : "missing key"}`;
  const overallAppAI = overall.readyForRealAppAI ? "ready" : "not ready";
  const overallVoice = overall.readyForVoice ? "ready" : "not ready";
  const reason = testRequest.reason ? `
Reason: ${testRequest.reason}` : "";
  return [
    `Real-app AI: ${overallAppAI} | Voice: ${overallVoice}`,
    claudeTextStatus,
    claudeVisionStatus,
    `Planner: ${anthropic.plannerModel || "unknown"}, Vision: ${anthropic.visionModel || "unknown"}`,
    whisperStatus,
    `ANTHROPIC_API_KEY present: ${anthropicKey.present ? "true" : "false"}, length: ${anthropicKey.keyLength || 0}, placeholder: ${anthropicKey.placeholderDetected ? "true" : "false"}`,
    `OPENAI_API_KEY present: ${openaiKey.present ? "true" : "false"}, length: ${openaiKey.keyLength || 0}, placeholder: ${openaiKey.placeholderDetected ? "true" : "false"}`,
    `Local model: ${anthropic.useLocalModel ? "enabled" : "disabled"}, base: ${anthropic.baseURLKind || "unknown"}${reason}`
  ].join("\n");
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
  const overlayRef = reactExports.useRef(null);
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [mode, setMode] = reactExports.useState("silent");
  const [intent, setIntent] = reactExports.useState("");
  const [currentStep, setCurrentStep] = reactExports.useState(null);
  const [replayState, setReplayState] = reactExports.useState("idle");
  const [replayMode, setReplayMode] = reactExports.useState(null);
  const [ultraState, setUltraState] = reactExports.useState("idle");
  const [ultraReply, setUltraReply] = reactExports.useState("");
  const [ultraSessionHistory, setUltraSessionHistory] = reactExports.useState([]);
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [loadingMessage, setLoadingMessage] = reactExports.useState(
    "Analyzing your screen..."
  );
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
  const [aiHealthMessage, setAiHealthMessage] = reactExports.useState("");
  const [screenState, setScreenState] = reactExports.useState(null);
  const [isInputFocused, setIsInputFocused] = reactExports.useState(false);
  const [isClickThrough, setIsClickThrough] = reactExports.useState(true);
  const [hudPosition, setHudPosition] = reactExports.useState(null);
  const [isHudDragging, setIsHudDragging] = reactExports.useState(false);
  const [summonSettled, setSummonSettled] = reactExports.useState(false);
  const hudRef = reactExports.useRef(null);
  const hudDragOffsetRef = reactExports.useRef({ x: 0, y: 0 });
  const isHudHoveredRef = reactExports.useRef(false);
  const isHudDraggingRef = reactExports.useRef(false);
  const isInputFocusedRef = reactExports.useRef(false);
  const setInteractivity = (interactive) => {
    if (!interactive && (isInputFocusedRef.current || isHudDraggingRef.current))
      return;
    const next = !interactive;
    setIsClickThrough(next);
    void api.setOverlayClickThrough(next);
  };
  const speakIfUltra = (text, moment) => {
    console.log("[MODE] current mode", { mode, moment });
    if (mode === "ultra") {
      console.log("[ULTRA] speaking...", { moment });
      void api.speak(text).catch((error) => {
        console.error("[TTS] error fallback", error);
      });
      return;
    }
    console.log("[ULTRA] skipped because silent mode", { moment });
    if (api.stopSpeaking) {
      void api.stopSpeaking().catch(() => void 0);
    }
  };
  const handleUltraSpokenInput = async (text) => {
    if (mode !== "ultra") return;
    setUltraState("thinking");
    console.log("[ULTRA] user said", { text });
    try {
      const result = await api.ultraConverse({
        message: text,
        mode,
        currentGoal: intent,
        currentStep,
        screenState,
        sessionHistory: ultraSessionHistory
      });
      console.log("[ULTRA] tutor reply", result);
      setUltraReply(result.reply);
      setUltraSessionHistory((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: result.reply }
      ]);
      if (result.shouldSpeak) {
        setUltraState("speaking");
        console.log("[TTS] speak called");
        speakIfUltra(result.reply, "tutor reply");
      }
      if (result.shouldStartWalkthrough && !currentStep && replayState === "idle" && lastNodeId) {
        void replaySavedWorkflow("walkthrough");
      }
      setUltraState("waitingForUser");
      console.log("[ULTRA] waiting for user");
    } catch (error) {
      console.error("[ULTRA] error", error);
      setUltraState("error");
    }
  };
  reactExports.useEffect(() => {
    isInputFocusedRef.current = isInputFocused;
  }, [isInputFocused]);
  reactExports.useEffect(() => {
    if (!isVisible) {
      setSummonSettled(false);
      return;
    }
    setSummonSettled(false);
    const timer = window.setTimeout(() => setSummonSettled(true), 1100);
    return () => window.clearTimeout(timer);
  }, [isVisible]);
  reactExports.useEffect(() => {
    const clampToViewport = () => {
      const hud = hudRef.current;
      if (!hud) return;
      const rect = hud.getBoundingClientRect();
      setHudPosition(
        (current) => current ? clampHudPosition(current, rect.width, rect.height) : current
      );
    };
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);
  reactExports.useEffect(() => {
    const shouldTrackCursor = isVisible || replayState !== "idle" || isLoading;
    if (!shouldTrackCursor) return;
    let isDisposed = false;
    let timer = null;
    let hasLoggedCursorError = false;
    const isWalkthroughActive = replayMode === "walkthrough" && replayState === "running";
    const revealTarget = isWalkthroughActive && currentStep ? currentStep : selectedRealAppTarget;
    const targetX = finitePercent(revealTarget?.x);
    const targetY = finitePercent(revealTarget?.y);
    const updateCursorReveal = async () => {
      try {
        const position = api.getCursorPercent ? await api.getCursorPercent() : null;
        const cursorX = finitePercent(position?.x);
        const cursorY = finitePercent(position?.y);
        const overlay = overlayRef.current;
        if (overlay && cursorX !== null && cursorY !== null) {
          const distancePx = targetX !== null && targetY !== null ? cursorTargetDistancePx(cursorX, cursorY, targetX, targetY) : null;
          const reveal = cursorRevealTuning(isWalkthroughActive, distancePx);
          const centerAlpha = Math.max(0.18, 1 - reveal.strength);
          const midAlpha = Math.min(1, centerAlpha + reveal.strength * 0.55);
          overlay.style.setProperty("--cursor-x", `${cursorX}vw`);
          overlay.style.setProperty("--cursor-y", `${cursorY}vh`);
          overlay.style.setProperty("--reveal-radius", `${reveal.radius}px`);
          overlay.style.setProperty(
            "--reveal-strength",
            reveal.strength.toFixed(3)
          );
          overlay.style.setProperty(
            "--reveal-center-alpha",
            centerAlpha.toFixed(3)
          );
          overlay.style.setProperty("--reveal-mid-alpha", midAlpha.toFixed(3));
          overlay.dataset.cursorReveal = reveal.nearTargetFactor > 0.35 ? "near-target" : isWalkthroughActive ? "walkthrough" : "idle";
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
            isWalkthroughActive ? 55 : CURSOR_REVEAL_POLL_MS
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
    selectedRealAppTarget?.y
  ]);
  reactExports.useEffect(() => {
    const offToggle = api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev);
    });
    const offComplete = api.onReplayComplete(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
      if (mode === "ultra") {
        setUltraState("idle");
      }
    });
    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
      if (mode === "ultra") {
        setUltraState("idle");
      }
    });
    const offConfirmNeeded = api.onReplayConfirmNeeded((data) => {
      setManualConfirmMessage(
        data?.message || "Click not detected. Press Space to confirm this step."
      );
      setIsLoading(false);
    });
    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage("");
    });
    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage(
        "Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry."
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
  reactExports.useEffect(() => {
    if (isVisible) {
      setScreenState((prev) => prev || { app: "current app" });
    } else {
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
      console.log(
        "[OVERLAY_INTERACTION] input blurred, restoring click-through"
      );
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
      if (mode === "ultra") {
        speakIfUltra("Follow the ghost cursor.", "step start");
        setUltraState("guiding");
      }
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
      if (mode === "ultra") {
        speakIfUltra("Nice, you're close. Click when ready.", "target reached");
      }
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
      const res = await api.analyzeScreen(void 0, {
        captureUnderlying: true
      });
      if (res?.error === "AI_BACKEND_UNAVAILABLE") {
        setErrorMessage(
          "AI vision unavailable. Use controlled demo, pick target manually, or check backend."
        );
        setIsLoading(false);
        return;
      }
      setScreenState(res);
      setLoadingMessage("Planning the walkthrough...");
      const plan = await api.planSteps(trimmed, res, [], mode);
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        throw new Error(
          "Specter could not create a usable plan for that intent."
        );
      }
      const nodeId = typeof plan.levelTitle === "string" && plan.levelTitle.trim() ? plan.levelTitle : trimmed;
      setLastNodeId(nodeId);
      setLoadingMessage("Saving the workflow...");
      await api.saveNode(nodeId, plan.steps);
      speakIfUltra(`Starting: ${nodeId}`, "starting walkthrough");
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
      speakIfUltra("Walkthrough complete.", "walkthrough complete");
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
    setLoadingMessage(
      kind === "walkthrough" ? "Starting walkthrough..." : "Starting auto-execute..."
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
      const result = await api.detectRealAppTargets(testIntent);
      if (result?.error === "AI_BACKEND_UNAVAILABLE") {
        const msg = "AI vision unavailable. Use controlled demo, pick target manually, or check backend.";
        setRealAppTargets({
          error: "AI_BACKEND_UNAVAILABLE",
          fallbackAvailable: true,
          targets: [],
          microTask: msg,
          app: "Unavailable",
          confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD
        });
        setSelectedRealAppTarget(null);
        setIsLoading(false);
        if (mode === "ultra") {
          setUltraReply("I can't inspect the screen right now, but I can still guide you through the controlled demo or let you pick a target manually.");
          setUltraState("waitingForUser");
          speakIfUltra("I can't inspect the screen right now, but I can still guide you through the controlled demo or let you pick a target manually.", "fallback");
        }
        return;
      }
      const normalizedTargets = Array.isArray(result?.targets) ? result.targets.map(
        (target) => normalizedRealAppTarget(target)
      ) : [];
      const nextTargets = {
        ...result,
        targets: normalizedTargets,
        confidenceThreshold: typeof result?.confidenceThreshold === "number" ? result.confidenceThreshold : DEFAULT_CONFIDENCE_THRESHOLD
      };
      const bestTarget = normalizedTargets[0] || null;
      const threshold = nextTargets.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
      setRealAppTargets(nextTargets);
      setSelectedRealAppTarget(bestTarget);
      if (!bestTarget) {
        setRealAppNotice("No clear target found. Pick a target manually.");
        setIsManualTargetPicking(true);
      } else if ((bestTarget.confidence ?? 0) < threshold) {
        speakIfUltra(`I found a possible target: ${bestTarget.label}. Confirm it before we start.`, "target found");
        setRealAppNotice(
          "Low confidence. Confirm one target or pick manually."
        );
      } else {
        speakIfUltra(`Target found: ${bestTarget.label}. Confirm it before we start.`, "target found");
        setRealAppNotice("Confirm the target before the ghost starts.");
      }
    } catch (error) {
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
    setRealAppNotice(
      "Click the real-app target location. Press Escape to cancel."
    );
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
      targets: [
        target,
        ...(current?.targets || []).filter((item) => item.source !== "manual")
      ]
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
      mode,
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
      console.log("[MODE] current mode", { mode, flow: "real-app" });
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
        mode
      });
      setLastNodeId(nodeId);
      setIntent(workflow?.intent || workflowInput.intent);
      speakIfUltra(`Starting walkthrough for ${target.label}.`, "starting walkthrough");
      setReplayMode("walkthrough");
      setReplayState("running");
      await api.walkthrough(nodeId);
      await api.markNodeComplete(nodeId);
      speakIfUltra("Walkthrough complete.", "walkthrough complete");
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
        `Mouse ${formatCoordinate(percent.x)}, ${formatCoordinate(percent.y)} percent. Center maps to ${center.x ?? "?"}, ${center.y ?? "?"}. Scale ${scale ?? "?"}. Mode ${diagnostics?.coordinateMode || "unknown"}.`
      );
    } catch (error) {
      console.error("[Overlay] Coordinate diagnostics failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };
  const checkAIBackend = async () => {
    setErrorMessage("");
    setAiHealthMessage("Checking AI backend...");
    try {
      const health = await api.checkAIBackend();
      console.log("[AI_BACKEND] health check", health);
      setAiHealthMessage(formatAIHealthStatus(health));
      if (!health?.anthropic?.testRequest?.pass) {
        setRealAppNotice(
          "AI vision unavailable. Use controlled demo, pick target manually, or check backend."
        );
      }
    } catch (error) {
      console.error("[AI_BACKEND] health check failed:", error);
      setAiHealthMessage(`AI backend check failed: ${messageFromError(error)}`);
    }
  };
  const moveCursorToScreenCenter = async () => {
    if (!window.confirm("Move your real mouse to the screen center?")) return;
    setErrorMessage("");
    try {
      await api.moveCursorToScreenCenter();
      setCalibrationMessage(
        "Center move requested. Verify the cursor landed at the visual center."
      );
    } catch (error) {
      console.error("[Overlay] Center move failed:", error);
      setErrorMessage(messageFromError(error));
    }
  };
  const startHudDrag = (event) => {
    if (event.button !== 0) return;
    const hud = hudRef.current;
    if (!hud) return;
    const rect = hud.getBoundingClientRect();
    hudDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    isHudDraggingRef.current = true;
    setIsHudDragging(true);
    setHudPosition({ left: rect.left, top: rect.top });
    setInteractivity(true);
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveHudDrag = (event) => {
    if (!isHudDraggingRef.current) return;
    const hud = hudRef.current;
    if (!hud) return;
    const rect = hud.getBoundingClientRect();
    const nextPosition = {
      left: event.clientX - hudDragOffsetRef.current.x,
      top: event.clientY - hudDragOffsetRef.current.y
    };
    setHudPosition(clampHudPosition(nextPosition, rect.width, rect.height));
  };
  const stopHudDrag = (event) => {
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
  const startNewChat = () => {
    setIntent("");
    setRealAppIntent("");
    setLastNodeId("");
    setCurrentStep(null);
    setReplayState("idle");
    setReplayMode(null);
    setErrorMessage("");
    setManualConfirmMessage("");
    setCalibrationMessage("");
    setRealAppTargets(null);
    setSelectedRealAppTarget(null);
    setIsManualTargetPicking(false);
    setRealAppNotice("");
    setLoadingMessage("Analyzing your screen...");
    if (api.stopSpeaking) {
      void api.stopSpeaking().catch(() => void 0);
    }
  };
  if (!isVisible && replayState === "idle" && !isLoading) return null;
  const isReplayRunning = replayState === "running";
  const showWalkthroughDebug = SHOW_WALKTHROUGH_DEBUG;
  const statusText = currentStep ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${currentStep.instruction || currentStep.targetLabel || (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")}` : replayMode === "auto" ? "Executing workflow..." : "Walkthrough running...";
  const realAppConfidenceThreshold = realAppTargets?.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
  const realAppMarkerTargets = realAppTargets?.targets || [];
  const showRealAppVerification = Boolean(
    realAppTargets || selectedRealAppTarget || isManualTargetPicking
  );
  const showFallbackWorkflow = Boolean(realAppTargets?.fallbackAvailable);
  const showWorkflowCard = showFallbackWorkflow || showRealAppVerification;
  const selectedTargetConfidence = selectedRealAppTarget?.confidence;
  const selectedTargetIsLowConfidence = typeof selectedTargetConfidence === "number" && selectedTargetConfidence < realAppConfidenceThreshold;
  const edgeLightState = !isVisible ? "hidden" : isReplayRunning ? "walkthrough" : summonSettled ? "idle" : "summon";
  const overlayClassName = [
    "overlay-container",
    `overlay-state-${edgeLightState}`,
    isInputFocused ? "overlay-state-focused" : "",
    isHudDragging ? "overlay-hud-dragging" : ""
  ].filter(Boolean).join(" ");
  const hudStyle = hudPosition ? {
    position: "absolute",
    left: `${hudPosition.left}px`,
    top: `${hudPosition.top}px`
  } : {
    position: "absolute",
    left: "50%",
    bottom: "10%",
    transform: "translateX(-50%)"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: overlayRef,
      className: overlayClassName,
      style: {
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
        transition: "background 0.5s ease"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-overlay-wash" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "siri-glow-fullscreen",
            style: { pointerEvents: "none" }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          GhostCursor,
          {
            step: currentStep || (isVisible ? { type: "idle" } : null)
          }
        ),
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
            ref: hudRef,
            className: `specter-hud-shell ${isHudDragging ? "is-dragging" : ""}`,
            onMouseEnter: () => {
              console.log("[OVERLAY_INTERACTION] mouse entered Specter UI");
              isHudHoveredRef.current = true;
              setInteractivity(true);
            },
            onMouseLeave: () => {
              console.log("[OVERLAY_INTERACTION] mouse left Specter UI");
              isHudHoveredRef.current = false;
              setInteractivity(false);
            },
            style: hudStyle,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: "specter-hud-drag-handle",
                  "aria-label": "Move Specter HUD",
                  title: "Move Specter HUD",
                  onPointerDown: startHudDrag,
                  onPointerMove: moveHudDrag,
                  onPointerUp: stopHudDrag,
                  onPointerCancel: stopHudDrag,
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
                }
              ),
              showWorkflowCard && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: "specter-workflow-card",
                  onClick: (event) => event.stopPropagation(),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "specter-workflow-header", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-kicker", children: showFallbackWorkflow ? "Fallback" : "Guided Workspace" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-title", children: showFallbackWorkflow ? "AI vision unavailable. Use controlled demo, pick target manually, or check backend." : realAppTargets?.microTask || "First, I will teach one visible action." })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-meta", children: showFallbackWorkflow ? "Local demo safe" : realAppTargets?.app || "Real app" })
                    ] }),
                    !showFallbackWorkflow && realAppNotice && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "div",
                      {
                        className: `specter-workflow-note ${selectedTargetIsLowConfidence ? "is-warning" : ""}`,
                        children: realAppNotice
                      }
                    ),
                    !showFallbackWorkflow && (selectedRealAppTarget ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "specter-target-summary", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { minWidth: 0 }, children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-target-title", children: selectedRealAppTarget.label }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "specter-target-detail", children: [
                          "X ",
                          formatCoordinate(selectedRealAppTarget.x),
                          " / Y",
                          " ",
                          formatCoordinate(selectedRealAppTarget.y),
                          " / Confidence",
                          " ",
                          confidencePercent(
                            selectedRealAppTarget.confidence
                          )
                        ] }),
                        selectedRealAppTarget.description && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-target-detail", children: selectedRealAppTarget.description })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "div",
                        {
                          className: `specter-target-dot ${selectedTargetIsLowConfidence ? "is-warning" : ""}`
                        }
                      )
                    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-note", children: "Pick a numbered marker, or set the target manually." })),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-action-row", children: showFallbackWorkflow ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button primary",
                          disabled: isLoading,
                          onClick: prepareControlledDemo,
                          children: "Controlled Demo"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button blue",
                          disabled: isLoading,
                          onClick: startManualTargetPicking,
                          children: "Pick manually"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button",
                          disabled: isLoading,
                          onClick: () => {
                            setRealAppTargets(null);
                            startRealAppTest(
                              realAppIntent || intent || DEFAULT_REAL_APP_PROMPT
                            );
                          },
                          children: "Retry AI"
                        }
                      )
                    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button primary",
                          disabled: isLoading || !selectedRealAppTarget,
                          onClick: startRealAppWalkthrough,
                          children: "Start ghost"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button blue",
                          disabled: isLoading,
                          onClick: startManualTargetPicking,
                          children: "Pick manually"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button",
                          disabled: isLoading,
                          onClick: prepareControlledDemo,
                          children: "Controlled Demo"
                        }
                      )
                    ] }) })
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    width: "100%",
                    justifyContent: "center"
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ModeToggle, { mode, onChange: setMode }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        className: "specter-debug-toggle",
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
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  onMouseEnter: () => setInteractivity(true),
                  onMouseLeave: () => setInteractivity(false),
                  style: { width: "100%", position: "relative" },
                  children: [
                    mode === "ultra" && /* @__PURE__ */ jsxRuntimeExports.jsx(UltraReplyBubble, { reply: ultraReply, state: ultraState }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      InputBar,
                      {
                        onSubmit: startRealAppTest,
                        onNewChat: startNewChat,
                        disabled: isLoading,
                        mode,
                        onUltraSpokenInput: handleUltraSpokenInput,
                        onFocus: () => {
                          console.log("[OVERLAY_INTERACTION] input focused");
                          setIsInputFocused(true);
                        },
                        onBlur: () => {
                          console.log("[OVERLAY_INTERACTION] input blurred");
                          setIsInputFocused(false);
                        },
                        onRecordingOverlayMouseEnter: () => setInteractivity(true),
                        onRecordingOverlayMouseLeave: () => setInteractivity(false)
                      }
                    ),
                    !intent && screenState?.app && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        style: {
                          position: "absolute",
                          top: "-24px",
                          left: "20px",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.42)",
                          letterSpacing: "0.2px"
                        },
                        children: [
                          "Looking at ",
                          screenState.app
                        ]
                      }
                    )
                  ]
                }
              ),
              showDebugTools && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: "specter-debug-tools",
                  style: {
                    width: "100%",
                    background: "rgba(12, 14, 18, 0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "14px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "div",
                      {
                        style: {
                          fontSize: "10px",
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.3)",
                          textTransform: "uppercase"
                        },
                        children: "Debug / Demo Tools"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        style: { display: "flex", gap: "8px", flexWrap: "wrap" },
                        children: [
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
                              disabled: isLoading,
                              onClick: checkAIBackend,
                              style: {
                                flex: 1,
                                minWidth: "130px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "10px",
                                padding: "8px",
                                color: "white",
                                background: "rgba(255,204,0,0.14)",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer"
                              },
                              children: "Check AI Backend"
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
                          ),
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "button",
                            {
                              onClick: resetHudPosition,
                              style: {
                                flex: 1,
                                minWidth: "110px",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "10px",
                                padding: "8px",
                                color: "white",
                                background: "rgba(255,255,255,0.08)",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer"
                              },
                              children: "Reset HUD"
                            }
                          )
                        ]
                      }
                    ),
                    calibrationMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "div",
                      {
                        style: {
                          color: "rgba(255,255,255,0.5)",
                          fontSize: "10px"
                        },
                        children: calibrationMessage
                      }
                    ),
                    aiHealthMessage && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "div",
                      {
                        style: {
                          color: "rgba(255,255,255,0.58)",
                          fontSize: "10px",
                          lineHeight: 1.45,
                          whiteSpace: "pre-line"
                        },
                        children: aiHealthMessage
                      }
                    )
                  ]
                }
              ),
              lastNodeId && !showWorkflowCard && /* @__PURE__ */ jsxRuntimeExports.jsx(
                SessionPanel,
                {
                  intent,
                  nodeId: lastNodeId,
                  appName: screenState?.app,
                  isBusy: isLoading,
                  isWalkthroughActive: false,
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
