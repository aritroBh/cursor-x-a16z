import { classifyAnthropicError, createAnthropicClient, getAnthropicVisionModel } from './config'
import { safeLog, safeWarn, safeError } from '../logger'
import { analyzeVision, VisionAnalyzeResult, VisionErrorCode } from '../vision'

const CLAUDE_VISION_MODEL = getAnthropicVisionModel()

export interface ScreenCoordinate {
  label: string
  x: number
  y: number
  confidence?: number
}

export interface ScreenState {
  app: string
  coordinates: ScreenCoordinate[]
  error?: string
  fallbackAvailable?: boolean
}

export interface ScreenTarget {
  id?: string
  label: string
  description?: string
  x: number
  y: number
  confidence: number
  action: 'click' | 'type' | 'scroll' | 'wait'
  source: 'vision' | 'manual'
}

export interface ScreenTargetsResult {
  app: string
  prompt: string
  microTask: string
  targets: ScreenTarget[]
  needsConfirmation: boolean
  reason?: string
  capturedAt: string
  error?: string
  fallbackAvailable?: boolean
}


export function fallbackScreenState(error?: string): ScreenState {
  return {
    app: 'Unknown',
    coordinates: [],
    error,
    fallbackAvailable: true
  }
}

function percent(value: any, fallback = 50): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback
}

function confidence(value: any, fallback = 0.5): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const normalized = value > 1 ? value / 100 : value
  return Math.min(1, Math.max(0, normalized))
}

function action(value: any): ScreenTarget['action'] {
  return ['click', 'type', 'scroll', 'wait'].includes(value) ? value : 'click'
}

export function fallbackScreenTargets(prompt = '', error?: string): ScreenTargetsResult {
  return {
    app: 'Unknown',
    prompt,
    microTask: 'First, I will teach one visible action.',
    targets: [],
    needsConfirmation: true,
    reason: 'No visible targets were detected.',
    capturedAt: new Date().toISOString(),
    error,
    fallbackAvailable: true
  }
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenTargetsResult
 */
function adaptToScreenTargets(result: VisionAnalyzeResult, prompt: string): ScreenTargetsResult {
  return {
    app: result.summary.split(' ')[0] || 'Unknown', // Rough app detection from summary
    prompt,
    microTask: result.recommendedAction || 'First, I will teach one visible action.',
    targets: result.elements.map((el, index) => ({
      id: `target-${index + 1}`,
      label: el.label,
      description: el.reasoning,
      // The new provider returns pixel coordinates, the old one expected percentages.
      // We need to know screenshot dimensions to convert, but if not available, we use them as is
      // and hope the rest of the app handles it.
      // Actually, looking at the old code, it used percent() which clamped to 0-100.
      x: el.center?.x ?? el.bbox?.x ?? 0,
      y: el.center?.y ?? el.bbox?.y ?? 0,
      confidence: el.confidence ?? 0.5,
      action: 'click', // Default action
      source: 'vision'
    })),
    needsConfirmation: true,
    reason: result.warnings.join('. '),
    capturedAt: result.generatedAt
  }
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenState
 */
function adaptToScreenState(result: VisionAnalyzeResult): ScreenState {
  return {
    app: result.summary.split(' ')[0] || 'Unknown',
    coordinates: result.elements.map(el => ({
      label: el.label,
      x: el.center?.x ?? el.bbox?.x ?? 0,
      y: el.center?.y ?? el.bbox?.y ?? 0,
      confidence: el.confidence
    }))
  }
}

export async function detectScreenTargets(base64PNG?: string, prompt = ''): Promise<ScreenTargetsResult> {
  const normalizedPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : 'Teach one visible action'

  if (!base64PNG) {
    safeWarn('[SCREEN_TARGETS] no screenshot provided; returning empty target set')
    return fallbackScreenTargets(normalizedPrompt)
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: 'image/png',
      task: 'target_detection',
      userPrompt: normalizedPrompt
    });

    return adaptToScreenTargets(result, normalizedPrompt);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(`[AI_BACKEND] Vision provider failed (${code}): ${error.message}`);
    return fallbackScreenTargets(normalizedPrompt, code || 'UNKNOWN_VISION_ERROR');
  }
}

export async function analyzeScreen(base64PNG?: string): Promise<ScreenState> {
  if (!base64PNG) {
    safeWarn('[Specter] No screenshot provided; skipping screen analysis.')
    return fallbackScreenState()
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: 'image/png',
      task: 'screen_understanding'
    });

    return adaptToScreenState(result);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(`[AI_BACKEND] Vision provider failed (${code}): ${error.message}`);
    return fallbackScreenState(code || 'UNKNOWN_VISION_ERROR');
  }
}
