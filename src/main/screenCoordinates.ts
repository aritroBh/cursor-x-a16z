import { screen } from 'electron'
import type { Display, Rectangle } from 'electron'
import { Point } from '@nut-tree-fork/nut-js'
import { safeLog } from './logger'

let activeCoordinateDisplayId: number | null = null

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function rectSnapshot(rect: Rectangle): Rectangle {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }
}

function getDisplayById(displayId: number | null): Display | null {
  if (displayId === null) return null
  return screen.getAllDisplays().find((display) => display.id === displayId) || null
}

function physicalBoundsForDisplay(display: Display): Rectangle {
  return {
    x: Math.round(display.bounds.x * display.scaleFactor),
    y: Math.round(display.bounds.y * display.scaleFactor),
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor)
  }
}

function displayContainsPhysicalPoint(display: Display, x: number, y: number): boolean {
  const bounds = physicalBoundsForDisplay(display)
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

function displayForPhysicalPoint(x: number, y: number): Display {
  return screen.getAllDisplays().find((display) => displayContainsPhysicalPoint(display, x, y)) || getActiveCoordinateDisplay()
}

export function setActiveCoordinateDisplay(displayId: number): void {
  activeCoordinateDisplayId = displayId
  safeLog('[WINDOW_ROUTING] active coordinate display set', { displayId })
}

export function getActiveCoordinateDisplay(): Display {
  const pinned = getDisplayById(activeCoordinateDisplayId)
  if (pinned) return pinned

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay()
}

export function getActiveCoordinateDisplayId(): number {
  return getActiveCoordinateDisplay().id
}

export function getPrimaryDisplayMetrics() {
  const primary = screen.getPrimaryDisplay()
  const active = getActiveCoordinateDisplay()

  const metrics = {
    id: primary.id,
    scaleFactor: primary.scaleFactor,
    bounds: rectSnapshot(primary.bounds),
    workArea: rectSnapshot(primary.workArea),
    activeDisplay: {
      id: active.id,
      scaleFactor: active.scaleFactor,
      bounds: rectSnapshot(active.bounds),
      workArea: rectSnapshot(active.workArea)
    },
    size: {
      width: primary.size.width,
      height: primary.size.height
    }
  }

  safeLog('[COORD_CALIBRATION] Primary display metrics retrieved', metrics)
  return metrics
}

export async function toScreenPoint(x: number, y: number): Promise<Point> {
  const display = getActiveCoordinateDisplay()
  const scale = display.scaleFactor
  const logicalX = display.bounds.x + (clampPercent(x) / 100) * display.bounds.width
  const logicalY = display.bounds.y + (clampPercent(y) / 100) * display.bounds.height

  const pixelX = Math.round(logicalX * scale)
  const pixelY = Math.round(logicalY * scale)

  safeLog('[COORD_CALIBRATION] Mapping percent to screen point', {
    input: { x, y },
    display: {
      id: display.id,
      bounds: rectSnapshot(display.bounds),
      scale
    },
    output: { pixelX, pixelY }
  })

  return new Point(pixelX, pixelY)
}

export function screenPointToPercent(x: number, y: number): { x: number; y: number } {
  const display = displayForPhysicalPoint(x, y)
  const bounds = physicalBoundsForDisplay(display)

  return {
    x: clampPercent(((x - bounds.x) / bounds.width) * 100),
    y: clampPercent(((y - bounds.y) / bounds.height) * 100)
  }
}

export function logicalPointToPercent(x: number, y: number): { x: number; y: number } {
  const display = getDisplayById(activeCoordinateDisplayId) || screen.getDisplayNearestPoint({ x, y })

  return {
    x: clampPercent(((x - display.bounds.x) / display.bounds.width) * 100),
    y: clampPercent(((y - display.bounds.y) / display.bounds.height) * 100)
  }
}
