import React, { useState, useEffect } from 'react'
import { api } from './api'
import { InputBar } from '../overlay/InputBar'
import { GhostCursor } from '../overlay/GhostCursor'
import { ModeToggle } from '../overlay/ModeToggle'
import { SessionPanel } from '../overlay/SessionPanel'

type SpecterMode = 'silent' | 'ultra'
type ReplayState = 'idle' | 'running' | 'paused'
type ReplayMode = 'walkthrough' | 'auto' | null
const SHOW_WALKTHROUGH_DEBUG = import.meta.env.DEV

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Specter hit a temporary issue. Try again.'
}

function formatCoordinate(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '?'
}

function walkthroughStepFromReplay(data: any) {
  const ghost = data.ghost || {}
  return {
    ...data.step,
    index: data.index,
    total: data.total,
    retryReason: data.reason,
    ghostStartX: ghost.startX,
    ghostStartY: ghost.startY,
    ghostLoop: ghost.loop !== false,
    ghostLocked: false,
    ghostReplayKey: `${data.index}:${data.attempt ?? 0}`
  }
}

export const OverlayApp: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [mode, setMode] = useState<SpecterMode>('silent')
  const [intent, setIntent] = useState('')
  const [currentStep, setCurrentStep] = useState<any>(null)
  const [replayState, setReplayState] = useState<ReplayState>('idle')
  const [replayMode, setReplayMode] = useState<ReplayMode>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Analyzing your screen...')
  const [errorMessage, setErrorMessage] = useState('')
  const [lastNodeId, setLastNodeId] = useState('')

  // Overlay visibility + replay lifecycle events
  useEffect(() => {
    const offToggle = api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev)
    })

    const offComplete = api.onReplayComplete(() => {
      setCurrentStep(null)
      setReplayState('idle')
      setReplayMode(null)
    })

    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null)
      setReplayState('idle')
      setReplayMode(null)
    })

    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage('Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry.')
      setIsLoading(false)
    })

    return () => {
      offToggle()
      offComplete()
      offStopped()
      offScreenDenied()
    }
  }, [])

  // Listen for walkthrough step events (clears loading once first step fires)
  useEffect(() => {
    const offStep = api.onReplayStep((data: any) => {
      setCurrentStep(walkthroughStepFromReplay(data))
      setReplayMode('walkthrough')
      setReplayState('running')
      setIsLoading(false)
    })

    const offRetry = api.onReplayRetry((data: any) => {
      setCurrentStep(walkthroughStepFromReplay(data))
      setReplayMode('walkthrough')
      setReplayState('running')
      setIsLoading(false)
    })

    const offTargetReached = api.onReplayTargetReached((data: any) => {
      setCurrentStep((current: any) => {
        if (!current || current.index !== data.index) return current
        return {
          ...current,
          ghostLoop: false,
          ghostLocked: true
        }
      })
    })

    return () => {
      offStep()
      offRetry()
      offTargetReached()
    }
  }, [])

  // Listen for auto-execute progress events
  useEffect(() => {
    const offProgress = api.onReplayProgress((data: any) => {
      setReplayState('running')
      setReplayMode('auto')
      setCurrentStep({ index: data.index, total: data.total })
    })

    return () => {
      offProgress()
    }
  }, [])

  const handleIntentSubmit = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setIntent(trimmed)
    setErrorMessage('')
    setLoadingMessage('Analyzing your screen...')
    setIsLoading(true)
    const startTime = Date.now()
    let selectedArm: string | null = null

    try {
      const screenState = await api.analyzeScreen()

      setLoadingMessage('Planning the walkthrough...')
      const plan = await api.planSteps(trimmed, screenState, [], mode)
      if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        throw new Error('Specter could not create a usable plan for that intent.')
      }

      const nodeId = typeof plan.levelTitle === 'string' && plan.levelTitle.trim() ? plan.levelTitle : trimmed
      setLastNodeId(nodeId)

      setLoadingMessage('Saving the workflow...')
      await api.saveNode(nodeId, plan.steps)

      if (mode === 'ultra') {
        void api.speak(`Starting: ${nodeId}`).catch((error: unknown) => {
          console.error('[Overlay] TTS failed:', error)
        })
      } else if (api.stopSpeaking) {
        void api.stopSpeaking().catch(() => undefined)
      }

      try {
        selectedArm = await api.selectStyle()
      } catch (error) {
        console.warn('[Overlay] Could not select teaching style:', error)
      }

      setLoadingMessage('Starting walkthrough...')
      setReplayMode('walkthrough')
      setReplayState('running')
      await api.walkthrough(nodeId)

      const elapsed = Date.now() - startTime
      const reward = elapsed < 15000 ? 1 : elapsed < 45000 ? 0.5 : 0
      if (selectedArm) {
        await api.recordReward(selectedArm, reward)
      }
      await api.markNodeComplete(nodeId)
    } catch (error) {
      console.error('[Overlay] Intent submission failed:', error)
      setErrorMessage(messageFromError(error))
      setReplayState('idle')
      setReplayMode(null)
    } finally {
      setIsLoading(false)
    }
  }

  const replaySavedWorkflow = async (kind: Exclude<ReplayMode, null>) => {
    if (!lastNodeId) return

    setErrorMessage('')
    setIsLoading(true)
    setLoadingMessage(kind === 'walkthrough' ? 'Starting walkthrough...' : 'Starting auto-execute...')
    setReplayMode(kind)
    setReplayState('running')

    try {
      if (kind === 'walkthrough') {
        await api.walkthrough(lastNodeId)
      } else {
        await api.autoExecute(lastNodeId)
      }
    } catch (error) {
      console.error('[Overlay] Replay failed:', error)
      setErrorMessage(messageFromError(error))
      setReplayState('idle')
      setReplayMode(null)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible && replayState === 'idle' && !isLoading) return null

  const isReplayRunning = replayState === 'running'
  const showWalkthroughDebug = SHOW_WALKTHROUGH_DEBUG && replayMode === 'walkthrough' && currentStep
  const statusText = currentStep
    ? `Step ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? '?'}: ${
        currentStep.instruction || currentStep.targetLabel || (replayMode === 'auto' ? 'Executing action' : 'Follow the ghost cursor')
      }`
    : replayMode === 'auto'
      ? 'Executing workflow...'
      : 'Walkthrough running...'

  return (
    <>
    <div className="overlay-container" style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      pointerEvents: isVisible && !isReplayRunning ? 'auto' : 'none',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <GhostCursor step={currentStep} />

      {showWalkthroughDebug && (
        <div className="walkthrough-debug-pill" style={{
          position: 'fixed',
          top: '12px',
          left: '12px',
          background: 'rgba(18, 18, 22, 0.72)',
          color: 'rgba(255, 255, 255, 0.92)',
          padding: '5px 8px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: 0,
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none',
          zIndex: 10001
        }}>
          {`STEP ${(currentStep.index ?? 0) + 1}/${currentStep.total ?? '?'}  X ${formatCoordinate(currentStep.x)}  Y ${formatCoordinate(currentStep.y)}`}
        </div>
      )}

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
          {loadingMessage}
        </div>
      )}

      {errorMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(180, 32, 42, 0.88)',
          color: '#fff',
          padding: '10px 16px',
          borderRadius: '16px',
          fontSize: '13px',
          fontWeight: 600,
          maxWidth: 'min(620px, calc(100vw - 32px))',
          textAlign: 'center',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none',
          zIndex: 10000
        }}>
          {errorMessage}
        </div>
      )}

      {isReplayRunning && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20, 20, 24, 0.76)',
          color: '#fff',
          padding: '9px 14px',
          borderRadius: '16px',
          fontSize: '13px',
          fontWeight: 600,
          maxWidth: 'min(520px, calc(100vw - 32px))',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none',
          zIndex: 9999
        }}>
          {statusText}
        </div>
      )}

      {isVisible && !isReplayRunning && (
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
            <InputBar onSubmit={handleIntentSubmit} disabled={isLoading} />
            <SessionPanel
              intent={intent}
              nodeId={lastNodeId}
              isBusy={isLoading}
              onWalkthrough={() => replaySavedWorkflow('walkthrough')}
              onAutoExecute={() => replaySavedWorkflow('auto')}
            />
          </div>
        </>
      )}
    </div>
    </>
  )
}
