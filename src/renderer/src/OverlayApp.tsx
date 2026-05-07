import React, { useState, useEffect } from 'react'
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
  const [isLoading, setIsLoading] = useState(false)

  // Overlay visibility + replay lifecycle events
  useEffect(() => {
    api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev)
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

  // Listen for walkthrough step events (clears loading once first step fires)
  useEffect(() => {
    api.onReplayStep((data: any) => {
      setCurrentStep(data.step)
      setReplayState('running')
      setIsLoading(false)
    })
  }, [])

  // Listen for auto-execute progress events
  useEffect(() => {
    api.onReplayProgress((data: any) => {
      setReplayState('running')
      setCurrentStep({ index: data.index, total: data.total })
    })
  }, [])

  const handleIntentSubmit = async (text: string) => {
    setIntent(text)
    setIsLoading(true)

    // Capture + analyze screen
    const screenState = await api.analyzeScreen()

    // Plan steps
    const plan = await api.planSteps(text, screenState, [], mode)
    if (!plan || !plan.steps || plan.steps.length === 0) {
      setIsLoading(false)
      return
    }

    // Ultra mode: speak the level title
    if (mode === 'ultra') {
      await api.speak(`Starting: ${plan.levelTitle}`)
    }

    // Save steps to session storage (steps now use x/y after Bug 1 fix)
    await api.saveNode(plan.levelTitle, plan.steps)

    // Select teaching style from bandit
    const arm = await api.selectStyle()
    const startTime = Date.now()

    // Run walkthrough - replay:step events update currentStep via onReplayStep listener
    await api.walkthrough(plan.levelTitle)
    setIsLoading(false) // fallback if walkthrough fires no steps

    // Record bandit reward based on time taken
    const elapsed = Date.now() - startTime
    const reward = elapsed < 15000 ? 1 : elapsed < 45000 ? 0.5 : 0
    await api.recordReward(arm, reward)

    // Mark complete
    await api.markNodeComplete(plan.levelTitle)
  }

  if (!isVisible && replayState === 'idle' && !isLoading) return null

  return (
    <div className="overlay-container" style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      pointerEvents: isVisible ? 'auto' : 'none',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <GhostCursor step={currentStep} />

      {isLoading && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.75)',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: 500,
          backdropFilter: 'blur(8px)',
          pointerEvents: 'none',
          zIndex: 9999
        }}>
          Analyzing your screen...
        </div>
      )}

      {isVisible && (
        <>
          <div className="siri-glow-fullscreen" />
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
        </>
      )}
    </div>
  )
}
