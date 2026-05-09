import React from 'react'
import type { BehavioralState, SpecMood } from '../../main/session/types'
import { usePerimeterRoam } from './usePerimeterRoam'

interface SpecBuddyProps {
  mood: SpecMood
  state?: BehavioralState
  enabled?: boolean
  checkpointLabel?: string
  compact?: boolean
  pitchMode?: boolean
}

function labelForMood(mood: SpecMood, state?: BehavioralState): string {
  if (mood === 'flow') return `flow ${Math.round((state?.flowScore ?? 0.82) * 100)}%`
  if (mood === 'thinking') return 'thinking...'
  if (mood === 'stuck') return 'stuck on this'
  if (mood === 'celebrating') return 'checkpoint glow'
  if (mood === 'mirroring') return 'mirror mode'
  if (mood === 'judging') return 'judging your click'
  return state ? `confidence ${Math.round(state.decisionConfidence * 100)}%` : 'measuring'
}

function resolveAnimationClass(mood: SpecMood, isMoving: boolean): string {
  if (isMoving) return 'spec-buddy--moving'
  if (mood === 'thinking') return 'spec-buddy--thinking'
  if (mood === 'stuck') return 'spec-buddy--stuck'
  if (mood === 'celebrating') return 'spec-buddy--celebrating'
  if (mood === 'flow') return 'spec-buddy--flow'
  if (mood === 'mirroring') return 'spec-buddy--mirroring'
  if (mood === 'judging') return 'spec-buddy--judging'
  return 'spec-buddy--idle'
}

function renderEyes(mood: SpecMood) {
  if (mood === 'thinking') {
    return (
      <>
        <path className="spec-buddy__brow" d="M22 26c4-3 8-3 12-1" />
        <circle className="spec-buddy__eye" cx="27" cy="33" r="3.2" />
        <circle className="spec-buddy__eye" cx="45" cy="31" r="3.2" />
        <circle className="spec-buddy__pupil" cx="26" cy="33.5" r="1.2" />
        <circle className="spec-buddy__pupil" cx="44" cy="31.5" r="1.2" />
      </>
    )
  }

  if (mood === 'stuck') {
    return (
      <>
        <path className="spec-buddy__eye-line" d="M23 32c3-2 7-2 10 0" />
        <path className="spec-buddy__eye-line" d="M40 32c3-2 7-2 10 0" />
        <path className="spec-buddy__mouth worried" d="M33 42c3-3 7-3 10 0" />
      </>
    )
  }

  if (mood === 'flow') {
    return (
      <>
        <circle className="spec-buddy__eye wide" cx="27" cy="33" r="4" />
        <circle className="spec-buddy__eye wide" cx="45" cy="33" r="4" />
        <path className="spec-buddy__mouth happy" d="M31 43c3 4 10 4 13 0" />
      </>
    )
  }

  if (mood === 'celebrating') {
    return (
      <>
        <path className="spec-buddy__star-eye" d="M27 27l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z" />
        <path className="spec-buddy__star-eye" d="M46 27l1.6 3.8 4.2.3-3.1 2.7 1 4-3.7-2.1-3.7 2.1 1-4-3.1-2.7 4.2-.3z" />
        <path className="spec-buddy__mouth happy" d="M31 44c3 4 10 4 13 0" />
      </>
    )
  }

  if (mood === 'mirroring') {
    return (
      <>
        <ellipse className="spec-buddy__eye glow" cx="27" cy="33" rx="4.5" ry="3.6" />
        <ellipse className="spec-buddy__eye glow" cx="45" cy="33" rx="4.5" ry="3.6" />
        <path className="spec-buddy__mouth calm" d="M33 44c3 2 7 2 10 0" />
      </>
    )
  }

  if (mood === 'judging') {
    return (
      <>
        <path className="spec-buddy__eye-line judging" d="M21 31c5-2 10-1 14 2" />
        <path className="spec-buddy__eye-line judging" d="M40 32c5-2 10-2 14-1" />
        <circle className="spec-buddy__pupil judging" cx="29" cy="33" r="1.4" />
        <circle className="spec-buddy__pupil judging" cx="47" cy="32" r="1.4" />
        <path className="spec-buddy__mouth flat" d="M33 44h11" />
      </>
    )
  }

  return (
    <>
      <circle className="spec-buddy__eye" cx="27" cy="33" r="3.6" />
      <circle className="spec-buddy__eye" cx="45" cy="33" r="3.6" />
      <path className="spec-buddy__mouth calm" d="M33 43c3 2 8 2 11 0" />
    </>
  )
}

export const SpecBuddy: React.FC<SpecBuddyProps> = ({
  mood,
  state,
  enabled = true,
  checkpointLabel,
  compact = false,
  pitchMode = false,
}) => {
  const { x, y, edge, isMoving, transitionDuration } = usePerimeterRoam(
    enabled,
    '[data-specter-boundary="true"]',
    { ghostSize: 56, avoidBottomCenter: true }
  )

  const animClass = resolveAnimationClass(mood, isMoving)
  const tiltClass = isMoving
    ? edge === 'left'
      ? 'spec-buddy--tilt-left'
      : edge === 'right'
        ? 'spec-buddy--tilt-right'
        : ''
    : ''

  return (
    <div
      className={`spec-buddy spec-buddy--${mood} ${animClass} ${tiltClass} ${compact ? 'spec-buddy--compact' : ''} ${pitchMode ? 'spec-buddy--pitch' : ''}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transitionDuration: `${transitionDuration}ms`,
      }}
    >
      {pitchMode && (
        <div className="spec-buddy__pitch-tags" aria-hidden="true">
          <span>measured behavior</span>
          <span>real-time mood signal</span>
          <span>versioned checkpoint</span>
          <span>feedback reward</span>
        </div>
      )}
      <div className="spec-buddy__trail" />
      <div className="spec-buddy__stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <svg className="spec-buddy__svg" width="72" height="78" viewBox="0 0 72 78" aria-hidden="true">
        <defs>
          <filter id="spec-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Cute ghost body with rounded top and wavy bottom */}
        <path
          className="spec-buddy__body"
          d="M36 4c18 0 32 14 32 32v24c0 3-2 5-4 3l-5-4-5 6c-2 2-4 2-6 0l-4-5-4 5c-2 2-4 2-6 0l-4-5-5 4c-2 2-4 0-4-3V36C16 18 18 4 36 4Z"
        />
        <path className="spec-buddy__shine" d="M22 16c3-5 8-8 14-9" />
        {mood === 'judging' && (
          <>
            <path className="spec-buddy__arm-cross" d="M21 40c8 5 20 6 31 1" />
            <path className="spec-buddy__arm-cross" d="M51 38c-9 7-20 9-31 5" />
          </>
        )}
        {renderEyes(mood)}
      </svg>
      {!compact && <div className="spec-buddy__checkpoint">{checkpointLabel}</div>}
      <div className="spec-buddy__label">{labelForMood(mood, state)}</div>
    </div>
  )
}
