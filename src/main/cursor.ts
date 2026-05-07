import { mouse, straightTo, Button, keyboard } from '@nut-tree-fork/nut-js'
import { Step } from './session/types'
import { toScreenPoint } from './screenCoordinates'

const DEFAULT_MOVE_DURATION_MS = 650

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

function cursorPermissionError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(
    `Specter could not control the macOS cursor. Grant Accessibility permission to this app in System Settings > Privacy & Security > Accessibility, then retry. Original error: ${detail}`
  )
}

export async function moveRealMouse(x: number, y: number, durationMs = DEFAULT_MOVE_DURATION_MS): Promise<void> {
  console.log('[AUTO_REAL_MOUSE] moveRealMouse invoked REAL OS cursor automation', { x, y, durationMs })
  try {
    const target = await toScreenPoint(x, y)
    console.log('[AUTO_REAL_MOUSE] physical target pixels', { x: target.x, y: target.y })

    const current = await mouse.getPosition()
    const distance = Math.max(1, Math.hypot(target.x - current.x, target.y - current.y))

    const previousSpeed = mouse.config.mouseSpeed
    const durationSeconds = Math.max(0.05, durationMs / 1000)
    mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds)

    try {
      await mouse.move(straightTo(target), easeInOutCubic)
      console.log('[AUTO_REAL_MOUSE] nut-js REAL OS move complete')
    } finally {
      mouse.config.mouseSpeed = previousSpeed
    }
  } catch (error) {
    console.error('[AUTO_REAL_MOUSE] nut-js REAL OS automation error:', error)
    throw cursorPermissionError(error)
  }
}

export async function clickRealMouse(x: number, y: number): Promise<void> {
  try {
    console.log('[AUTO_REAL_MOUSE] clickRealMouse invoked REAL OS cursor automation', { x, y })
    await moveRealMouse(x, y)
    await mouse.click(Button.LEFT)
    console.log('[AUTO_REAL_MOUSE] nut-js REAL OS click complete', { x, y })
  } catch (error) {
    throw cursorPermissionError(error)
  }
}

export async function executeRealMouseSteps(steps: Step[]): Promise<void> {
  console.log('[AUTO_REAL_MOUSE] executeRealMouseSteps invoked REAL OS automation', { totalSteps: steps.length })
  for (const [index, step] of steps.entries()) {
    console.log('[AUTO_REAL_MOUSE] executing real cursor step', {
      index,
      action: step.action,
      x: step.x,
      y: step.y
    })
    if (step.action !== 'wait' && step.delayMs) {
      await sleep(step.delayMs)
    }

    switch (step.action) {
      case 'click':
        await clickRealMouse(step.x, step.y)
        break
      case 'type':
        await moveRealMouse(step.x, step.y)
        if (step.typeText) {
          await keyboard.type(step.typeText)
        }
        break
      case 'scroll':
        await moveRealMouse(step.x, step.y)
        await mouse.scrollDown(3)
        break
      case 'wait':
        await sleep(step.waitForMs || step.delayMs || 500)
        break
    }
  }
}
