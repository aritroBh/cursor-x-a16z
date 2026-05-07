import { screen } from 'electron'
import { Point } from '@nut-tree-fork/nut-js'

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export async function toScreenPoint(x: number, y: number): Promise<Point> {
  const primary = screen.getPrimaryDisplay()
  const { width: logicalW, height: logicalH } = primary.size
  const scale = primary.scaleFactor

  const pixelX = Math.round((clampPercent(x) / 100) * logicalW * scale)
  const pixelY = Math.round((clampPercent(y) / 100) * logicalH * scale)

  return new Point(pixelX, pixelY)
}
