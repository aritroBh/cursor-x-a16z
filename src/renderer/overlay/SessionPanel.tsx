import React from 'react'

interface SessionPanelProps {
  intent: string
  nodeId?: string
  isBusy?: boolean
  onWalkthrough: () => void
  onAutoExecute: () => void
}

export const SessionPanel: React.FC<SessionPanelProps> = ({
  intent,
  nodeId,
  isBusy = false,
  onWalkthrough,
  onAutoExecute
}) => {
  if (!intent) return null

  const disabled = isBusy || !nodeId
  const buttonBase: React.CSSProperties = {
    flex: 1,
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '12px',
    padding: '10px 12px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1
  }

  return (
    <div className="session-panel" style={{
      width: '100%',
      background: 'rgba(26, 26, 26, 0.8)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '20px',
      color: 'white',
      boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase' }}>
        Current Goal
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700 }}>
        {intent}
      </div>
      <div style={{
        display: 'flex',
        gap: '10px',
        width: '100%'
      }}>
        <button
          disabled={disabled}
          onClick={onWalkthrough}
          style={{
            ...buttonBase,
            background: 'rgba(255,255,255,0.14)'
          }}
        >
          Walk me through
        </button>
        <button
          disabled={disabled}
          onClick={onAutoExecute}
          style={{
            ...buttonBase,
            background: 'linear-gradient(135deg, rgba(10,132,255,0.84), rgba(48,209,88,0.72))'
          }}
        >
          Do it for me
        </button>
      </div>
      <div className="progress-bar" style={{
        width: '100%',
        height: '6px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '3px',
        marginTop: '8px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: '30%', // Simulated progress
          height: '100%',
          background: 'linear-gradient(90deg, #7c3aed, #ec4899)',
          borderRadius: '3px'
        }} />
      </div>
    </div>
  )
}
