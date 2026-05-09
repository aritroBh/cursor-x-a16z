import { useState, useEffect, useRef, useCallback, type RefObject } from 'react'

export type Edge = 'top' | 'right' | 'bottom' | 'left'

interface Point {
  x: number
  y: number
}

export interface UsePerimeterRoamOptions {
  ghostSize?: number
  minMargin?: number
  maxMargin?: number
  minTravelMs?: number
  maxTravelMs?: number
  minPauseMs?: number
  maxPauseMs?: number
  avoidBottomCenter?: boolean
}

const DEFAULTS = {
  ghostSize: 48,
  minMargin: 18,
  maxMargin: 32,
  minTravelMs: 4000,
  maxTravelMs: 9000,
  minPauseMs: 1000,
  maxPauseMs: 3000,
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomEdge(exclude?: Edge): Edge {
  const edges: Edge[] = ['top', 'right', 'bottom', 'left']
  const pool = exclude ? edges.filter((e) => e !== exclude) : edges
  return pool[Math.floor(Math.random() * pool.length)]
}

function getBounds(
  boundaryRefOrSelector?: RefObject<HTMLElement> | string,
): DOMRect {
  if (typeof boundaryRefOrSelector === 'string') {
    const el = document.querySelector(boundaryRefOrSelector)
    if (el) return el.getBoundingClientRect()
  } else if (boundaryRefOrSelector?.current) {
    return boundaryRefOrSelector.current.getBoundingClientRect()
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
    x: 0,
    y: 0,
    toJSON() { return this },
  } as DOMRect
}

function pickTargetOnEdge(
  edge: Edge,
  rect: DOMRect,
  margin: number,
  ghostSize: number,
  avoidBottomCenter: boolean,
): Point {
  const minX = rect.left + margin
  const minY = rect.top + margin
  const maxX = Math.max(minX, rect.right - margin - ghostSize)
  const maxY = Math.max(minY, rect.bottom - margin - ghostSize)

  switch (edge) {
    case 'top':
      return { x: randomRange(minX, maxX), y: minY }
    case 'right':
      return { x: maxX, y: randomRange(minY, maxY) }
    case 'bottom': {
      if (avoidBottomCenter && rect.width > 0) {
        const centerX = (rect.left + rect.right) / 2
        const safeW = rect.width * 0.35
        const leftMin = minX
        const leftMax = Math.max(leftMin, centerX - safeW)
        const rightMin = Math.min(maxX, centerX + safeW)
        const rightMax = maxX
        const side = Math.random() > 0.5 ? 'left' : 'right'
        const x =
          side === 'left'
            ? randomRange(leftMin, leftMax)
            : randomRange(rightMin, rightMax)
        return { x, y: maxY }
      }
      return { x: randomRange(minX, maxX), y: maxY }
    }
    case 'left':
      return { x: minX, y: randomRange(minY, maxY) }
  }
}

function clampPoint(
  point: Point,
  rect: DOMRect,
  ghostSize: number,
  margin: number,
): Point {
  const minX = rect.left + margin
  const minY = rect.top + margin
  const maxX = Math.max(minX, rect.right - margin - ghostSize)
  const maxY = Math.max(minY, rect.bottom - margin - ghostSize)
  return {
    x: Math.min(maxX, Math.max(minX, point.x)),
    y: Math.min(maxY, Math.max(minY, point.y)),
  }
}

export interface PerimeterRoamResult {
  x: number
  y: number
  edge: Edge
  isMoving: boolean
  isPaused: boolean
  transitionDuration: number
}

export function usePerimeterRoam(
  enabled: boolean,
  boundaryRefOrSelector?: RefObject<HTMLElement> | string,
  options?: UsePerimeterRoamOptions,
): PerimeterRoamResult {
  const {
    ghostSize = DEFAULTS.ghostSize,
    minMargin = DEFAULTS.minMargin,
    maxMargin = DEFAULTS.maxMargin,
    minTravelMs = DEFAULTS.minTravelMs,
    maxTravelMs = DEFAULTS.maxTravelMs,
    minPauseMs = DEFAULTS.minPauseMs,
    maxPauseMs = DEFAULTS.maxPauseMs,
    avoidBottomCenter = true,
  } = options || {}

  const [position, setPosition] = useState<Point>({ x: minMargin, y: minMargin })
  const [edge, setEdge] = useState<Edge>('top')
  const [transitionDuration, setTransitionDuration] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const reducedMotionRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  const currentEdgeRef = useRef<Edge>('top')

  const getBoundsCallback = useCallback(
    () => getBounds(boundaryRefOrSelector),
    [boundaryRefOrSelector],
  )

  const moveToNextTarget = useCallback(() => {
    if (!isMountedRef.current) return
    const rect = getBoundsCallback()
    const margin = Math.round(randomRange(minMargin, maxMargin))
    const newEdge = randomEdge(currentEdgeRef.current)
    currentEdgeRef.current = newEdge
    const target = pickTargetOnEdge(newEdge, rect, margin, ghostSize, avoidBottomCenter)
    const clamped = clampPoint(target, rect, ghostSize, margin)

    const travelMs = Math.round(randomRange(minTravelMs, maxTravelMs))
    const pauseMs = Math.round(randomRange(minPauseMs, maxPauseMs))

    setEdge(newEdge)
    setTransitionDuration(travelMs)
    setPosition(clamped)
    setIsPaused(false)

    if (reducedMotionRef.current) {
      setTransitionDuration(0)
      return
    }

    timerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return
      setIsPaused(true)
      timerRef.current = window.setTimeout(() => {
        moveToNextTarget()
      }, pauseMs)
    }, travelMs)
  }, [
    getBoundsCallback,
    ghostSize,
    minMargin,
    maxMargin,
    minTravelMs,
    maxTravelMs,
    minPauseMs,
    maxPauseMs,
    avoidBottomCenter,
  ])

  useEffect(() => {
    isMountedRef.current = true
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mql.matches

    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      if (e.matches) {
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
      moveToNextTarget()
    } else if (enabled && reducedMotionRef.current) {
      const rect = getBoundsCallback()
      const target = pickTargetOnEdge(randomEdge(), rect, minMargin, ghostSize, avoidBottomCenter)
      setTransitionDuration(0)
      setPosition(clampPoint(target, rect, ghostSize, minMargin))
      setEdge(currentEdgeRef.current)
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
  }, [
    enabled,
    moveToNextTarget,
    getBoundsCallback,
    ghostSize,
    minMargin,
    avoidBottomCenter,
  ])

  useEffect(() => {
    if (!enabled) return

    const onResize = () => {
      const rect = getBoundsCallback()
      setPosition((prev) => clampPoint(prev, rect, ghostSize, minMargin))
    }

    window.addEventListener('resize', onResize)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      const el =
        typeof boundaryRefOrSelector === 'string'
          ? document.querySelector(boundaryRefOrSelector)
          : boundaryRefOrSelector?.current || null
      if (el) {
        ro = new ResizeObserver(() => {
          const rect = getBoundsCallback()
          setPosition((prev) => clampPoint(prev, rect, ghostSize, minMargin))
        })
        ro.observe(el)
      }
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (ro) ro.disconnect()
    }
  }, [enabled, getBoundsCallback, ghostSize, minMargin, boundaryRefOrSelector])

  return {
    x: position.x,
    y: position.y,
    edge,
    isMoving: !isPaused,
    isPaused,
    transitionDuration,
  }
}
