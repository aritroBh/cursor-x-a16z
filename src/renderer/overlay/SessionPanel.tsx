import React from 'react'

interface SessionPanelProps {
  intent: string
}

export const SessionPanel: React.FC<SessionPanelProps> = ({ intent }) => {
  if (!intent) return null

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
