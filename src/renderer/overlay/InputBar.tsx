import React, { useState } from 'react'
import { MicRecorder } from './MicRecorder'

const recorder = new MicRecorder()

interface InputBarProps {
  onSubmit: (text: string) => void
  onRealAppTest?: (text: string) => void
  disabled?: boolean
  showDebugTools?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

export const InputBar: React.FC<InputBarProps> = ({ 
  onSubmit, 
  onRealAppTest, 
  disabled = false, 
  showDebugTools = false,
  onFocus,
  onBlur
}) => {
  const [value, setValue] = useState('')
  const [isRecording, setIsRecording] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && e.key === 'Enter' && value.trim()) {
      onSubmit(value)
      setValue('')
    }
  }

  return (
    <div className="input-bar" style={{
      width: '100%',
      background: 'rgba(18, 18, 22, 0.72)',
      backdropFilter: 'blur(16px)',
      borderRadius: '16px',
      padding: '12px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      display: 'flex',
      alignItems: 'center',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <input
        autoFocus
        type="text"
        placeholder="What would you like to learn?"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          flex: 1,
          border: 'none',
          background: 'transparent',
          fontSize: '18px',
          outline: 'none',
          color: '#ffffff',
          opacity: disabled ? 0.55 : 1
        }}
      />
      <div style={{
        marginLeft: '12px',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        Return
      </div>
      {onRealAppTest && (
        <button
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            onRealAppTest(value)
            setValue('')
          }}
          style={{
            border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: '10px',
            height: '36px',
            padding: '0 10px',
            marginLeft: '10px',
            background: 'rgba(10,132,255,0.12)',
            color: '#0a4d86',
            fontSize: '12px',
            fontWeight: 800,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.55 : 1,
            whiteSpace: 'nowrap'
          }}
        >
          Real App Test
        </button>
      )}
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
