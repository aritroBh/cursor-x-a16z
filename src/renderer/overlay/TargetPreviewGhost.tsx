import React, { useEffect, useRef, useState } from "react";

interface PreviewTarget {
  x: number;
  y: number;
  label?: string;
}

interface TargetPreviewGhostProps {
  target: PreviewTarget | null;
  start?: { x: number; y: number };
  active: boolean;
}

type Phase = "enter" | "travel" | "arrived" | "reset";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.2 };

const TRAVEL_MS = 600;
const PAUSE_MS = 400;
const PULSE_MS = 600;
const RESET_MS = 100;

export const TargetPreviewGhost: React.FC<TargetPreviewGhostProps> = ({
  target,
  start,
  active,
}) => {
  const [phase, setPhase] = useState<Phase>("enter");
  const startPosRef = useRef(start || { x: 50, y: 50 });
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!target) return;
    console.log("[PREVIEW_GHOST] target preview", {
      label: target.label || "unknown",
      x: target.x,
      y: target.y,
      sourceFrame: "viewport",
    });
  }, [target?.x, target?.y, target?.label]);

  useEffect(() => {
    if (phase === "arrived" && target) {
      console.log("[PREVIEW_GHOST] endpoint", {
        label: target.label || "unknown",
        x: target.x,
        y: target.y,
      });
    }
  }, [phase, target]);

  useEffect(() => {
    if (!active || !target) return;

    if (start) startPosRef.current = start;

    const timers: number[] = [];
    timersRef.current = timers;

    const cycle = () => {
      setPhase("travel");
      const t1 = window.setTimeout(() => {
        setPhase("arrived");
        const t2 = window.setTimeout(() => {
          setPhase("reset");
          const t3 = window.setTimeout(() => {
            setPhase("enter");
            const t4 = window.setTimeout(() => {
              cycle();
            }, 50);
            timers.push(t4);
          }, RESET_MS);
          timers.push(t3);
        }, PAUSE_MS + PULSE_MS);
        timers.push(t2);
      }, TRAVEL_MS);
      timers.push(t1);
    };

    setPhase("enter");
    const t0 = window.setTimeout(() => {
      cycle();
    }, 50);
    timers.push(t0);

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [active, target?.x, target?.y, start?.x, start?.y]);

  if (!active || !target) return null;

  const posX =
    phase === "enter" || phase === "reset"
      ? startPosRef.current.x
      : target.x;
  const posY =
    phase === "enter" || phase === "reset"
      ? startPosRef.current.y
      : target.y;

  const isTraveling = phase === "travel";
  const isArrived = phase === "arrived";
  const isReset = phase === "reset";

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(calc(${posX}vw - ${CURSOR_HOTSPOT.x}px), calc(${posY}vh - ${CURSOR_HOTSPOT.y}px), 0)`,
        pointerEvents: "none",
        zIndex: 9999,
        transition: isTraveling
          ? "transform 600ms ease-out, opacity 600ms ease-out"
          : "none",
        opacity: isReset ? 0 : 0.88,
        filter: "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.38))",
      }}
    >
      <div className={isArrived ? "target-preview-ghost-pulse" : ""}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path
            d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
            fill="white"
            stroke="black"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
};
