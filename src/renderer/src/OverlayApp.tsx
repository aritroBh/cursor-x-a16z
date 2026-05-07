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
const SHOW_CALIBRATION_DEBUG = import.meta.env.DEV

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
  const [manualConfirmMessage, setManualConfirmMessage] = useState('')
  const [calibrationMessage, setCalibrationMessage] = useState('')

  // Overlay visibility + replay lifecycle events
  useEffect(() => {
    const offToggle = api.onOverlayToggle(() => {
      setIsVisible((prev) => !prev)
    })

    const offComplete = api.onReplayComplete(() => {
      setCurrentStep(null)
      setReplayState('idle')
      setReplayMode(null)
      setManualConfirmMessage('')
    })

    const offStopped = api.onReplayStopped(() => {
      setCurrentStep(null)
      setReplayState('idle')
      setReplayMode(null)
      setManualConfirmMessage('')
    })

    const offConfirmNeeded = api.onReplayConfirmNeeded((data: any) => {
      setManualConfirmMessage(data?.message || 'Click not detected. Press Space to confirm this step.')
      setIsLoading(false)
    })

    const offConfirmCleared = api.onReplayConfirmCleared(() => {
      setManualConfirmMessage('')
    })

    const offScreenDenied = api.onScreenPermissionDenied(() => {
      setErrorMessage('Screen Recording permission is missing. Grant it in macOS Privacy settings, then retry.')
      setIsLoading(false)
    })

    return () => {
      offToggle()
      offComplete()
      offStopped()
      offConfirmNeeded()
      offConfirmCleared()
      offScreenDenied()
    }
  }, [])

  useEffect(() => {
    if (!manualConfirmMessage) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      void api.confirmReplayStep().catch((error: unknown) => {
        console.error('[Overlay] Replay confirmation failed:', error)
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [manualConfirmMessage])

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
    if (kind === 'auto' && !window.confirm('Specter will control your real mouse. Continue?')) return

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

  const prepareControlledDemo = async () => {
    setErrorMessage('')
    setCalibrationMessage('')
    setIsLoading(true)
    setLoadingMessage('Preparing controlled demo...')

    try {
      const workflow = await api.prepareControlledDemo()
      setIntent(workflow.intent || 'Controlled Specter demo')
      setLastNodeId(workflow.nodeId)
      setReplayState('idle')
      setReplayMode(null)
      setCurrentStep(null)
    } catch (error) {
      console.error('[Overlay] Demo workflow failed:', error)
      setErrorMessage(messageFromError(error))
    } finally {
      setIsLoading(false)
    }
  }

  const runCoordinateCalibration = async () => {
    setErrorMessage('')
    try {
      const diagnostics = await api.getCursorCalibration()
      const percent = diagnostics?.computedPercent || {}
      const center = diagnostics?.toScreenPoint50_50 || {}
      const scale = diagnostics?.primaryDisplay?.scaleFactor
      setCalibrationMessage(
        `Mouse ${formatCoordinate(percent.x)}, ${formatCoordinate(percent.y)} percent. Center maps to ${center.x ?? '?'}, ${center.y ?? '?'}. Scale ${scale ?? '?'}.`
      )
    } catch (error) {
      console.error('[Overlay] Coordinate diagnostics failed:', error)
      setErrorMessage(messageFromError(error))
    }
  }

  const moveCursorToScreenCenter = async () => {
    if (!window.confirm('Move your real mouse to the screen center?')) return

    setErrorMessage('')
    try {
      await api.moveCursorToScreenCenter()
      setCalibrationMessage('Center move requested. Verify the cursor landed at the visual center.')
    } catch (error) {
      console.error('[Overlay] Center move failed:', error)
      setErrorMessage(messageFromError(error))
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

      {manualConfirmMessage && (
        <div style={{
          position: 'fixed',
          bottom: '72px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 84, 150, 0.9)',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: '14px',
          fontSize: '13px',
          fontWeight: 700,
          maxWidth: 'min(520px, calc(100vw - 32px))',
          textAlign: 'center',
          boxShadow: '0 10px 28px rgba(0,0,0,0.24)',
          backdropFilter: 'blur(10px)',
          pointerEvents: 'none',
          zIndex: 10000
        }}>
          {manualConfirmMessage}
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
            <button
              disabled={isLoading}
              onClick={prepareControlledDemo}
              style={{
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '12px',
                padding: '10px 14px',
                color: 'white',
                background: 'rgba(255,255,255,0.12)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isLoading ? 'default' : 'pointer',
                opacity: isLoading ? 0.55 : 1
              }}
            >
              Use controlled demo
            </button>
            {SHOW_CALIBRATION_DEBUG && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '100%',
                background: 'rgba(12, 14, 18, 0.72)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '10px'
              }}>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <button
                    disabled={isLoading}
                    onClick={runCoordinateCalibration}
                    style={{
                      flex: 1,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      padding: '9px 10px',
                      color: 'white',
                      background: 'rgba(10,132,255,0.26)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isLoading ? 'default' : 'pointer',
                      opacity: isLoading ? 0.55 : 1
                    }}
                  >
                    Log calibration
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={moveCursorToScreenCenter}
                    style={{
                      flex: 1,
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      padding: '9px 10px',
                      color: 'white',
                      background: 'rgba(48,209,88,0.22)',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: isLoading ? 'default' : 'pointer',
                      opacity: isLoading ? 0.55 : 1
                    }}
                  >
                    Move center
                  </button>
                </div>
                {calibrationMessage && (
                  <div style={{
                    color: 'rgba(255,255,255,0.76)',
                    fontSize: '11px',
                    lineHeight: 1.35
                  }}>
                    {calibrationMessage}
                  </div>
                )}
              </div>
            )}
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
