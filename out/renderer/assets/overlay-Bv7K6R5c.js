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
    if (isTranscribing) return;
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
  }, [isTranscribing]);
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
  onUltraSpokenInput,
  onTranscriptionStart,
  onTranscriptionEnd
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
      onTranscriptionStart?.();
      const result = await Promise.race([
        window.api.transcribe(buffer),
        new Promise(
          (_, reject) => setTimeout(() => reject(Object.assign(new Error("Transcription timed out"), { code: "WHISPER_TIMEOUT" })), 25e3)
        )
      ]);
      if (result.ok && typeof result.text === "string" && result.text.trim()) {
        const text = result.text.trim();
        console.log("[MIC] transcription success", { length: text.length });
        if (mode === "ultra" && onUltraSpokenInput) {
          console.log("[MIC] ultra mode auto-sending transcription");
          onUltraSpokenInput(text);
          setMicState("idle");
        } else {
          setValue(text);
          setMicMessage("");
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }
      } else {
        const msg = result.message || "No transcription returned. Try speaking again.";
        setMicMessage(msg);
        console.warn("[MIC] transcription failed/empty", { error: result.error, message: msg });
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
      onTranscriptionEnd?.();
      recordingStartRef.current = null;
      setMicState("idle");
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
          placeholder: "Ask Specter about the app in front of you",
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
const GhostCursor = () => {
  return null;
};
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}
const WalkthroughGuide = ({ step }) => {
  if (!step || step.type === "idle" || step.action === "wait") return null;
  const x = clampPercent(step.x ?? 50);
  const y = clampPercent(step.y ?? 50);
  const bubbleOnLeft = x > 70;
  const hasHint = Boolean(step.instruction || step.targetLabel);
  const isLocked = step.ghostLocked === true;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "walkthrough-guide-container",
      style: {
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-2px, -2px)",
        pointerEvents: "none",
        zIndex: 9998,
        transition: "left 0.24s ease, top 0.24s ease"
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "walkthrough-guide-ring",
            style: {
              position: "absolute",
              width: isLocked ? "48px" : "42px",
              height: isLocked ? "48px" : "42px",
              borderRadius: "50%",
              border: isLocked ? "2px solid rgba(48, 209, 88, 0.72)" : "2px solid rgba(10, 132, 255, 0.45)",
              background: isLocked ? "rgba(48, 209, 88, 0.14)" : "rgba(10, 132, 255, 0.10)",
              animation: isLocked ? void 0 : "wt-ring-pulse 1.8s infinite",
              left: isLocked ? "-23px" : "-20px",
              top: isLocked ? "-23px" : "-20px",
              transition: "all 0.18s ease"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "svg",
          {
            className: "walkthrough-guide-pointer",
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
        hasHint && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "walkthrough-guide-bubble",
            style: {
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
            },
            children: step.instruction || step.targetLabel
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        @keyframes wt-ring-pulse {
          0% { transform: scale(0.55); opacity: 0.72; }
          100% { transform: scale(1.35); opacity: 0; }
        }
      ` })
      ]
    }
  );
};
const DEFAULTS = {
  ghostSize: 48,
  minMargin: 18,
  maxMargin: 32,
  minTravelMs: 4e3,
  maxTravelMs: 9e3,
  minPauseMs: 1e3,
  maxPauseMs: 3e3
};
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
function randomEdge(exclude) {
  const edges = ["top", "right", "bottom", "left"];
  const pool = exclude ? edges.filter((e) => e !== exclude) : edges;
  return pool[Math.floor(Math.random() * pool.length)];
}
function getBounds(boundaryRefOrSelector) {
  {
    const el = document.querySelector(boundaryRefOrSelector);
    if (el) return el.getBoundingClientRect();
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    }
  };
}
function pickTargetOnEdge(edge, rect, margin, ghostSize, avoidBottomCenter) {
  const minX = rect.left + margin;
  const minY = rect.top + margin;
  const maxX = Math.max(minX, rect.right - margin - ghostSize);
  const maxY = Math.max(minY, rect.bottom - margin - ghostSize);
  switch (edge) {
    case "top":
      return { x: randomRange(minX, maxX), y: minY };
    case "right":
      return { x: maxX, y: randomRange(minY, maxY) };
    case "bottom": {
      if (avoidBottomCenter && rect.width > 0) {
        const centerX = (rect.left + rect.right) / 2;
        const safeW = rect.width * 0.35;
        const leftMin = minX;
        const leftMax = Math.max(leftMin, centerX - safeW);
        const rightMin = Math.min(maxX, centerX + safeW);
        const rightMax = maxX;
        const side = Math.random() > 0.5 ? "left" : "right";
        const x = side === "left" ? randomRange(leftMin, leftMax) : randomRange(rightMin, rightMax);
        return { x, y: maxY };
      }
      return { x: randomRange(minX, maxX), y: maxY };
    }
    case "left":
      return { x: minX, y: randomRange(minY, maxY) };
  }
}
function clampPoint(point, rect, ghostSize, margin) {
  const minX = rect.left + margin;
  const minY = rect.top + margin;
  const maxX = Math.max(minX, rect.right - margin - ghostSize);
  const maxY = Math.max(minY, rect.bottom - margin - ghostSize);
  return {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y))
  };
}
function usePerimeterRoam(enabled, boundaryRefOrSelector, options) {
  const {
    ghostSize = DEFAULTS.ghostSize,
    minMargin = DEFAULTS.minMargin,
    maxMargin = DEFAULTS.maxMargin,
    minTravelMs = DEFAULTS.minTravelMs,
    maxTravelMs = DEFAULTS.maxTravelMs,
    minPauseMs = DEFAULTS.minPauseMs,
    maxPauseMs = DEFAULTS.maxPauseMs,
    avoidBottomCenter = true
  } = options || {};
  const [position, setPosition] = reactExports.useState({ x: minMargin, y: minMargin });
  const [edge, setEdge] = reactExports.useState("top");
  const [transitionDuration, setTransitionDuration] = reactExports.useState(0);
  const [isPaused, setIsPaused] = reactExports.useState(false);
  const reducedMotionRef = reactExports.useRef(false);
  const timerRef = reactExports.useRef(null);
  const isMountedRef = reactExports.useRef(true);
  const currentEdgeRef = reactExports.useRef("top");
  const getBoundsCallback = reactExports.useCallback(
    () => getBounds(boundaryRefOrSelector),
    [boundaryRefOrSelector]
  );
  const moveToNextTarget = reactExports.useCallback(() => {
    if (!isMountedRef.current) return;
    const rect = getBoundsCallback();
    const margin = Math.round(randomRange(minMargin, maxMargin));
    const newEdge = randomEdge(currentEdgeRef.current);
    currentEdgeRef.current = newEdge;
    const target = pickTargetOnEdge(newEdge, rect, margin, ghostSize, avoidBottomCenter);
    const clamped = clampPoint(target, rect, ghostSize, margin);
    const travelMs = Math.round(randomRange(minTravelMs, maxTravelMs));
    const pauseMs = Math.round(randomRange(minPauseMs, maxPauseMs));
    setEdge(newEdge);
    setTransitionDuration(travelMs);
    setPosition(clamped);
    setIsPaused(false);
    if (reducedMotionRef.current) {
      setTransitionDuration(0);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsPaused(true);
      timerRef.current = window.setTimeout(() => {
        moveToNextTarget();
      }, pauseMs);
    }, travelMs);
  }, [
    getBoundsCallback,
    ghostSize,
    minMargin,
    maxMargin,
    minTravelMs,
    maxTravelMs,
    minPauseMs,
    maxPauseMs,
    avoidBottomCenter
  ]);
  reactExports.useEffect(() => {
    isMountedRef.current = true;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mql.matches;
    const onChange = (e) => {
      reducedMotionRef.current = e.matches;
      if (e.matches) {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setTransitionDuration(0);
        setIsPaused(true);
      } else if (enabled) {
        moveToNextTarget();
      }
    };
    mql.addEventListener("change", onChange);
    if (enabled && !reducedMotionRef.current) {
      moveToNextTarget();
    } else if (enabled && reducedMotionRef.current) {
      const rect = getBoundsCallback();
      const target = pickTargetOnEdge(randomEdge(), rect, minMargin, ghostSize, avoidBottomCenter);
      setTransitionDuration(0);
      setPosition(clampPoint(target, rect, ghostSize, minMargin));
      setEdge(currentEdgeRef.current);
      setIsPaused(true);
    }
    return () => {
      isMountedRef.current = false;
      mql.removeEventListener("change", onChange);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    enabled,
    moveToNextTarget,
    getBoundsCallback,
    ghostSize,
    minMargin,
    avoidBottomCenter
  ]);
  reactExports.useEffect(() => {
    if (!enabled) return;
    const onResize = () => {
      const rect = getBoundsCallback();
      setPosition((prev) => clampPoint(prev, rect, ghostSize, minMargin));
    };
    window.addEventListener("resize", onResize);
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      const el = document.querySelector(boundaryRefOrSelector);
      if (el) {
        ro = new ResizeObserver(() => {
          const rect = getBoundsCallback();
          setPosition((prev) => clampPoint(prev, rect, ghostSize, minMargin));
        });
        ro.observe(el);
      }
    }
    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [enabled, getBoundsCallback, ghostSize, minMargin, boundaryRefOrSelector]);
  return {
    x: position.x,
    y: position.y,
    edge,
    isMoving: !isPaused,
    isPaused,
    transitionDuration
  };
}
function labelForMood(mood, state) {
  if (mood === "flow") return `flow ${Math.round((state?.flowScore ?? 0.82) * 100)}%`;
  if (mood === "thinking") return "thinking...";
  if (mood === "stuck") return "stuck on this";
  if (mood === "celebrating") return "checkpoint glow";
  if (mood === "mirroring") return "mirror mode";
  if (mood === "judging") return "judging your click";
  return state ? `confidence ${Math.round(state.decisionConfidence * 100)}%` : "measuring";
}
function resolveAnimationClass(mood, isMoving) {
  if (isMoving) return "spec-buddy--moving";
  if (mood === "thinking") return "spec-buddy--thinking";
  if (mood === "stuck") return "spec-buddy--stuck";
  if (mood === "celebrating") return "spec-buddy--celebrating";
  if (mood === "flow") return "spec-buddy--flow";
  if (mood === "mirroring") return "spec-buddy--mirroring";
  if (mood === "judging") return "spec-buddy--judging";
  return "spec-buddy--idle";
}
function renderEyes(mood) {
  if (mood === "thinking") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__brow", d: "M22 26c4-3 8-3 12-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye", cx: "27", cy: "33", r: "3.2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye", cx: "45", cy: "31", r: "3.2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__pupil", cx: "26", cy: "33.5", r: "1.2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__pupil", cx: "44", cy: "31.5", r: "1.2" })
    ] });
  }
  if (mood === "stuck") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__eye-line", d: "M23 32c3-2 7-2 10 0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__eye-line", d: "M40 32c3-2 7-2 10 0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth worried", d: "M33 42c3-3 7-3 10 0" })
    ] });
  }
  if (mood === "flow") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye wide", cx: "27", cy: "33", r: "4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye wide", cx: "45", cy: "33", r: "4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth happy", d: "M31 43c3 4 10 4 13 0" })
    ] });
  }
  if (mood === "celebrating") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__star-eye", d: "M27 27l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__star-eye", d: "M46 27l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth happy", d: "M31 44c3 4 10 4 13 0" })
    ] });
  }
  if (mood === "mirroring") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { className: "spec-buddy__eye glow", cx: "27", cy: "33", rx: "4.5", ry: "3.6" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { className: "spec-buddy__eye glow", cx: "45", cy: "33", rx: "4.5", ry: "3.6" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth calm", d: "M33 44c3 2 7 2 10 0" })
    ] });
  }
  if (mood === "judging") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__eye-line judging", d: "M21 31c5-2 10-1 14 2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__eye-line judging", d: "M40 32c5-2 10-2 14-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__pupil judging", cx: "29", cy: "33", r: "1.4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__pupil judging", cx: "47", cy: "32", r: "1.4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth flat", d: "M33 44h11" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye", cx: "27", cy: "33", r: "3.6" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { className: "spec-buddy__eye", cx: "45", cy: "33", r: "3.6" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__mouth calm", d: "M33 43c3 2 8 2 11 0" })
  ] });
}
const SpecBuddy = ({
  mood,
  state,
  enabled = true,
  checkpointLabel,
  compact = false,
  pitchMode = false
}) => {
  const { x, y, edge, isMoving, transitionDuration } = usePerimeterRoam(
    enabled,
    '[data-specter-boundary="true"]',
    { ghostSize: 56, avoidBottomCenter: true }
  );
  const animClass = resolveAnimationClass(mood, isMoving);
  const tiltClass = isMoving ? edge === "left" ? "spec-buddy--tilt-left" : edge === "right" ? "spec-buddy--tilt-right" : "" : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `spec-buddy spec-buddy--${mood} ${animClass} ${tiltClass} ${compact ? "spec-buddy--compact" : ""} ${pitchMode ? "spec-buddy--pitch" : ""}`,
      style: {
        left: `${x}px`,
        top: `${y}px`,
        transitionDuration: `${transitionDuration}ms`
      },
      children: [
        pitchMode && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "spec-buddy__pitch-tags", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "measured behavior" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "real-time mood signal" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "versioned checkpoint" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "feedback reward" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "spec-buddy__trail" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "spec-buddy__stars", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", {})
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: "spec-buddy__svg", width: "72", height: "78", viewBox: "0 0 72 78", "aria-hidden": "true", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("filter", { id: "spec-soft-glow", x: "-40%", y: "-40%", width: "180%", height: "180%", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("feGaussianBlur", { stdDeviation: "3", result: "blur" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("feMerge", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("feMergeNode", { in: "blur" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("feMergeNode", { in: "SourceGraphic" })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "path",
            {
              className: "spec-buddy__body",
              d: "M36 4c18 0 32 14 32 32v24c0 3-2 5-4 3l-5-4-5 6c-2 2-4 2-6 0l-4-5-4 5c-2 2-4 2-6 0l-4-5-5 4c-2 2-4 0-4-3V36C16 18 18 4 36 4Z"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__shine", d: "M22 16c3-5 8-8 14-9" }),
          mood === "judging" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__arm-cross", d: "M21 40c8 5 20 6 31 1" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("path", { className: "spec-buddy__arm-cross", d: "M51 38c-9 7-20 9-31 5" })
          ] }),
          renderEyes(mood)
        ] }),
        !compact && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "spec-buddy__checkpoint", children: checkpointLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "spec-buddy__label", children: labelForMood(mood, state) })
      ]
    }
  );
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
  stepProgress = 0,
  onWalkthrough,
  onAutoExecute
}) => {
  if (!intent) return null;
  const normalizedStepProgress = Math.min(1, Math.max(0, stepProgress));
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
        width: `${Math.round(normalizedStepProgress * 100)}%`,
        height: "100%",
        background: "#fff",
        borderRadius: "2px",
        opacity: 0.8
      } }) })
    ] })
  ] });
};
const UltraReplyBubble = ({ reply, state, voiceFallback }) => {
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
        return voiceFallback ? "Speaking (fallback)..." : "Speaking...";
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
        }, children: reply }),
        voiceFallback && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: {
          marginTop: "6px",
          padding: "4px 8px",
          background: "rgba(255, 159, 10, 0.12)",
          border: "1px solid rgba(255, 159, 10, 0.25)",
          borderRadius: "8px",
          fontSize: "10px",
          fontWeight: 600,
          color: "rgba(255, 159, 10, 0.85)",
          letterSpacing: "0.2px",
          display: "flex",
          alignItems: "center",
          gap: "5px"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "🔇" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Voice fallback active · Text tutoring still works" })
        ] })
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
function behaviorPercent(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` : "n/a";
}
function signedBehaviorPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}
function latestCheckpoint(checkpoints) {
  return checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;
}
function firstCheckpoint(checkpoints) {
  return checkpoints.length > 0 ? checkpoints[0] : null;
}
function formatAIHealthStatus(health) {
  const anthropic = health?.anthropic || {};
  const anthropicKey = anthropic.key || {};
  const testRequest = anthropic.testRequest || {};
  const openai = health?.openai || {};
  const openaiKey = openai.key || {};
  const elevenlabs = health?.elevenlabs || {};
  const elevenlabsKey = elevenlabs.key || {};
  const openaiTTS = health?.openaiTTS || {};
  const overall = health?.overall || {};
  const claudeTextStatus = testRequest.pass ? "Claude text test: pass" : `Claude text test: failed (${testRequest.category || "unknown"})`;
  const claudeVisionStatus = `Claude vision/config: ${anthropic.configured ? "ready" : "not configured"}`;
  const whisperStatus = `Whisper voice: ${openai.whisperConfigured ? "ready" : "missing key"}`;
  const elevenlabsStatus = `ElevenLabs TTS: ${elevenlabs.configured ? "ready" : "fallback mode"}`;
  const openaiTTSStatus = `OpenAI TTS: ${openaiTTS.configured ? "ready" : "not configured"}`;
  const overallAppAI = overall.readyForRealAppAI ? "ready" : "not ready";
  const overallVoiceInput = overall.readyForVoiceInput ? "ready" : "not ready";
  const overallVoiceOutput = overall.readyForNaturalVoiceOutput ? "Natural" : "macOS say";
  const reason = testRequest.reason ? `
Reason: ${testRequest.reason}` : "";
  return [
    `Real-app AI: ${overallAppAI}`,
    `Voice Input: ${overallVoiceInput} | Voice Output: ${overallVoiceOutput}`,
    claudeTextStatus,
    claudeVisionStatus,
    `Planner: ${anthropic.plannerModel || "unknown"}, Vision: ${anthropic.visionModel || "unknown"}`,
    whisperStatus,
    elevenlabsStatus,
    openaiTTSStatus,
    `Voice: ${elevenlabs.voiceId || "default"}, Model: ${elevenlabs.modelId || "default"}`,
    `ANTHROPIC_API_KEY: ${anthropicKey.present ? "present" : "missing"}, len: ${anthropicKey.keyLength || 0}, placeholder: ${anthropicKey.placeholderDetected ? "true" : "false"}`,
    `OPENAI_API_KEY: ${openaiKey.present ? "present" : "missing"}, len: ${openaiKey.keyLength || 0}, placeholder: ${openaiKey.placeholderDetected ? "true" : "false"}`,
    `ELEVENLABS_API_KEY: ${elevenlabsKey.present ? "present" : "missing"}, len: ${elevenlabsKey.keyLength || 0}, placeholder: ${elevenlabsKey.placeholderDetected ? "true" : "false"}`,
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
  return {
    ...data.step,
    index: data.index,
    total: data.total,
    retryReason: data.reason,
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
  const [aiHealthPills, setAiHealthPills] = reactExports.useState(null);
  const [specMood, setSpecMood] = reactExports.useState("idle");
  const [behavioralState, setBehavioralState] = reactExports.useState(null);
  const [behaviorCheckpoints, setBehaviorCheckpoints] = reactExports.useState([]);
  const [hasCompletedWalkthrough, setHasCompletedWalkthrough] = reactExports.useState(false);
  const [activeCheckpoint, setActiveCheckpoint] = reactExports.useState(null);
  const [blendedPreview, setBlendedPreview] = reactExports.useState(null);
  const [behaviorDiff, setBehaviorDiff] = reactExports.useState(null);
  const [blendT, setBlendT] = reactExports.useState(1);
  const [mirrorStatus, setMirrorStatus] = reactExports.useState("idle");
  const [mirrorFeedbackStatus, setMirrorFeedbackStatus] = reactExports.useState("");
  const [mirrorFeedbackArm, setMirrorFeedbackArm] = reactExports.useState(null);
  const [mirrorCorrectionCount, setMirrorCorrectionCount] = reactExports.useState(0);
  const [pitchMode, setPitchMode] = reactExports.useState(false);
  const [lastTTSProvider, setLastTTSProvider] = reactExports.useState(null);
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
  const modeRef = reactExports.useRef(mode);
  reactExports.useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const setInteractivity = (interactive) => {
    if (!interactive && (isInputFocusedRef.current || isHudDraggingRef.current))
      return;
    const next = !interactive;
    setIsClickThrough(next);
    void api.setOverlayClickThrough(next);
  };
  const speakIfUltra = (text, moment) => {
    const currentMode = modeRef.current;
    console.log("[MODE] current mode", { mode: currentMode, moment });
    if (currentMode === "ultra") {
      setUltraState("speaking");
      const timeout = setTimeout(() => {
        console.warn("[TTS] speak timeout");
        setUltraState("waitingForUser");
      }, 2e4);
      void api.speak(text).then((result) => {
        clearTimeout(timeout);
        if (result?.providerUsed) {
          setLastTTSProvider(result.providerUsed);
        }
        if (result?.providerUsed === "macos" && result?.fallbackReason) {
          console.warn("[TTS] used macOS fallback", result.fallbackReason);
        } else if (result?.providerUsed === "openai") {
          console.log("[TTS] used OpenAI fallback");
        }
        setUltraState("waitingForUser");
      }).catch((error) => {
        clearTimeout(timeout);
        console.error("[TTS] error fallback", error);
        setLastTTSProvider("macos");
        setUltraState("waitingForUser");
      });
      return;
    }
    console.log("[ULTRA] skipped because silent mode");
    api.stopSpeaking().catch(() => void 0);
  };
  const handleUltraSpokenInput = async (text) => {
    if (mode !== "ultra") return;
    setUltraState("thinking");
    console.log("[ULTRA] user said", { text });
    const timeout = setTimeout(() => {
      console.warn("[ULTRA] converse timeout");
      setUltraState("waitingForUser");
      setErrorMessage("Tutor is taking too long to respond. Try again.");
    }, 2e4);
    try {
      const result = await api.ultraConverse({
        message: text,
        mode,
        currentGoal: intent,
        currentStep,
        screenState,
        sessionHistory: ultraSessionHistory
      });
      clearTimeout(timeout);
      console.log("[ULTRA] tutor reply", result);
      setUltraReply(result.reply);
      setUltraSessionHistory((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: result.reply }
      ]);
      if (result.shouldSpeak) {
        console.log("[TTS] speak called");
        speakIfUltra(result.reply, "tutor reply");
      } else {
        setUltraState("waitingForUser");
      }
      if (result.shouldStartWalkthrough && !currentStep && replayState === "idle" && lastNodeId) {
        void replaySavedWorkflow("walkthrough");
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error("[ULTRA] error", error);
      setUltraState("error");
      setTimeout(() => setUltraState("waitingForUser"), 3e3);
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
    const shouldTrackCursor = isVisible || replayState !== "idle" || isLoading || mirrorStatus === "running";
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
    selectedRealAppTarget?.y,
    mirrorStatus
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
      setHasCompletedWalkthrough(true);
      setSpecMood("celebrating");
      if (modeRef.current === "ultra") {
        setUltraState("idle");
      }
    });
    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null);
      setReplayState("idle");
      setReplayMode(null);
      setManualConfirmMessage("");
      setSpecMood("idle");
      if (modeRef.current === "ultra") {
        setUltraState("idle");
      }
    });
    const offConfirmNeeded = api.onReplayConfirmNeeded((data) => {
      setManualConfirmMessage(
        data?.message || "Click not detected. Press Space to confirm this step."
      );
      setSpecMood("judging");
      setIsLoading(false);
    });
    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage("");
    });
    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage(
        "Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry."
      );
      setSpecMood("stuck");
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
    void api.behaviorGetState?.().then((state) => {
      if (!state) return;
      setBehavioralState(state);
      setSpecMood(state.moodLabel || "idle");
    }).catch((error) => {
      console.warn("[BEHAVIOR] state unavailable:", error);
    });
    void api.behaviorListCheckpoints?.().then((checkpoints) => {
      const list = Array.isArray(checkpoints) ? checkpoints : [];
      setBehaviorCheckpoints(list);
      const current = latestCheckpoint(list);
      setActiveCheckpoint(current);
      if (current) {
        setBehavioralState(current.signature);
        setSpecMood(current.signature.moodLabel);
      }
    }).catch((error) => {
      console.warn("[BEHAVIOR] checkpoints unavailable:", error);
    });
    const offSpecState = api.onSpecState((state) => {
      setBehavioralState(state);
      if (state?.moodLabel) setSpecMood(state.moodLabel);
    });
    const offSpecMood = api.onSpecMood((mood) => {
      setSpecMood(mood || "idle");
    });
    const offCheckpoint = api.onBehaviorCheckpointCreated(
      (checkpoint) => {
        if (!checkpoint) return;
        setActiveCheckpoint(checkpoint);
        setBehavioralState(checkpoint.signature);
        setSpecMood(checkpoint.signature.moodLabel || "celebrating");
        setBehaviorCheckpoints((current) => {
          const withoutDuplicate = current.filter(
            (item) => item.id !== checkpoint.id
          );
          return [...withoutDuplicate, checkpoint].sort(
            (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
          );
        });
      }
    );
    const offMirrorStarted = api.onMirrorStarted((data) => {
      setMirrorStatus("running");
      setSpecMood("mirroring");
      if (data?.signature) setBehavioralState(data.signature);
    });
    const offMirrorComplete = api.onMirrorComplete(() => {
      setMirrorStatus("complete");
      setSpecMood("celebrating");
      setReplayState("idle");
      setReplayMode(null);
      setMirrorFeedbackStatus("Compare the replay with what you would have done.");
    });
    const offMirrorError = api.onMirrorError((data) => {
      setMirrorStatus("error");
      setSpecMood("stuck");
      setErrorMessage(data?.message || "Mirror Mode hit a snag.");
      setReplayState("idle");
      setReplayMode(null);
      setMirrorFeedbackStatus("");
    });
    const offPermWarn = api.onBehaviorPermissionsWarning?.((data) => {
      setErrorMessage(
        data?.message || "Missing macOS permissions - grant Accessibility + Input Monitoring and restart."
      );
      setSpecMood("stuck");
    });
    return () => {
      offSpecState();
      offSpecMood();
      offCheckpoint();
      offMirrorStarted();
      offMirrorComplete();
      offMirrorError();
      offPermWarn?.();
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
    if (isLoading) {
      setSpecMood("thinking");
    }
  }, [isLoading]);
  reactExports.useEffect(() => {
    if (behaviorCheckpoints.length >= 2) {
      void refreshBehaviorDiff(
        firstCheckpoint(behaviorCheckpoints),
        latestCheckpoint(behaviorCheckpoints)
      );
    }
  }, [behaviorCheckpoints.length]);
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
    return;
  }, [showDebugTools, pitchMode]);
  reactExports.useEffect(() => {
    if (!isInputFocused) {
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
      setSpecMood("thinking");
      if (modeRef.current === "ultra") {
        speakIfUltra("Follow the ghost cursor.", "step start");
        setUltraState("guiding");
      }
    });
    const offRetry = api.onReplayRetry((data) => {
      setCurrentStep(walkthroughStepFromReplay(data));
      setReplayMode("walkthrough");
      setReplayState("running");
      setIsLoading(false);
      setSpecMood("judging");
    });
    const offTargetReached = api.onReplayTargetReached((data) => {
      setCurrentStep((current) => {
        if (!current || current.index !== data.index) return current;
        return {
          ...current,
          ghostLocked: true
        };
      });
      setSpecMood("flow");
      if (modeRef.current === "ultra") {
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
      setSpecMood(mirrorStatus === "running" ? "mirroring" : "thinking");
    });
    return () => {
      offProgress();
    };
  }, [mirrorStatus]);
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
          "AI vision unavailable. Use Fallback Practice, pick target manually, or check backend."
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
    setLoadingMessage("Preparing fallback practice...");
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
  const handleInputSubmit = async (text) => {
    const isTutorActive = currentStep || replayState === "running" || ultraReply || lastNodeId;
    if (modeRef.current === "ultra" && isTutorActive) {
      await handleUltraSpokenInput(text);
      return;
    }
    await startRealAppTest(text);
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
        const msg = "I couldn't confidently detect the target. Pick it manually or use Fallback Practice.";
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
          setUltraReply("I couldn't inspect the screen right now. Click something you want to learn, and the ghost cursor will guide you to it.");
          setUltraState("waitingForUser");
          speakIfUltra("I couldn't inspect the screen right now. Click something you want to learn, and the ghost cursor will guide you to it.", "fallback");
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
        setRealAppNotice("I couldn't confidently see the target. Click the thing you want Specter to teach.");
        setIsManualTargetPicking(true);
      } else if ((bestTarget.confidence ?? 0) < threshold) {
        speakIfUltra(`I found a possible target: ${bestTarget.label}. Confirm it before we start.`, "target found");
        setRealAppNotice(
          "Low confidence — confirm or pick a different target manually."
        );
      } else {
        speakIfUltra(`Target found: ${bestTarget.label}. Confirm it before we start.`, "target found");
        setRealAppNotice("Target found — confirm it and the ghost will start.");
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
      "Click the thing you want Specter to teach. Press Escape to cancel."
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
      setHasCompletedWalkthrough(true);
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
    setAiHealthPills(null);
    try {
      const health = await api.healthCheck();
      console.log("[AI_BACKEND] health check", health);
      setAiHealthMessage(formatAIHealthStatus(health));
      setAiHealthPills(health);
    } catch (error) {
      console.error("[AI_BACKEND] health check failed:", error);
      setAiHealthMessage(`AI backend check failed: ${messageFromError(error)}`);
      setAiHealthPills(null);
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
  const refreshBehaviorDiff = async (from, to) => {
    if (!from || !to || from.id === to.id) {
      setBehaviorDiff(null);
      return;
    }
    try {
      const diff = await api.behaviorDiffCheckpoints(from.id, to.id);
      setBehaviorDiff(diff || null);
    } catch (error) {
      console.warn("[BEHAVIOR] diff failed:", error);
      setBehaviorDiff(null);
    }
  };
  const seedSpecDemo = async () => {
    setErrorMessage("");
    try {
      const checkpoints = await api.behaviorSeedDemo();
      const list = Array.isArray(checkpoints) ? checkpoints : [];
      setBehaviorCheckpoints(list);
      const current = latestCheckpoint(list);
      setActiveCheckpoint(current);
      setBehavioralState(current?.signature || null);
      setSpecMood(current?.signature?.moodLabel || "celebrating");
      setBlendT(1);
      setBlendedPreview(null);
      setMirrorFeedbackStatus("DEV FALLBACK: synthetic demo data loaded. Not learned behavior.");
      await refreshBehaviorDiff(firstCheckpoint(list), latestCheckpoint(list));
    } catch (error) {
      console.error("[BEHAVIOR] seed demo failed:", error);
      setErrorMessage(messageFromError(error));
      setSpecMood("stuck");
    }
  };
  const createBehaviorCheckpoint = async () => {
    setErrorMessage("");
    try {
      const checkpoint = await api.behaviorCreateCheckpoint();
      if (!checkpoint) return;
      setActiveCheckpoint(checkpoint);
      setBehavioralState(checkpoint.signature);
      setSpecMood(checkpoint.signature?.moodLabel || "idle");
      setBehaviorCheckpoints((current) => {
        const list = [
          ...current.filter((item) => item.id !== checkpoint.id),
          checkpoint
        ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        void refreshBehaviorDiff(firstCheckpoint(list), latestCheckpoint(list));
        return list;
      });
    } catch (error) {
      console.error("[BEHAVIOR] checkpoint failed:", error);
      setErrorMessage(messageFromError(error));
      setSpecMood("stuck");
    }
  };
  const updateBlendPreview = async (value) => {
    setBlendT(value);
    const from = firstCheckpoint(behaviorCheckpoints);
    const to = latestCheckpoint(behaviorCheckpoints);
    if (!from || !to || from.id === to.id) return;
    try {
      const blended = await api.behaviorBlendCheckpoints(from.id, to.id, value);
      if (blended) {
        setBlendedPreview(blended);
        setBehavioralState(blended);
        setSpecMood(blended.moodLabel);
      }
      await refreshBehaviorDiff(from, to);
    } catch (error) {
      console.warn("[BEHAVIOR] blend failed:", error);
    }
  };
  const runMirrorMode = async () => {
    if (mirrorStatus === "running") return;
    if (!window.confirm("Spec will control your real mouse in Mirror Mode. Continue?")) {
      return;
    }
    setErrorMessage("");
    setMirrorStatus("running");
    setReplayMode("auto");
    setReplayState("running");
    setSpecMood("mirroring");
    setMirrorFeedbackStatus("");
    setMirrorCorrectionCount(0);
    try {
      const arm = api.selectStyle ? await api.selectStyle().catch(() => null) : null;
      setMirrorFeedbackArm(typeof arm === "string" ? arm : "C");
      await api.runMirrorMode({
        nodeId: lastNodeId || void 0,
        task: intent || void 0,
        blendedSignature: blendedPreview || behavioralState || void 0,
        confirmed: true
      });
    } catch (error) {
      console.error("[MIRROR_MODE] failed:", error);
      setErrorMessage(messageFromError(error));
      setMirrorStatus("error");
      setSpecMood("stuck");
      setReplayState("idle");
      setReplayMode(null);
    }
  };
  const submitMirrorFeedback = async (kind) => {
    const nextCorrectionCount = kind === "correction" ? mirrorCorrectionCount + 1 : mirrorCorrectionCount;
    setMirrorCorrectionCount(nextCorrectionCount);
    setMirrorFeedbackStatus("Updating reward from measured feedback...");
    try {
      const result = await api.behaviorRecordFeedback?.({
        kind,
        arm: mirrorFeedbackArm || "C",
        correctionCount: nextCorrectionCount,
        targetLabel: "Mirror Mode user comparison"
      });
      if (result?.state) {
        setBehavioralState(result.state);
        setSpecMood(result.state.moodLabel || "idle");
      }
      setMirrorFeedbackStatus(
        kind === "accept" ? "Accepted: reward + confidence updated." : kind === "override" ? "Override recorded: reward penalty + behavior delta saved." : kind === "correction" ? "Correction recorded: stronger penalty applied." : "Hesitation recorded: confidence softened."
      );
    } catch (error) {
      console.error("[BEHAVIOR] feedback failed:", error);
      setMirrorFeedbackStatus(messageFromError(error));
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
    setMirrorStatus("idle");
    setSpecMood(behavioralState?.moodLabel || "idle");
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
  if (!isVisible && replayState === "idle" && !isLoading && mirrorStatus !== "running") return null;
  const isMirrorRunning = mirrorStatus === "running";
  const isReplayRunning = replayState === "running" || isMirrorRunning;
  const showWalkthroughDebug = SHOW_WALKTHROUGH_DEBUG;
  const statusText = currentStep ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? "?"}: ${currentStep.instruction || currentStep.targetLabel || (replayMode === "auto" ? "Executing action" : "Follow the ghost cursor")}` : isMirrorRunning ? "Mirror Mode controlling cursor..." : replayMode === "auto" ? "Executing workflow..." : "Walkthrough running...";
  const displayedBehavior = blendedPreview || behavioralState;
  const blendFrom = firstCheckpoint(behaviorCheckpoints);
  const blendTo = latestCheckpoint(behaviorCheckpoints);
  const canBlend = Boolean(blendFrom && blendTo && blendFrom.id !== blendTo.id);
  const hasRealBehaviorCheckpoint = behaviorCheckpoints.some(
    (checkpoint) => checkpoint.synthetic !== true
  );
  const isMirrorModeLocked = !hasCompletedWalkthrough && !hasRealBehaviorCheckpoint;
  const isMirrorButtonDisabled = isLoading || mirrorStatus === "running" || isMirrorModeLocked;
  const mirrorButtonLabel = mirrorStatus === "running" ? "Mirroring..." : !hasCompletedWalkthrough ? "Mirror Mode (needs walkthrough)" : "Mirror Mode ✓";
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
      "data-specter-boundary": "true",
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
        /* @__PURE__ */ jsxRuntimeExports.jsx(GhostCursor, { mood: specMood, isVisible }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(WalkthroughGuide, { step: currentStep }),
        (isVisible || isReplayRunning || isLoading) && /* @__PURE__ */ jsxRuntimeExports.jsx(
          SpecBuddy,
          {
            mood: specMood,
            state: displayedBehavior || void 0,
            enabled: isVisible || isReplayRunning || isLoading,
            checkpointLabel: activeCheckpoint?.label,
            compact: !showDebugTools,
            pitchMode
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
              isHudHoveredRef.current = true;
              setInteractivity(true);
            },
            onMouseLeave: () => {
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
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-kicker", children: showFallbackWorkflow ? "Vision unavailable" : "Guided Workspace" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-title", children: showFallbackWorkflow ? "I couldn't confidently detect the target. Pick it manually or use Fallback Practice." : realAppTargets?.microTask || "First, I will teach one visible action." })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-meta", children: showFallbackWorkflow ? "Real app still works" : realAppTargets?.app || "Real app" })
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
                    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-workflow-note", children: "Pick a numbered marker, or click anywhere to set manually." })),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "specter-action-row", children: showFallbackWorkflow ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
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
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "specter-action-button",
                          disabled: isLoading,
                          onClick: prepareControlledDemo,
                          children: "Fallback Practice"
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
                    mode === "ultra" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      UltraReplyBubble,
                      {
                        reply: ultraReply,
                        state: ultraState,
                        voiceFallback: lastTTSProvider === "macos"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      InputBar,
                      {
                        onSubmit: handleInputSubmit,
                        onNewChat: startNewChat,
                        disabled: isLoading,
                        mode,
                        onUltraSpokenInput: handleUltraSpokenInput,
                        onTranscriptionStart: () => {
                          if (mode === "ultra") setUltraState("transcribing");
                        },
                        onTranscriptionEnd: () => {
                          if (mode === "ultra" && ultraState === "transcribing") setUltraState("waitingForUser");
                        },
                        onFocus: () => {
                          setIsInputFocused(true);
                        },
                        onBlur: () => {
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
                          letterSpacing: "0.2px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        },
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                            "Looking at ",
                            screenState.app
                          ] }),
                          mode === "ultra" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: {
                            color: ultraState === "thinking" || ultraState === "speaking" || ultraState === "transcribing" ? "#30d158" : "rgba(255,255,255,0.25)",
                            fontSize: "9px",
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            fontWeight: 800
                          }, children: ultraState === "waitingForUser" ? "Ready" : ultraState })
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
                        children: "Debug / Dev Fallback Tools"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        className: "mirror-mode-panel",
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          padding: "10px",
                          borderRadius: "12px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.08)"
                        },
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "div",
                            {
                              style: {
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap"
                              },
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    disabled: isLoading,
                                    onClick: seedSpecDemo,
                                    style: {
                                      flex: 1,
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: "10px",
                                      padding: "8px",
                                      color: "white",
                                      background: "rgba(100,210,255,0.16)",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      cursor: "pointer"
                                    },
                                    children: "DEV Synthetic Data"
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    disabled: isLoading,
                                    onClick: createBehaviorCheckpoint,
                                    style: {
                                      flex: 1,
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: "10px",
                                      padding: "8px",
                                      color: "white",
                                      background: "rgba(48,209,88,0.16)",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      cursor: "pointer"
                                    },
                                    children: "Create Checkpoint"
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "button",
                                  {
                                    disabled: isMirrorButtonDisabled,
                                    onClick: runMirrorMode,
                                    style: {
                                      flex: 1,
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: "10px",
                                      padding: "8px",
                                      color: "white",
                                      background: isMirrorRunning ? "rgba(27,240,255,0.26)" : "rgba(191,90,242,0.18)",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      cursor: isMirrorButtonDisabled ? "default" : "pointer"
                                    },
                                    children: mirrorButtonLabel
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  "button",
                                  {
                                    onClick: () => setPitchMode((current) => !current),
                                    style: {
                                      flex: 1,
                                      minWidth: "120px",
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: "10px",
                                      padding: "8px",
                                      color: "white",
                                      background: pitchMode ? "rgba(255,214,10,0.22)" : "rgba(255,255,255,0.08)",
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      cursor: "pointer"
                                    },
                                    children: [
                                      "Pitch Mode ",
                                      pitchMode ? "ON" : "OFF"
                                    ]
                                  }
                                )
                              ]
                            }
                          ),
                          isMirrorModeLocked && /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "div",
                            {
                              style: {
                                fontSize: "9px",
                                color: "rgba(255,255,255,0.35)",
                                fontWeight: 700
                              },
                              children: "Use computer 60s → Create Checkpoint → start a walkthrough → Mirror Mode unlocks"
                            }
                          ),
                          pitchMode && /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "div",
                            {
                              className: "mirror-pitch-timeline",
                              style: {
                                display: "grid",
                                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                                gap: "5px",
                                color: "rgba(255,255,255,0.78)",
                                fontSize: "9px",
                                fontWeight: 850
                              },
                              children: ["Measured", "Signature", "Checkpoint", "Mirror", "Feedback"].map(
                                (label, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  "div",
                                  {
                                    style: {
                                      minHeight: "34px",
                                      borderRadius: "9px",
                                      padding: "6px",
                                      background: "rgba(255,255,255,0.07)",
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      display: "grid",
                                      alignContent: "center",
                                      gap: "2px"
                                    },
                                    children: [
                                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { style: { color: "rgba(100,210,255,0.82)" }, children: [
                                        "Step ",
                                        index + 1
                                      ] }),
                                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label })
                                    ]
                                  },
                                  label
                                )
                              )
                            }
                          ),
                          (mirrorFeedbackStatus || mirrorStatus === "complete") && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "div",
                            {
                              style: {
                                display: "grid",
                                gap: "7px",
                                padding: "8px",
                                borderRadius: "10px",
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                color: "rgba(255,255,255,0.72)",
                                fontSize: "10px",
                                fontWeight: 800
                              },
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: mirrorFeedbackStatus || "Compare Mirror Mode against your real override." }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "div",
                                  {
                                    style: {
                                      display: "grid",
                                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                                      gap: "6px"
                                    },
                                    children: [
                                      ["accept", "Accept"],
                                      ["override", "Override"],
                                      ["hesitation", "Hesitated"],
                                      ["correction", "Corrected"]
                                    ].map(([kind, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                                      "button",
                                      {
                                        onClick: () => void submitMirrorFeedback(kind),
                                        style: {
                                          border: "1px solid rgba(255,255,255,0.12)",
                                          borderRadius: "9px",
                                          padding: "7px 5px",
                                          color: "white",
                                          background: "rgba(255,255,255,0.08)",
                                          fontSize: "10px",
                                          fontWeight: 850,
                                          cursor: "pointer"
                                        },
                                        children: label
                                      },
                                      kind
                                    ))
                                  }
                                )
                              ]
                            }
                          ),
                          canBlend && blendFrom && blendTo && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "div",
                            {
                              style: {
                                display: "grid",
                                gap: "6px",
                                color: "rgba(255,255,255,0.68)",
                                fontSize: "10px",
                                fontWeight: 700
                              },
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  "div",
                                  {
                                    style: {
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: "8px"
                                    },
                                    children: [
                                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: blendFrom.label }),
                                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: blendTo.label })
                                    ]
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsx(
                                  "input",
                                  {
                                    "aria-label": "Blend behavioral checkpoints",
                                    type: "range",
                                    min: "0",
                                    max: "1",
                                    step: "0.01",
                                    value: blendT,
                                    onChange: (event) => void updateBlendPreview(Number(event.target.value))
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: (behaviorDiff?.summary || []).join(" | ") || "Move the slider to blend past-you and present-you." })
                              ]
                            }
                          ),
                          displayedBehavior && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "div",
                            {
                              style: {
                                display: "grid",
                                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                gap: "4px 10px",
                                color: "rgba(255,255,255,0.58)",
                                fontSize: "10px",
                                fontWeight: 700
                              },
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                  "load ",
                                  behaviorPercent(displayedBehavior.cognitiveLoad)
                                ] }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                  "impulse ",
                                  behaviorPercent(displayedBehavior.impulsivity)
                                ] }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                  "flow ",
                                  behaviorPercent(displayedBehavior.flowScore)
                                ] }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                  "revision ",
                                  behaviorPercent(displayedBehavior.revisionRate)
                                ] }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                  "confidence ",
                                  behaviorPercent(displayedBehavior.decisionConfidence)
                                ] }),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: activeCheckpoint?.commitMessage || "behavior model live" })
                              ]
                            }
                          ),
                          behaviorDiff && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                            "div",
                            {
                              className: "mirror-diff-card",
                              style: {
                                display: "grid",
                                gap: "5px",
                                padding: "8px",
                                borderRadius: "10px",
                                background: "rgba(0,0,0,0.16)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                color: "rgba(255,255,255,0.72)",
                                fontSize: "10px",
                                fontWeight: 800
                              },
                              children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "rgba(255,255,255,0.9)" }, children: "What changed?" }),
                                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                                  "div",
                                  {
                                    style: {
                                      display: "flex",
                                      gap: "8px",
                                      flexWrap: "wrap"
                                    },
                                    children: [
                                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                        "Impulsivity ",
                                        signedBehaviorPercent(behaviorDiff.deltas.impulsivity)
                                      ] }),
                                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                        "Decision confidence ",
                                        signedBehaviorPercent(behaviorDiff.deltas.decisionConfidence)
                                      ] }),
                                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                                        "Revision rate ",
                                        signedBehaviorPercent(behaviorDiff.deltas.revisionRate)
                                      ] })
                                    ]
                                  }
                                ),
                                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { color: "rgba(100,210,255,0.78)" }, children: blendTo?.commitMessage || activeCheckpoint?.commitMessage || "behavioral checkpoint ready" })
                              ]
                            }
                          )
                        ]
                      }
                    ),
                    aiHealthPills && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginBottom: "2px"
                    }, children: [
                      {
                        label: "Claude vision",
                        ok: aiHealthPills?.anthropic?.testRequest?.pass,
                        detail: aiHealthPills?.anthropic?.testRequest?.pass ? "ready" : aiHealthPills?.anthropic?.testRequest?.category || "failing"
                      },
                      {
                        label: "Whisper",
                        ok: aiHealthPills?.openai?.whisperConfigured,
                        detail: aiHealthPills?.openai?.whisperConfigured ? "ready" : "missing key"
                      },
                      {
                        label: "Voice",
                        ok: aiHealthPills?.elevenlabs?.configured || aiHealthPills?.openaiTTS?.configured,
                        detail: aiHealthPills?.elevenlabs?.configured ? "ElevenLabs" : aiHealthPills?.openaiTTS?.configured ? "OpenAI TTS" : lastTTSProvider === "macos" ? "macOS fallback" : "macOS fallback"
                      }
                    ].map((pill) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 8px",
                          borderRadius: "999px",
                          background: pill.ok ? "rgba(48,209,88,0.12)" : "rgba(255,69,58,0.12)",
                          border: `1px solid ${pill.ok ? "rgba(48,209,88,0.3)" : "rgba(255,69,58,0.3)"}`,
                          fontSize: "10px",
                          fontWeight: 600,
                          color: pill.ok ? "rgba(48,209,88,0.9)" : "rgba(255,100,80,0.9)"
                        },
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: pill.ok ? "✓" : "✗" }),
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                            pill.label,
                            ": ",
                            pill.detail
                          ] })
                        ]
                      },
                      pill.label
                    )) }),
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
                              children: "Dev fallback demo"
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
                              children: "Check Voice Backend"
                            }
                          ),
                          /* @__PURE__ */ jsxRuntimeExports.jsx(
                            "button",
                            {
                              disabled: isLoading,
                              onClick: async () => {
                                try {
                                  const res = await api.testVoiceOutput();
                                  const providerNames = {
                                    elevenlabs: "ElevenLabs",
                                    openai: "OpenAI TTS",
                                    macos: "macOS Fallback (Robotic)"
                                  };
                                  let msg = `Voice test successful using ${providerNames[res.providerUsed] || res.providerUsed}.`;
                                  if (res.providerUsed !== "elevenlabs" && res.fallbackReason) {
                                    msg += `
ElevenLabs failed: ${res.fallbackReason}`;
                                  }
                                  setAiHealthMessage(msg);
                                } catch (err) {
                                  setAiHealthMessage(`Voice test failed: ${messageFromError(err)}`);
                                }
                              },
                              style: {
                                flex: 1,
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: "10px",
                                padding: "8px",
                                color: "white",
                                background: "rgba(255,105,180,0.14)",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer"
                              },
                              children: "Test Voice Output"
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
                  stepProgress: currentStep ? (currentStep.index ?? 0) / Math.max(1, currentStep.total ?? 1) : 0,
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
