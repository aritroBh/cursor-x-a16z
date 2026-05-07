import { BrowserWindow, IpcMain } from 'electron'
import { getPhysicalMousePercent, waitForMouseAtTarget, waitForUserClickAtTarget } from '../userCursor'
import { loadGraph } from './storage'
import { Step } from './types'
import { replayAutoExecute } from './replayAuto'
import {
  createReplayController,
  isActive,
  releaseReplayController,
  ReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForKeyboardFallback,
  setOverlayForReplay,
  setReplayWindowProvider,
  sleep,
  stopReplay
} from './replayController'
import { assertWalkthroughReplaySafety } from './replaySafety'

const DEFAULT_STEP_TIMEOUT_MS = 12000
const DEFAULT_WAIT_STEP_MS = 800
const MAX_WALKTHROUGH_ATTEMPTS = 2
const TARGET_APPROACH_TOLERANCE_PX = 50
const TARGET_CLICK_TOLERANCE_PX = 60
const MANUAL_CONFIRM_TIMEOUT_MS = 30000

type TargetWaitResult = 'correct' | 'timeout' | 'cancelled'

interface GhostStart {
  x: number
  y: number
}

let pendingManualConfirm: (() => void) | null = null

function stepTitle(step: Step): string {
  return step.instruction || step.targetLabel || step.id || 'Untitled step'
}

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS
}

function fallbackGhostStart(step: Step, previousTarget: GhostStart | null): GhostStart {
  if (previousTarget) return previousTarget

  const offsetX = step.x > 58 ? -18 : 18
  const offsetY = step.y > 58 ? -12 : 12
  return {
    x: Math.min(96, Math.max(4, step.x + offsetX)),
    y: Math.min(96, Math.max(4, step.y + offsetY))
  }
}

async function ghostStartForStep(step: Step, previousTarget: GhostStart | null): Promise<GhostStart> {
  try {
    return await getPhysicalMousePercent()
  } catch (error) {
    console.warn('[GHOST] could not read physical cursor for ghost start; using fallback', error)
    return fallbackGhostStart(step, previousTarget)
  }
}

function waitForUserNearTarget(
  step: Step,
  controller: ReplayController,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve('cancelled')

  return new Promise((resolve) => {
    let settled = false
    const abort = new AbortController()
    const timeout = setTimeout(() => settle(controller.cancelled ? 'cancelled' : 'timeout'), timeoutMs)
    const settle = (result: TargetWaitResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      abort.abort()
      controller.cancelHandlers.delete(cancel)
      resolve(result)
    }
    const cancel = () => settle('cancelled')
    controller.cancelHandlers.add(cancel)

    waitForMouseAtTarget(step.x, step.y, TARGET_APPROACH_TOLERANCE_PX, timeoutMs, abort.signal)
      .then((result) => {
        settle(result)
      })
      .catch((error) => {
        console.error('[USER_CURSOR] waitForMouseAtTarget failed', error)
        settle('timeout')
      })
  })
}

function waitForUserClickOnTarget(
  step: Step,
  controller: ReplayController,
  timeoutMs = DEFAULT_STEP_TIMEOUT_MS
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve('cancelled')

  return new Promise((resolve) => {
    let settled = false
    const abort = new AbortController()
    const timeout = setTimeout(() => settle(controller.cancelled ? 'cancelled' : 'timeout'), timeoutMs)
    const settle = (result: TargetWaitResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      abort.abort()
      controller.cancelHandlers.delete(cancel)
      resolve(result)
    }
    const cancel = () => settle('cancelled')
    controller.cancelHandlers.add(cancel)

    waitForUserClickAtTarget(step.x, step.y, TARGET_CLICK_TOLERANCE_PX, timeoutMs, abort.signal)
      .then((result) => {
        settle(result)
      })
      .catch((error) => {
        console.error('[CLICK_DETECT] waitForUserClickAtTarget failed', error)
        settle('timeout')
      })
  })
}

