import Anthropic from '@anthropic-ai/sdk'

const CLAUDE_VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-20241022'

export interface ScreenCoordinate {
  label: string
  x: number
  y: number
  confidence?: number
}

export interface ScreenState {
  app: string
  coordinates: ScreenCoordinate[]
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
}

function anthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return null
  }
  return new Anthropic({ apiKey: key })
}

export function fallbackScreenState(): ScreenState {
  return {
    app: 'Unknown',
    coordinates: []
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

function extractJson(text: string): any | null {
  const cleanJson = text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim()
  const jsonMatch = cleanJson.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

function normalizeScreenState(value: any): ScreenState {
  if (!value || typeof value !== 'object') {
    return fallbackScreenState()
  }

  const coordinates = Array.isArray(value.coordinates)
    ? value.coordinates
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => ({
          label: typeof item.label === 'string' && item.label.trim() ? item.label : 'Untitled target',
          x: percent(item.x ?? item.targetX),
          y: percent(item.y ?? item.targetY),
          confidence: confidence(item.confidence, 0.5)
        }))
    : []

  return {
    app: typeof value.app === 'string' && value.app.trim() ? value.app : 'Unknown',
    coordinates
  }
}

function normalizeScreenTargets(value: any, prompt: string): ScreenTargetsResult {
  if (!value || typeof value !== 'object') {
    return {
      app: 'Unknown',
      prompt,
      microTask: 'First, I will teach one visible action.',
      targets: [],
      needsConfirmation: true,
      reason: 'No target JSON returned.',
      capturedAt: new Date().toISOString()
    }
  }

  const rawTargets = Array.isArray(value.targets) ? value.targets : Array.isArray(value.coordinates) ? value.coordinates : []

  const targets = rawTargets
    .filter((item: any) => item && typeof item === 'object')
    .map(
      (item: any, index: number): ScreenTarget => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `target-${index + 1}`,
        label:
          typeof item.label === 'string' && item.label.trim()
            ? item.label.trim()
            : typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : `Target ${index + 1}`,
        description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
        x: percent(item.x ?? item.targetX),
        y: percent(item.y ?? item.targetY),
        confidence: confidence(item.confidence, 0.45),
        action: action(item.action),
        source: 'vision'
      })
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12)

  return {
    app: typeof value.app === 'string' && value.app.trim() ? value.app.trim() : 'Unknown',
    prompt,
    microTask: typeof value.microTask === 'string' && value.microTask.trim() ? value.microTask.trim() : 'First, I will teach one visible action.',
    targets,
    needsConfirmation: value.needsConfirmation !== false,
    reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : undefined,
    capturedAt: new Date().toISOString()
  }
}

export function fallbackScreenTargets(prompt = ''): ScreenTargetsResult {
  return {
    app: 'Unknown',
    prompt,
    microTask: 'First, I will teach one visible action.',
    targets: [],
    needsConfirmation: true,
    reason: 'No visible targets were detected.',
    capturedAt: new Date().toISOString()
  }
}

export async function detectScreenTargets(base64PNG?: string, prompt = ''): Promise<ScreenTargetsResult> {
  const anthropic = anthropicClient()
  const normalizedPrompt = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : 'Teach one visible action'

  console.log('[SCREEN_TARGETS] detect request', {
    hasBase64: Boolean(base64PNG),
    prompt: normalizedPrompt
  })

  if (!base64PNG) {
    console.warn('[SCREEN_TARGETS] no screenshot provided; returning empty target set')
    return fallbackScreenTargets(normalizedPrompt)
  }

  if (!anthropic) {
    console.warn('[SCREEN_TARGETS] ANTHROPIC_API_KEY missing; returning empty target set')
    return fallbackScreenTargets(normalizedPrompt)
  }

  try {
    console.log('[SCREEN_TARGETS] calling Claude Vision...', {
      model: CLAUDE_VISION_MODEL
    })
    const message = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 4096,
      system:
        'You are a real-app UI target detector for Specter, a visual software tutor. Return ONLY valid JSON. Identify visible clickable UI targets in the screenshot. Coordinates must be percentages from 0-100 of the full screenshot width and height. Include confidence from 0-1. If the user asks for a broad tutorial, reduce it to one visible micro-task and return at most 12 likely targets. Do not invent hidden menu items or off-screen steps.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64PNG
              }
            },
            {
              type: 'text',
              text: JSON.stringify(
                {
                  userPrompt: normalizedPrompt,
                  requiredShape: {
                    app: 'detected app or web page',
                    microTask: 'First, I will teach one visible action.',
                    needsConfirmation: true,
                    reason: 'short uncertainty note if useful',
                    targets: [
                      {
                        id: 'target-1',
                        label: 'Text tool',
                        description: 'visible T icon in toolbar',
                        x: 12.5,
                        y: 8.2,
                        confidence: 0.86,
                        action: 'click'
                      }
                    ]
                  }
                },
                null,
                2
              )
            }
          ]
        }
      ]
    })

    const textParts = message.content.flatMap((part) => (part.type === 'text' && 'text' in part && typeof part.text === 'string' ? [part.text] : [])).join('\n')

    if (textParts) {
      console.log('[SCREEN_TARGETS] raw response:', textParts)
      const parsed = extractJson(textParts)
      if (parsed) {
        const normalized = normalizeScreenTargets(parsed, normalizedPrompt)
        console.log('[SCREEN_TARGETS] normalized targets', {
          app: normalized.app,
          count: normalized.targets.length,
          topTarget: normalized.targets[0]
            ? {
                label: normalized.targets[0].label,
                x: normalized.targets[0].x,
                y: normalized.targets[0].y,
                confidence: normalized.targets[0].confidence
              }
            : null
        })
        return normalized
      }
    }

    return fallbackScreenTargets(normalizedPrompt)
  } catch (error) {
    console.error('[SCREEN_TARGETS] error:', error)
    return fallbackScreenTargets(normalizedPrompt)
  }
}

export async function analyzeScreen(base64PNG?: string): Promise<ScreenState> {
  console.log('[SCREENER] Got base64, length:', base64PNG?.length)
  const anthropic = anthropicClient()

  if (!base64PNG) {
    console.warn('[Specter] No screenshot provided; using screen analysis fallback.')
    return fallbackScreenState()
  }

  if (!anthropic) {
    console.warn('[Specter] ANTHROPIC_API_KEY missing; skipping screen analysis.')
    return fallbackScreenState()
  }

  try {
    console.log('[SCREENER] Calling Claude Vision...', {
      model: CLAUDE_VISION_MODEL
    })
    const message = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 4096,
      system:
        'You are a UI state analyzer. Given a screenshot, return ONLY valid JSON matching the ScreenState schema. Identify clickable elements and their approximate screen coordinates as percentages (0-100) of screen width/height.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64PNG
              }
            },
            {
              type: 'text',
              text: 'Analyze this screenshot and return the UI state as JSON.'
            }
          ]
        }
      ]
    })

    const textParts = message.content.flatMap((part) => (part.type === 'text' && 'text' in part && typeof part.text === 'string' ? [part.text] : [])).join('\n')

    if (textParts) {
      console.log('[SCREENER] Raw response:', textParts)
      const cleanJson = textParts
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('[SCREENER] Parsed state:', JSON.stringify(parsed))
        return normalizeScreenState(parsed)
      }
    }
    return fallbackScreenState()
  } catch (error) {
    console.error('[SCREENER] Error:', error)
    return fallbackScreenState()
  }
}
