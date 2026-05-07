import React, { useState } from 'react'
import { MicRecorder } from './MicRecorder'

const recorder = new MicRecorder()

interface InputBarProps {
  onSubmit: (text: string) => void
  disabled?: boolean
}

export const InputBar: React.FC<InputBarProps> = ({ onSubmit, disabled = false }) => {
  const [value, setValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && e.key === 'Enter' && value.trim()) {
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
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          fontSize: '18px',
          outline: 'none',
          color: '#1a1a1a',
          opacity: disabled ? 0.55 : 1
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
      <button
        disabled={disabled}
        onMouseDown={async () => {
          if (disabled) return
          setIsRecording(true)
          await recorder.start()
        }}
        onMouseUp={async () => {
          if (disabled) return
          setIsRecording(false)
          const buffer = await recorder.stop()
          const text = await (window as any).api.transcribe(buffer)
          if (text) onSubmit(text)
        }}
        style={{
          background: isRecording ? '#ff3b30' : 'rgba(0,0,0,0.1)',
          border: 'none', borderRadius: '50%',
          width: '36px', height: '36px',
          cursor: disabled ? 'default' : 'pointer', marginLeft: '8px',
          opacity: disabled ? 0.55 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {isRecording ? '⏹' : '🎤'}
      </button>
    </div>
  )
}
