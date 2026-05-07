import React from 'react'

interface GhostCursorProps {
  step: any
}

export const GhostCursor: React.FC<GhostCursorProps> = ({ step }) => {
  if (!step) return null

  return (
    <div className="ghost-cursor-container" style={{
      position: 'absolute',
      left: `${step.targetX}%`,
      top: `${step.targetY}%`,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: 9999,
      transition: 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)'
    }}>
      <div className="pulse-ring" style={{
        position: 'absolute',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        border: '3px solid rgba(124, 58, 237, 0.5)',
        animation: 'pulse 2s infinite',
        left: '-30px',
        top: '-30px'
      }} />
      <div className="cursor-dot" style={{
        width: '12px',
        height: '12px',
        background: '#7c3aed',
        borderRadius: '50%',
        boxShadow: '0 0 15px rgba(124, 58, 237, 0.8)'
      }} />
      <div className="instruction-bubble" style={{
        position: 'absolute',
        left: '20px',
        top: '-10px',
        background: '#1a1a1a',
        color: 'white',
        padding: '8px 14px',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {step.instruction}
      </div>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
