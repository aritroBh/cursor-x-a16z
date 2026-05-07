import React, { useRef, useState } from "react";
import { MicRecorder } from "./MicRecorder";

const recorder = new MicRecorder();

interface InputBarProps {
  onSubmit: (text: string) => void;
  onNewChat?: () => void;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const SpecterMarkIcon = () => (
  <svg className="input-bar-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2.75l1.75 6.05L19.75 7 15.5 11.95l4.25 5-6-1.8L12 21.25l-1.75-6.1-6 1.8 4.25-5L4.25 7l6 1.8L12 2.75z"
      fill="currentColor"
    />
    <circle cx="12" cy="12" r="2.25" fill="rgba(12, 16, 24, 0.92)" />
  </svg>
);

const MicrophoneIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 0 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M5.75 10.5v.75a6.25 6.25 0 0 0 12.5 0v-.75M12 17.5v3M9 20.5h6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M4 6l4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
  </svg>
);

const SendArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M5 12h13.5M13.5 6.5 19 12l-5.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

export const InputBar: React.FC<InputBarProps> = ({
  onSubmit,
  onNewChat,
  disabled = false,
  onFocus,
  onBlur,
}) => {
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recordingActiveRef = useRef(false);
  const recordingStartRef = useRef<Promise<void> | null>(null);
  const stoppingRef = useRef(false);
  const canSubmit = Boolean(value.trim()) && !disabled;

  const submitValue = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue("");
    setMicMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submitValue();
    }
  };

  const handleNewChat = () => {
    if (disabled) return;
    setValue("");
    onNewChat?.();
  };

  const startRecording = async (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled || recordingActiveRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setMicMessage("");
    recordingActiveRef.current = true;
    setIsRecording(true);

    recordingStartRef.current = recorder.start();
    try {
      await recordingStartRef.current;
    } catch (error) {
      console.error("[InputBar] Microphone recording failed:", error);
      recordingActiveRef.current = false;
      setIsRecording(false);
      setMicMessage("Microphone unavailable. Check permission and try again.");
    }
  };

  const stopRecording = async () => {
    if (disabled || !recordingActiveRef.current || stoppingRef.current) return;
    stoppingRef.current = true;
    recordingActiveRef.current = false;
    setIsRecording(false);

    try {
      await recordingStartRef.current;
      const buffer = await recorder.stop();
      if (!buffer.byteLength) {
        setMicMessage("No audio captured. Hold the mic a little longer.");
        return;
      }

      console.log("[MIC] sent to whisper", { size: buffer.byteLength });
      const text = await (window as any).api.transcribe(buffer);
      console.log("[MIC] transcription received", {
        length: typeof text === "string" ? text.length : 0,
      });
      if (typeof text === "string" && text.trim()) {
        setValue(text.trim());
        setMicMessage("");
        window.setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setMicMessage("No transcription returned. Try holding the mic longer.");
      }
    } catch (error) {
      console.error("[InputBar] Microphone transcription failed:", error);
      setMicMessage("Voice transcription failed. You can type instead.");
    } finally {
      recordingStartRef.current = null;
      stoppingRef.current = false;
    }
  };

  return (
    <div className={`input-bar ${disabled ? "is-disabled" : ""}`}>
      <div className="input-bar-brand" title="Specter" aria-hidden="true">
        <SpecterMarkIcon />
      </div>
      <input
        ref={inputRef}
        autoFocus
        className="input-bar-field"
        type="text"
        placeholder="What can I help you with today?"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <div className="input-bar-actions">
        <button
          type="button"
          className={`input-bar-icon-button input-bar-mic-button ${
            isRecording ? "is-recording" : ""
          }`}
          disabled={disabled}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerCancel={stopRecording}
          onPointerLeave={stopRecording}
          aria-label={
            isRecording ? "Release to stop recording" : "Record voice input"
          }
          title={
            isRecording ? "Release to stop recording" : "Record voice input"
          }
        >
          <MicrophoneIcon />
        </button>
        {onNewChat && (
          <button
            type="button"
            className="input-bar-new-chat"
            disabled={disabled}
            onClick={handleNewChat}
            aria-label="Start a new chat"
            title="Start a new chat"
          >
            <span>New Chat</span>
            <ChevronDownIcon />
          </button>
        )}
        <button
          type="button"
          className="input-bar-send-button"
          disabled={!canSubmit}
          onClick={submitValue}
          aria-label="Send message"
          title="Send message"
        >
          <SendArrowIcon />
        </button>
      </div>
      {micMessage && <div className="input-bar-mic-message">{micMessage}</div>}
    </div>
  );
};
