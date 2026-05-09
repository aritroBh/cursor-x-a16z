import React from "react";

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

  return (
    <svg
      className="ghost-cursor"
      style={{
        position: "absolute",
        left: `${step.x}vw`,
        top: `${step.y}vh`,
        pointerEvents: "none",
        zIndex: 9999,
      }}
      width="24"
      height="24"
      viewBox="0 0 24 24"
    >
      <path
        d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
        fill="white"
        stroke="black"
        strokeWidth="1"
      />
    </svg>
  );
};
