import React, { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import { InputBar } from '../overlay/InputBar'
import { GhostCursor } from '../overlay/GhostCursor'
import { ModeToggle } from '../overlay/ModeToggle'
import { SessionPanel } from '../overlay/SessionPanel'

export const OverlayApp: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [mode, setMode] = useState<'silent' | 'ultra'>('silent')
  const [intent, setIntent] = useState('')
  const [currentStep, setCurrentStep] = useState<any>(null)
  const [replayState, setReplayState] = useState<'idle' | 'running' | 'paused'>('idle')

  useEffect(() => {
    api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev)
    })

    api.onReplayStep((data: any) => {
      setCurrentStep(data.step)
      setReplayState('running')
    })

    api.onReplayComplete(() => {
      setCurrentStep(null)
      setReplayState('idle')
    })

    api.onReplayStopped(() => {
      setCurrentStep(null)
      setReplayState('idle')
    })
  }, [])

  const handleIntentSubmit = async (text: string) => {
    setIntent(text)
    // Logic to start planning and replay
    const screenState = await api.analyzeScreen()
    const plan = await api.planSteps(text, screenState, [], mode)
    if (plan && plan.steps.length > 0) {
      await api.saveNode(plan.levelTitle, plan.steps)
      await api.walkthrough(plan.levelTitle)
    }
  }

  if (!isVisible && replayState === 'idle') return null

  return (
    <div className="overlay-container" style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      pointerEvents: isVisible ? 'auto' : 'none',
      background: isVisible ? 'rgba(0,0,0,0.1)' : 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <GhostCursor step={currentStep} />
      
      {isVisible && (
        <div style={{
          position: 'absolute',
          bottom: '10%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          width: '80%',
          maxWidth: '600px',
          pointerEvents: 'auto'
        }}>
          <ModeToggle mode={mode} onChange={setMode} />
          <InputBar onSubmit={handleIntentSubmit} />
          <SessionPanel intent={intent} />
        </div>
      )}
    </div>
  )
}
