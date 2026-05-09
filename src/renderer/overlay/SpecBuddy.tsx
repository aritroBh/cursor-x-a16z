import React from 'react'
import type { BehavioralState, SpecMood } from '../../main/session/types'

interface SpecBuddyProps {
  mood: SpecMood
  state?: BehavioralState
  cursor?: { x: number; y: number } | null
  checkpointLabel?: string
  compact?: boolean
  pitchMode?: boolean
}

function clampPercent(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback
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

function renderEyes(mood: SpecMood) {
  if (mood === 'thinking') {
    return (
      <>
        <path className="spec-buddy__brow" d="M28 31c5-4 10-4 15-1" />
        <circle className="spec-buddy__eye" cx="34" cy="40" r="4.2" />
        <circle className="spec-buddy__eye" cx="57" cy="38" r="4.2" />
        <circle className="spec-buddy__pupil" cx="32.5" cy="40.5" r="1.7" />
        <circle className="spec-buddy__pupil" cx="55.5" cy="38.5" r="1.7" />
      </>
    )
  }

  if (mood === 'stuck') {
    return (
      <>
        <path className="spec-buddy__eye-line" d="M29 39c4-3 9-3 13 0" />
        <path className="spec-buddy__eye-line" d="M51 39c4-3 9-3 13 0" />
        <path className="spec-buddy__mouth worried" d="M41 53c5-4 10-4 15 0" />
      </>
    )
  }

  if (mood === 'flow') {
    return (
      <>
        <circle className="spec-buddy__eye wide" cx="34" cy="39" r="5.2" />
        <circle className="spec-buddy__eye wide" cx="57" cy="39" r="5.2" />
        <path className="spec-buddy__mouth happy" d="M39 52c4 5 14 5 18 0" />
      </>
    )
  }

  if (mood === 'celebrating') {
    return (
      <>
        <path className="spec-buddy__star-eye" d="M34 31l2.1 5 5.4.4-4.1 3.6 1.3 5.2-4.7-2.7-4.7 2.7 1.3-5.2-4.1-3.6 5.4-.4z" />
        <path className="spec-buddy__star-eye" d="M58 31l2.1 5 5.4.4-4.1 3.6 1.3 5.2-4.7-2.7-4.7 2.7 1.3-5.2-4.1-3.6 5.4-.4z" />
        <path className="spec-buddy__mouth happy" d="M39 54c4 5 14 5 18 0" />
      </>
    )
  }

  if (mood === 'mirroring') {
    return (
      <>
        <ellipse className="spec-buddy__eye glow" cx="34" cy="39" rx="5.8" ry="4.6" />
        <ellipse className="spec-buddy__eye glow" cx="57" cy="39" rx="5.8" ry="4.6" />
        <path className="spec-buddy__mouth calm" d="M42 54c4 2 9 2 13 0" />
      </>
    )
  }

  if (mood === 'judging') {
    return (
      <>
        <path className="spec-buddy__eye-line judging" d="M27 38c7-2 13-1 18 2" />
        <path className="spec-buddy__eye-line judging" d="M51 39c6-3 12-3 18-1" />
        <circle className="spec-buddy__pupil judging" cx="36" cy="39" r="1.9" />
        <circle className="spec-buddy__pupil judging" cx="59" cy="38" r="1.9" />
        <path className="spec-buddy__mouth flat" d="M41 54h15" />
      </>
    )
  }

  return (
    <>
      <circle className="spec-buddy__eye" cx="34" cy="39" r="4.8" />
      <circle className="spec-buddy__eye" cx="57" cy="39" r="4.8" />
      <path className="spec-buddy__mouth calm" d="M41 53c4 3 11 3 15 0" />
    </>
  )
}

export const SpecBuddy: React.FC<SpecBuddyProps> = ({ mood, state, cursor, checkpointLabel, compact = false, pitchMode = false }) => {
  const x = clampPercent(cursor?.x ?? 78, 78)
  const y = clampPercent(cursor?.y ?? 74, 74)
  const style = cursor
    ? {
        left: `clamp(48px, ${x}vw, calc(100vw - 48px))`,
        top: `clamp(74px, calc(${y}vh - 80px), calc(100vh - 56px))`
      }
    : {
        right: compact ? '18px' : '26px',
        bottom: compact ? '86px' : '118px'
      }

  return (
    <div
      className={`spec-buddy spec-buddy--${mood} ${compact ? 'spec-buddy--compact' : ''} ${pitchMode ? 'spec-buddy--pitch' : ''}`}
      style={style}
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
      <svg className="spec-buddy__svg" width="92" height="98" viewBox="0 0 92 98" aria-hidden="true">
        <defs>
          <filter id="spec-soft-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="spec-buddy__body"
          d="M17 45c0-20 12-35 29-35s29 15 29 35v32c0 4-4 6-7 3l-6-5-6 8c-2 3-6 3-8 0l-4-6-5 6c-2 3-6 3-8 0l-5-7-6 5c-3 3-7 1-7-3V45Z"
        />
        <path className="spec-buddy__shine" d="M28 25c4-7 10-11 18-12" />
        <path className="spec-buddy__arm left" d="M20 55c-8 4-11 9-9 15" />
        <path className="spec-buddy__arm right" d="M72 55c8 4 11 9 9 15" />
        {mood === 'judging' && (
          <>
            <path className="spec-buddy__arm-cross" d="M27 61c10 6 25 7 39 1" />
            <path className="spec-buddy__arm-cross" d="M64 59c-11 9-24 11-38 6" />
          </>
        )}
        {renderEyes(mood)}
      </svg>
      {!compact && <div className="spec-buddy__checkpoint">{checkpointLabel}</div>}
      <div className="spec-buddy__label">{labelForMood(mood, state)}</div>
    </div>
  )
}
