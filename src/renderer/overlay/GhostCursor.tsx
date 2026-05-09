import React, { useEffect, useState } from "react";

// SVG path begins at (5.5, 3.21). Hotspot must match the path tip exactly so
// that translate(target - hotspot) lands the path tip on the target pixel.
const HOTSPOT_X = 5.5;
const HOTSPOT_Y = 3.21;

interface ViewportDims {
  width: number;
  height: number;
}

function readViewportDims(): ViewportDims {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

interface GhostCursorProps {
  isVisible: boolean;
  mood?: string;
  step?: any;
}

export const GhostCursor: React.FC<GhostCursorProps> = ({
  isVisible,
  step,
}) => {
  const [dims, setDims] = useState<ViewportDims>(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!isVisible || !step) return null;

  const percentX = step.viewportX ?? step.x;
  const percentY = step.viewportY ?? step.y;

  // Compute integer pixel coords directly from window dims rather than relying
  // on calc(${x}vw - hotspot). vw/vh subpixel resolution + calc rounding in
  // translate3d can drift the cursor by up to a pixel; computing once in JS
  // and rounding gives us a crisp, deterministic anchor every render.
  const pixelX = Math.round((percentX / 100) * dims.width - HOTSPOT_X);
  const pixelY = Math.round((percentY / 100) * dims.height - HOTSPOT_Y);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        transform: `translate3d(${pixelX}px, ${pixelY}px, 0)`,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
          fill="white"
          stroke="black"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
