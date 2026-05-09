import React from "react";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.2 };

interface GhostCursorProps {
  isVisible: boolean;
  mood?: string;
  step?: any;
}

export const GhostCursor: React.FC<GhostCursorProps> = ({
  isVisible,
  step,
}) => {
  if (!isVisible || !step) return null;

  const x = step.viewportX ?? step.x;
  const y = step.viewportY ?? step.y;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(calc(${x}vw - ${CURSOR_HOTSPOT.x}px), calc(${y}vh - ${CURSOR_HOTSPOT.y}px), 0)`,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
          fill="white"
          stroke="black"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
