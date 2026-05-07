import { safeLog } from '../logger'
import { clickRealMouse, executeRealMouseSteps } from '../cursor'
import type { Step } from './types'
import {
  createReplayController,
  isActive,
  releaseReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForReplay,
  sleep
} from './replayController'

const DEFAULT_WAIT_STEP_MS = 800

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS
}

function stepTitle(step: Step): string {
  return step.instruction || step.targetLabel || step.id || 'Untitled step'
}

export async function replayAutoExecute(steps: Step[]): Promise<void> {
  const controller = createReplayController()
  setOverlayForReplay()
  safeLog('[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION', { totalSteps: steps.length })

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break
      const step = steps[index]
      safeLog('[AUTO_REAL_MOUSE] real mouse step', {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y
      })

      if (step.action === 'click') {
        if (!(await sleep(step.delayMs || 0, controller))) break
        safeLog('[AUTO_REAL_MOUSE] REAL OS move/click', { index, x: step.x, y: step.y })
        await clickRealMouse(step.x, step.y)
      } else if (step.action === 'wait') {
        const waitMs = stepWaitMs(step)
        safeLog('[AUTO_REAL_MOUSE] wait before next real OS action', { index, waitMs })
        if (!(await sleep(waitMs, controller))) break
      } else {
        if (!(await sleep(step.delayMs || 0, controller))) break
        safeLog('[AUTO_REAL_MOUSE] REAL OS action replay', {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText)
        })
        await executeRealMouseSteps([{ ...step, delayMs: 0 }])
      }
      safeLog('[AUTO_REAL_MOUSE] real mouse step complete', { index, action: step.action })
      sendOverlay('replay:progress', { index, total: steps.length })
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay('replay:complete', {})
    }
    releaseReplayController(controller)
    restoreOverlayAfterReplay(controller)
    safeLog('[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED', { cancelled: controller.cancelled })
  }
}
