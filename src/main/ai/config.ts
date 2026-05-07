import Anthropic from '@anthropic-ai/sdk'

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
}

export function getAnthropicVisionModel(): string {
  return process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-sonnet-20241022'
}

export function getUseLocalModel(): boolean {
  return process.env.USE_LOCAL_MODEL === 'true'
}

export function getLocalModelBaseUrl(): string | undefined {
  return process.env.LOCAL_MODEL_BASE_URL || process.env.ANTHROPIC_BASE_URL
}

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  } catch {
    return false
  }
}

export function createAnthropicClient(): Anthropic | null {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    return null
  }

  const useLocal = getUseLocalModel()
  const localBaseUrl = getLocalModelBaseUrl()

  if (!useLocal && localBaseUrl && isLocalhostUrl(localBaseUrl)) {
    console.warn(
      '[AI_BACKEND] Refusing localhost Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env.'
    )
    return new Anthropic({ apiKey })
  }

  if (useLocal && localBaseUrl) {
    console.log('[AI_BACKEND] Using local model endpoint:', localBaseUrl)
    return new Anthropic({ apiKey, baseURL: localBaseUrl })
  }

  return new Anthropic({ apiKey })
}
