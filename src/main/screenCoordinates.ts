import { screen } from 'electron'
import type { Rectangle } from 'electron'
import { Point } from '@nut-tree-fork/nut-js'

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

export function getPrimaryDisplayMetrics() {
  const primary = screen.getPrimaryDisplay()

  return {
    id: primary.id,
    scaleFactor: primary.scaleFactor,
    bounds: rectSnapshot(primary.bounds),
    workArea: rectSnapshot(primary.workArea),
    size: {
      width: primary.size.width,
      height: primary.size.height
    }
  }
}

export async function toScreenPoint(x: number, y: number): Promise<Point> {
  const primary = screen.getPrimaryDisplay()
  const { width: logicalW, height: logicalH } = primary.size
  const scale = primary.scaleFactor

  const pixelX = Math.round((clampPercent(x) / 100) * logicalW * scale)
  const pixelY = Math.round((clampPercent(y) / 100) * logicalH * scale)

  return new Point(pixelX, pixelY)
}

export function screenPointToPercent(x: number, y: number): { x: number; y: number } {
  const primary = screen.getPrimaryDisplay()
  const { width: logicalW, height: logicalH } = primary.size
  const scale = primary.scaleFactor

  return {
    x: clampPercent((x / (logicalW * scale)) * 100),
    y: clampPercent((y / (logicalH * scale)) * 100)
  }
}

export function logicalPointToPercent(x: number, y: number): { x: number; y: number } {
  const primary = screen.getPrimaryDisplay()

  return {
    x: clampPercent(((x - primary.bounds.x) / primary.bounds.width) * 100),
    y: clampPercent(((y - primary.bounds.y) / primary.bounds.height) * 100)
  }
}
