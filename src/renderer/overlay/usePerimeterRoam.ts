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
  } = options || {}

  const [position, setPosition] = useState<Point>({ x: minMargin, y: minMargin })
  const [edge, setEdge] = useState<Edge>('top')
  const [isPaused, setIsPaused] = useState(false)
  
  const stateRef = useRef({
    offset: 0,
    direction: 1 as 1 | -1,
    speed: 50,
    isPaused: false,
    lastTime: performance.now(),
    rect: null as DOMRect | null
  })

  const reducedMotionRef = useRef(false)
  const isMountedRef = useRef(true)

  const getBoundsCallback = useCallback(
    () => getBounds(boundaryRefOrSelector),
    [boundaryRefOrSelector],
  )

  useEffect(() => {
    isMountedRef.current = true
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = mql.matches

    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }

    mql.addEventListener('change', onChange)

    return () => {
      isMountedRef.current = false
      mql.removeEventListener('change', onChange)
    }
  }, [])

  // Action loop (pick random behaviors: pause, reverse, keep moving)
  useEffect(() => {
    if (!enabled || reducedMotionRef.current) return
    let timeoutId: number
    
    const pickNextAction = () => {
      if (!isMountedRef.current) return
      
      const st = stateRef.current
      
      if (st.isPaused) {
        // We were paused, time to move
        st.isPaused = false
        setIsPaused(false)
        
        // 25% chance to reverse direction
        if (Math.random() < 0.25) {
          st.direction = (st.direction * -1) as 1 | -1
        }
        
        // Pick new speed (pixels per sec)
        st.speed = 30 + Math.random() * 50
        
        // Move for 6-20 seconds
        const moveTime = 6000 + Math.random() * 14000
        timeoutId = window.setTimeout(pickNextAction, moveTime)
      } else {
        // We were moving, time to pause
        st.isPaused = true
        setIsPaused(true)
        
        // Pause for 0.8 to 2.5 seconds
        const pauseTime = 800 + Math.random() * 1700
        timeoutId = window.setTimeout(pickNextAction, pauseTime)
      }
    }
    
    // Start by moving
    stateRef.current.isPaused = false
    setIsPaused(false)
    timeoutId = window.setTimeout(pickNextAction, 5000)
    
    return () => window.clearTimeout(timeoutId)
  }, [enabled])

  // Boundary change detection
  useEffect(() => {
    if (!enabled) return

    const updateRect = () => {
      stateRef.current.rect = getBoundsCallback()
    }

    updateRect()
    window.addEventListener('resize', updateRect)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      const el =
        typeof boundaryRefOrSelector === 'string'
          ? document.querySelector(boundaryRefOrSelector)
          : boundaryRefOrSelector?.current || null
      if (el) {
        ro = new ResizeObserver(updateRect)
        ro.observe(el)
      }
    }

    return () => {
      window.removeEventListener('resize', updateRect)
      if (ro) ro.disconnect()
    }
  }, [enabled, getBoundsCallback, boundaryRefOrSelector])

  // Animation loop
  useEffect(() => {
    if (!enabled) return

    let animationFrameId: number

    const tick = (now: number) => {
      if (!isMountedRef.current) return

      const st = stateRef.current
      const dt = (now - st.lastTime) / 1000 // seconds
      st.lastTime = now

      if (reducedMotionRef.current) {
        st.isPaused = true
        setIsPaused(true)
        animationFrameId = requestAnimationFrame(tick)
        return
      }

      if (!st.isPaused && st.rect) {
        const rect = st.rect
        const margin = minMargin 
        
        const left = rect.left + margin
        const top = rect.top + margin
        const right = Math.max(left, rect.right - margin - ghostSize)
        const bottom = Math.max(top, rect.bottom - margin - ghostSize)

        const topLen = Math.max(0, right - left)
        const rightLen = Math.max(0, bottom - top)
        const bottomLen = Math.max(0, right - left)
        const leftLen = Math.max(0, bottom - top)

        const totalLen = topLen + rightLen + bottomLen + leftLen

        if (totalLen > 0) {
          st.offset = (st.offset + st.direction * st.speed * dt) % totalLen
          if (st.offset < 0) {
            st.offset += totalLen
          }

          let x = 0, y = 0
          let currentEdge: Edge = 'top'

          let remaining = st.offset

          if (remaining < topLen) {
            x = left + remaining
            y = top
            currentEdge = 'top'
          } else {
            remaining -= topLen
            if (remaining < rightLen) {
              x = right
              y = top + remaining
              currentEdge = 'right'
            } else {
              remaining -= rightLen
              if (remaining < bottomLen) {
                x = right - remaining
                y = bottom
                currentEdge = 'bottom'
              } else {
                remaining -= bottomLen
                x = left
                y = bottom - remaining
                currentEdge = 'left'
              }
            }
          }

          setPosition((prev) => {
            // Avoid triggering re-renders if position hasn't changed enough to matter
            if (Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5) {
              return prev
            }
            return { x, y }
          })
          setEdge(currentEdge)
        }
      }

      animationFrameId = requestAnimationFrame(tick)
    }

    stateRef.current.lastTime = performance.now()
    animationFrameId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [enabled, ghostSize, minMargin])

  return {
    x: position.x,
    y: position.y,
    edge,
    isMoving: !isPaused,
    isPaused,
    transitionDuration: 0, // Enforce 0 for JS continuous animation
  }
}