function waitForManualStepConfirmation(
  step: Step,
  index: number,
  total: number,
  controller: ReplayController,
  timeoutMs = MANUAL_CONFIRM_TIMEOUT_MS
): Promise<TargetWaitResult> {
  if (controller.cancelled) return Promise.resolve('cancelled')

  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => settle(controller.cancelled ? 'cancelled' : 'timeout'), timeoutMs)

    const settle = (result: TargetWaitResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (pendingManualConfirm === confirm) pendingManualConfirm = null
      controller.cancelHandlers.delete(cancel)
      sendOverlay('replay:confirm-cleared', {})
      setOverlayForReplay()
      resolve(result)
    }

    const confirm = () => settle('correct')
    const cancel = () => settle('cancelled')
    pendingManualConfirm = confirm
    controller.cancelHandlers.add(cancel)

    console.warn('[CLICK_DETECT] click fallback armed; waiting for Space/Enter confirmation', {
      index,
      x: step.x,
      y: step.y,
      timeoutMs
    })

    setOverlayForKeyboardFallback()
    sendOverlay('replay:confirm-needed', {
      message: 'Click not detected. Press Space to confirm this step.',
      step,
      index,
      total,
      timeoutMs
    })
  })
}

export function confirmReplayStep(): boolean {
  if (!pendingManualConfirm) {
    console.warn('[WALKTHROUGH] manual step confirmation ignored; no confirmation is pending')
    return false
  }

  console.log('[WALKTHROUGH] manual step confirmation received')
  pendingManualConfirm()
  return true
}

function stepsForNode(nodeId: string | undefined, appName: string): Step[] {
  const graph = loadGraph(appName)
  const sessions = nodeId
    ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId))
    : graph.sessions.filter((s) => s.steps.length > 0)

  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null
  return latest?.steps || []
}

function logWalkthroughStep(step: Step, index: number, total: number, attempt: number): void {
  console.log('[WALKTHROUGH] step', {
    index,
    displayIndex: index + 1,
    total,
    attempt,
    title: stepTitle(step),
    action: step.action,
    x: step.x,
    y: step.y
  })
}

function emitGhostStep(step: Step, index: number, total: number, attempt: number, reason: TargetWaitResult, ghostStart: GhostStart): void {
  const channel = attempt === 0 ? 'replay:step' : 'replay:retry'
  const ghostLoops = step.action !== 'wait'

  sendOverlay(channel, {
    step,
    index,
    total,
    reason,
    attempt,
    ghost: {
      startX: ghostStart.x,
      startY: ghostStart.y,
      loop: ghostLoops,
      timeoutMs: DEFAULT_STEP_TIMEOUT_MS
    }
  })

  console.log('[GHOST] visual step emitted', {
    channel,
    index,
    attempt,
    action: step.action,
    x: step.x,
    y: step.y,
    startX: ghostStart.x,
    startY: ghostStart.y
  })

  if (ghostLoops) {
    console.log('[GHOST] looping started', { index, attempt, timeoutMs: DEFAULT_STEP_TIMEOUT_MS })
  }
}

function parkGhostAtEndpoint(step: Step, index: number, total: number, attempt: number): void {
  console.log('[GHOST] parked at endpoint', { index, action: step.action, x: step.x, y: step.y })
  sendOverlay('replay:target-reached', {
    step,
    index,
    total,
    attempt
  })
}

export { stopReplay }

