import React from "react";

interface WalkthroughGuideProps {
  step: any;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export const WalkthroughGuide: React.FC<WalkthroughGuideProps> = ({ step }) => {
  if (!step || step.type === "idle" || step.action === "wait") return null;

  const x = clampPercent(step.x ?? 50);
  const y = clampPercent(step.y ?? 50);
  const bubbleOnLeft = x > 70;
  const hasHint = Boolean(step.instruction || step.targetLabel);
  const isLocked = step.ghostLocked === true;

  return (
    <div
      className="walkthrough-guide-container"
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-2px, -2px)",
        pointerEvents: "none",
        zIndex: 9998,
        transition: "left 0.24s ease, top 0.24s ease",
      }}
    >
      {/* Ring pulse */}
      <div
        className="walkthrough-guide-ring"
        style={{
          position: "absolute",
          width: isLocked ? "48px" : "42px",
          height: isLocked ? "48px" : "42px",
          borderRadius: "50%",
          border: isLocked
            ? "2px solid rgba(48, 209, 88, 0.72)"
            : "2px solid rgba(10, 132, 255, 0.45)",
          background: isLocked
            ? "rgba(48, 209, 88, 0.14)"
            : "rgba(10, 132, 255, 0.10)",
          animation: isLocked ? undefined : "wt-ring-pulse 1.8s infinite",
          left: isLocked ? "-23px" : "-20px",
          top: isLocked ? "-23px" : "-20px",
          transition: "all 0.18s ease",
        }}
      />

      {/* Pointer arrow */}
      <svg
        className="walkthrough-guide-pointer"
        width="34"
        height="42"
        viewBox="0 0 28 34"
        aria-hidden="true"
        style={{
          display: "block",
          opacity: isLocked ? 0.88 : 0.72,
          filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.38))",
          transition: "opacity 0.18s ease",
        }}
      >
        <path
          d="M2.4 2.3v27.1l7.2-7.4 4.3 10 5.1-2.2-4.3-9.8h10.6L2.4 2.3Z"
          fill="white"
          stroke="rgba(8, 10, 14, 0.92)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </svg>

      {/* Instruction bubble */}
      {hasHint && (
        <div
          className="walkthrough-guide-bubble"
          style={{
            position: "absolute",
            ...(bubbleOnLeft ? { right: "32px" } : { left: "32px" }),
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
            opacity: 0.78,
          }}
        >
          {step.instruction || step.targetLabel}
        </div>
      )}

      <style>{`
        @keyframes wt-ring-pulse {
          0% { transform: scale(0.55); opacity: 0.72; }
          100% { transform: scale(1.35); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
