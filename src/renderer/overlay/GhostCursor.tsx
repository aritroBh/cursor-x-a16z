import React from 'react'
import { usePerimeterRoam } from './usePerimeterRoam'

interface GhostCursorProps {
  isVisible: boolean
  mood?: string
}

export const GhostCursor: React.FC<GhostCursorProps> = ({ isVisible, mood }) => {
  const { x, y, transitionDuration, isPaused } = usePerimeterRoam(isVisible, 48)

  if (!isVisible) return null

  const moodOpacity =
    mood === 'stuck' ? 0.35 :
    mood === 'celebrating' ? 1 :
    mood === 'thinking' ? 0.85 :
    0.72

  const moodColor =
    mood === 'stuck' ? 'rgba(255, 69, 58, 0.55)' :
    mood === 'celebrating' ? 'rgba(48, 209, 88, 0.55)' :
    mood === 'thinking' ? 'rgba(10, 132, 255, 0.45)' :
    'rgba(10, 132, 255, 0.45)'

  return (
    <div
      className="ghost-cursor-container"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        pointerEvents: 'none',
        zIndex: 9999,
        transition: `left ${transitionDuration}ms ease-in-out, top ${transitionDuration}ms ease-in-out`,
        opacity: moodOpacity,
      }}
    >
      <div
        className="ghost-mascot-ring"
        style={{
          position: 'absolute',
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: `2px solid ${moodColor}`,
          background: moodColor.replace('0.55', '0.10').replace('0.45', '0.10'),
          left: '-20px',
          top: '-20px',
          transition: 'all 0.4s ease',
        }}
      />
      <div
        className="ghost-mascot-motion"
        style={{
          animation: isPaused ? 'ghost-bob 2.4s ease-in-out infinite' : undefined,
        }}
      >
        <svg
          className="ghost-mascot-pointer"
          width="34"
          height="42"
          viewBox="0 0 28 34"
          aria-hidden="true"
          style={{
            display: 'block',
            filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.38))',
            transition: 'opacity 0.4s ease',
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
      </div>
      <style>{`
        .ghost-mascot-motion {
          transform-origin: 3px 3px;
          will-change: transform;
        }

        @keyframes ghost-bob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(2deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-2px) rotate(-2deg); }
        }
      `}</style>
    </div>
  )
}
