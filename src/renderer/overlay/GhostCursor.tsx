import React from 'react'

interface GhostCursorProps {
  step: any
}

const DEMO_LOOP_MS = 1700

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function fallbackStart(step: any): { x: number; y: number } {
  const offsetX = step.x > 58 ? -18 : 18
  const offsetY = step.y > 58 ? -12 : 12
  return {
    x: clampPercent(step.x + offsetX),
    y: clampPercent(step.y + offsetY)
  }
}

export const GhostCursor: React.FC<GhostCursorProps> = ({ step }) => {
  if (!step || typeof step.x !== 'number' || typeof step.y !== 'number') return null

  const bubbleOnLeft = step.x > 70
  const fallback = fallbackStart(step)
  const startX = typeof step.ghostStartX === 'number' ? step.ghostStartX : fallback.x
  const startY = typeof step.ghostStartY === 'number' ? step.ghostStartY : fallback.y
  const fromX = clampPercent(startX) - clampPercent(step.x)
  const fromY = clampPercent(startY) - clampPercent(step.y)
  const shouldLoop = step.ghostLoop !== false && step.action !== 'wait' && !step.ghostLocked
  const hasHint = Boolean(step.instruction || step.targetLabel)
  const motionStyle = {
    '--ghost-from-x': `${fromX}vw`,
    '--ghost-from-y': `${fromY}vh`,
    '--ghost-loop-ms': `${DEMO_LOOP_MS}ms`,
    animation: shouldLoop
      ? 'ghost-cursor-demo var(--ghost-loop-ms) cubic-bezier(0.23, 1, 0.32, 1) infinite'
      : undefined
  } as React.CSSProperties

  return (
    <div className="ghost-cursor-container" style={{
      position: 'absolute',
      left: `${step.x}%`,
      top: `${step.y}%`,
      transform: 'translate(-2px, -2px)',
      pointerEvents: 'none',
      zIndex: 9999,
      transition: 'left 0.24s ease, top 0.24s ease'
    }}>
      <div className="ghost-cursor-ring" style={{
        position: 'absolute',
        width: step.ghostLocked ? '48px' : '42px',
        height: step.ghostLocked ? '48px' : '42px',
        borderRadius: '50%',
        border: step.ghostLocked ? '2px solid rgba(48, 209, 88, 0.72)' : '2px solid rgba(10, 132, 255, 0.45)',
        background: step.ghostLocked ? 'rgba(48, 209, 88, 0.14)' : 'rgba(10, 132, 255, 0.10)',
        animation: step.ghostLocked ? undefined : 'ghost-ring-pulse 1.8s infinite',
        left: step.ghostLocked ? '-23px' : '-20px',
        top: step.ghostLocked ? '-23px' : '-20px',
        transition: 'all 0.18s ease'
      }} />
      <div
        key={step.ghostReplayKey || `${step.index ?? 'step'}:${step.x}:${step.y}`}
        className="ghost-cursor-motion"
        style={motionStyle}
      >
        <svg
          className="ghost-cursor-pointer"
          width="34"
          height="42"
          viewBox="0 0 28 34"
          aria-hidden="true"
          style={{
            display: 'block',
            opacity: step.ghostLocked ? 0.88 : 0.72,
            filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.38))',
            transition: 'opacity 0.18s ease'
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
        {hasHint && (
          <div className="instruction-bubble" style={{
            position: 'absolute',
            ...(bubbleOnLeft ? { right: '32px' } : { left: '32px' }),
            top: '18px',
            background: 'rgba(18, 18, 20, 0.72)',
            color: 'white',
            padding: '6px 9px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 500,
            maxWidth: '220px',
            lineHeight: 1.25,
            boxShadow: '0 4px 12px rgba(0,0,0,0.24)',
            border: '1px solid rgba(255,255,255,0.1)',
            opacity: 0.78
          }}>
            {step.instruction || step.targetLabel}
          </div>
        )}
      </div>
      <style>{`
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
      `}</style>
    </div>
  )
}
