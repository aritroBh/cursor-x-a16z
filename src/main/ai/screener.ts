import Anthropic from '@anthropic-ai/sdk'

export interface ScreenCoordinate {
  label: string
  x: number
  y: number
}

export interface ScreenState {
  app: string
  coordinates: ScreenCoordinate[]
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
          y: percent(item.y ?? item.targetY)
        }))
    : []

  return {
    app: typeof value.app === 'string' && value.app.trim() ? value.app : 'Unknown',
    coordinates
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
    console.log('[SCREENER] Calling Claude Vision...')
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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

    const textParts = message.content
      .flatMap((part) => (part.type === 'text' && 'text' in part && typeof part.text === 'string' ? [part.text] : []))
      .join('\n')

    if (textParts) {
      console.log('[SCREENER] Raw response:', textParts)
      const cleanJson = textParts.replace(/```json/g, '').replace(/```/g, '').trim()
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
