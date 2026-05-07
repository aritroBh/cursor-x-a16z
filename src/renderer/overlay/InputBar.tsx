import React, { useState } from 'react'

interface InputBarProps {
  onSubmit: (text: string) => void
}

export const InputBar: React.FC<InputBarProps> = ({ onSubmit }) => {
  const [value, setValue] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmit(value)
      setValue('')
    }
  }

  return (
    <div className="input-bar siri-glow-input" style={{
      width: '100%',
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(10px)',
      borderRadius: '16px',
      padding: '12px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      border: '1px solid rgba(255,255,255,0.2)'
    }}>
      <input
        autoFocus
        type="text"
        placeholder="What would you like to learn?"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          fontSize: '18px',
          outline: 'none',
          color: '#1a1a1a'
        }}
      />
      <div style={{
        marginLeft: '12px',
        color: '#666',
        fontSize: '12px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        Press Enter
      </div>
    </div>
  )
}