export async function replayWalkthrough(steps: Step[], onStep: (step: Step, index: number) => void): Promise<void> {
  assertWalkthroughReplaySafety()

  const controller = createReplayController()
  setOverlayForReplay()
  let previousGhostTarget: GhostStart | null = null
  console.log('[WALKTHROUGH] start', { totalSteps: steps.length })

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break
      const step = steps[index]
      let result: TargetWaitResult = 'timeout'
      let attempts = 0

      while (result !== 'correct' && isActive(controller)) {
        logWalkthroughStep(step, index, steps.length, attempts)
        const ghostStart = await ghostStartForStep(step, previousGhostTarget)
        emitGhostStep(step, index, steps.length, attempts, result, ghostStart)

        if (attempts === 0) onStep(step, index)

        if (step.action === 'wait') {
          const waitMs = stepWaitMs(step)
          console.log('[WALKTHROUGH] wait step sleeping', { index, waitMs })
          result = (await sleep(waitMs, controller)) ? 'correct' : 'cancelled'
        } else if (step.action === 'click') {
          console.log('[USER_CURSOR] waiting for real cursor to enter tolerance', {
            index,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          })
          result = await waitForUserNearTarget(step, controller)

          if (result === 'correct') {
            console.log('[USER_CURSOR] real cursor entered tolerance', { index, x: step.x, y: step.y })
            previousGhostTarget = { x: step.x, y: step.y }
            parkGhostAtEndpoint(step, index, steps.length, attempts)

            console.log('[CLICK_DETECT] waiting for actual user click', {
              index,
              x: step.x,
              y: step.y,
              tolerancePx: TARGET_CLICK_TOLERANCE_PX
            })
            result = await waitForUserClickOnTarget(step, controller)
            if (result === 'correct') {
              console.log('[CLICK_DETECT] click detected', { index, x: step.x, y: step.y })
            } else if (result === 'timeout' && isActive(controller)) {
              result = await waitForManualStepConfirmation(step, index, steps.length, controller)
              if (result === 'correct') {
                console.log('[CLICK_DETECT] step advanced by Space/Enter fallback', { index, x: step.x, y: step.y })
              }
            }
          }
        } else {
          console.log('[USER_CURSOR] waiting for real cursor to enter tolerance', {
            index,
            action: step.action,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          })
          result = await waitForUserNearTarget(step, controller)

          if (result === 'correct') {
            console.log('[USER_CURSOR] real cursor entered tolerance', { index, action: step.action, x: step.x, y: step.y })
            previousGhostTarget = { x: step.x, y: step.y }
            parkGhostAtEndpoint(step, index, steps.length, attempts)
          }
        }

        if (result === 'correct') {
          console.log('[WALKTHROUGH] step complete', { index, action: step.action, title: stepTitle(step) })
        } else if (result === 'timeout') {
          attempts++
          console.warn('[WALKTHROUGH] step timed out', {
            index,
            action: step.action,
            title: stepTitle(step),
            attempt: attempts,
            maxAttempts: MAX_WALKTHROUGH_ATTEMPTS
          })
          if (attempts >= MAX_WALKTHROUGH_ATTEMPTS) {
            console.warn('[WALKTHROUGH] step skipped after timeout', { index, action: step.action, title: stepTitle(step) })
            break
          }
        } else if (result === 'cancelled') {
          console.warn('[WALKTHROUGH] step cancelled', { index, action: step.action, title: stepTitle(step) })
          break
        }
      }
    }

    if (!controller.cancelled) {
      sendOverlay('replay:complete', {})
    }
  } finally {
    releaseReplayController(controller)
    restoreOverlayAfterReplay(controller)
    console.log('[WALKTHROUGH] finished', { cancelled: controller.cancelled })
  }
}

export function registerReplayIpc(ipcMain: IpcMain, windowProvider: () => BrowserWindow | null, appName = 'Specter'): void {
  setReplayWindowProvider(windowProvider)

  ipcMain.handle('replay:walkthrough', async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName)
    await replayWalkthrough(steps, () => {})
  })

  ipcMain.handle('replay:auto', async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName)
    await replayAutoExecute(steps)
  })

  ipcMain.handle('replay:stop', async () => {
    stopReplay()
  })

  ipcMain.handle('replay:confirmStep', async () => confirmReplayStep())
}
