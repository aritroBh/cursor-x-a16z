import { screen } from 'electron'
import { mouse, straightTo, Button, keyboard, Point } from '@nut-tree-fork/nut-js'
import { Step } from './session/types'

const DEFAULT_MOVE_DURATION_MS = 650

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
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

async function toScreenPoint(x: number, y: number): Promise<Point> {
  const primary = screen.getPrimaryDisplay()
  const { width: logicalW, height: logicalH } = primary.size
  const scale = primary.scaleFactor

  const pixelX = Math.round((clampPercent(x) / 100) * logicalW * scale)
  const pixelY = Math.round((clampPercent(y) / 100) * logicalH * scale)

  return new Point(pixelX, pixelY)
}

export async function getPhysicalMousePosition(): Promise<{ x: number; y: number }> {
  try {
    const pos = await mouse.getPosition()
    return { x: pos.x, y: pos.y }
  } catch (error) {
    throw cursorPermissionError(error)
  }
}

export async function waitForMouseAtTarget(
  targetPercentX: number,
  targetPercentY: number,
  tolerancePx: number,
  timeoutMs: number
): Promise<'correct' | 'timeout'> {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY)
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const pos = await mouse.getPosition()
      const dx = pos.x - target.x
      const dy = pos.y - target.y

      if (Math.abs(dx) <= tolerancePx && Math.abs(dy) <= tolerancePx) {
        return 'correct'
      }
      await sleep(100)
    }
    return 'timeout'
  } catch (error) {
    throw cursorPermissionError(error)
  }
}

export async function ghostMove(x: number, y: number, durationMs = DEFAULT_MOVE_DURATION_MS): Promise<void> {
  console.log('[CURSOR] ghostMove called:', x, y, durationMs)
  try {
    const target = await toScreenPoint(x, y)
    console.log('[CURSOR] Physical pixels:', target.x, target.y)

    const current = await mouse.getPosition()
    const distance = Math.max(1, Math.hypot(target.x - current.x, target.y - current.y))

    const previousSpeed = mouse.config.mouseSpeed
    const durationSeconds = Math.max(0.05, durationMs / 1000)
    mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds)

    try {
      await mouse.move(straightTo(target), easeInOutCubic)
      console.log('[CURSOR] nut-js move complete')
    } finally {
      mouse.config.mouseSpeed = previousSpeed
    }
  } catch (error) {
    console.error('[CURSOR] nut-js error:', error)
    throw cursorPermissionError(error)
  }
}

export async function ghostClick(x: number, y: number): Promise<void> {
  try {
    await ghostMove(x, y)
    await mouse.click(Button.LEFT)
  } catch (error) {
    throw cursorPermissionError(error)
  }
}

export async function executeSteps(steps: Step[]): Promise<void> {
  for (const step of steps) {
    if (step.action !== 'wait' && step.delayMs) {
      await sleep(step.delayMs)
    }

    switch (step.action) {
      case 'click':
        await ghostClick(step.x, step.y)
        break
      case 'type':
        await ghostMove(step.x, step.y)
        if (step.typeText) {
          await keyboard.type(step.typeText)
        }
        break
      case 'scroll':
        await ghostMove(step.x, step.y)
        await mouse.scrollDown(3)
        break
      case 'wait':
        await sleep(step.delayMs || 500)
        break
    }
  }
}
