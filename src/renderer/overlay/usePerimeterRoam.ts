import { useState, useEffect, useRef, useCallback } from 'react'

type Edge = 'top' | 'right' | 'bottom' | 'left'

interface Point {
  x: number
  y: number
}

const MIN_MARGIN = 12
const MAX_MARGIN = 32
const MIN_TRAVEL_MS = 4000
const MAX_TRAVEL_MS = 9000
const MIN_PAUSE_MS = 1000
const MAX_PAUSE_MS = 3000

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomEdge(): Edge {
  const edges: Edge[] = ['top', 'right', 'bottom', 'left']
  return edges[Math.floor(Math.random() * edges.length)]
}

function pickTargetOnEdge(
  edge: Edge,
  width: number,
  height: number,
  margin: number,
  ghostSize: number,
): Point {
  // Keep the ghost fully visible by accounting for its size
  const maxX = Math.max(margin, width - margin - ghostSize)
  const maxY = Math.max(margin, height - margin - ghostSize)
  const minX = margin
  const minY = margin

  switch (edge) {
    case 'top':
      return { x: randomRange(minX, maxX), y: margin }
    case 'right':
      return { x: Math.max(margin, width - margin - ghostSize), y: randomRange(minY, maxY) }
    case 'bottom':
      return { x: randomRange(minX, maxX), y: Math.max(margin, height - margin - ghostSize) }
    case 'left':
      return { x: margin, y: randomRange(minY, maxY) }
  }
}

function clampPoint(point: Point, width: number, height: number, ghostSize: number): Point {
  const maxX = Math.max(MIN_MARGIN, width - MIN_MARGIN - ghostSize)
  const maxY = Math.max(MIN_MARGIN, height - MIN_MARGIN - ghostSize)
  return {
    x: Math.min(maxX, Math.max(MIN_MARGIN, point.x)),
    y: Math.min(maxY, Math.max(MIN_MARGIN, point.y)),
  }
}

export function usePerimeterRoam(enabled: boolean, ghostSize = 48) {
  const [position, setPosition] = useState<Point>({ x: MIN_MARGIN, y: MIN_MARGIN })
  const [transitionDuration, setTransitionDuration] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const reducedMotionRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  const getViewportSize = useCallback((): { width: number; height: number } => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }), [])

  const moveToNextTarget = useCallback(() => {
    if (!isMountedRef.current) return
    const { width, height } = getViewportSize()
    const margin = Math.round(randomRange(MIN_MARGIN, MAX_MARGIN))
    const edge = randomEdge()
    const target = pickTargetOnEdge(edge, width, height, margin, ghostSize)
    const clamped = clampPoint(target, width, height, ghostSize)

    const travelMs = Math.round(randomRange(MIN_TRAVEL_MS, MAX_TRAVEL_MS))
    const pauseMs = Math.round(randomRange(MIN_PAUSE_MS, MAX_PAUSE_MS))

    setTransitionDuration(travelMs)
    setPosition(clamped)
    setIsPaused(false)

    if (reducedMotionRef.current) {
      // In reduced motion, just park at the edge with no transition
      setTransitionDuration(0)
      return
    }

    // Schedule pause after travel completes
    timerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return
      setIsPaused(true)
      // Schedule next move after pause
      timerRef.current = window.setTimeout(() => {
        moveToNextTarget()
      }, pauseMs)
    }, travelMs)
  }, [getViewportSize, ghostSize])

  useEffect(() => {
    isMountedRef.current = true
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mql.matches

    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      if (e.matches) {
        // Clear timers and park
        if (timerRef.current) {
          window.clearTimeout(timerRef.current)
          timerRef.current = null
        }
        setTransitionDuration(0)
        setIsPaused(true)
      } else if (enabled) {
        moveToNextTarget()
      }
    }

    mql.addEventListener('change', onChange)

    if (enabled && !reducedMotionRef.current) {
      // Start immediately from a random edge
      moveToNextTarget()
    } else if (enabled && reducedMotionRef.current) {
      // Park at a random edge with no movement
      const { width, height } = getViewportSize()
      const edge = randomEdge()
      const target = pickTargetOnEdge(edge, width, height, MIN_MARGIN, ghostSize)
      setTransitionDuration(0)
      setPosition(clampPoint(target, width, height, ghostSize))
      setIsPaused(true)
    }

    return () => {
      isMountedRef.current = false
      mql.removeEventListener('change', onChange)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, moveToNextTarget, getViewportSize, ghostSize])

  // Handle resize: clamp current position to new viewport
  useEffect(() => {
    if (!enabled) return

    const onResize = () => {
      const { width, height } = getViewportSize()
      setPosition((prev) => clampPoint(prev, width, height, ghostSize))
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled, getViewportSize, ghostSize])

  return {
    x: position.x,
    y: position.y,
    transitionDuration,
    isPaused,
  }
}
