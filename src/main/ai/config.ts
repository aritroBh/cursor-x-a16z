import Anthropic from '@anthropic-ai/sdk'
import { safeLog, safeWarn } from '../logger'

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
  if (process.env.USE_LOCAL_MODEL !== 'true') {
    return undefined
  }
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

  if (!useLocal) {
    const envBaseUrl = process.env.ANTHROPIC_BASE_URL || process.env.LOCAL_MODEL_BASE_URL
    if (envBaseUrl && isLocalhostUrl(envBaseUrl)) {
      safeWarn('[AI_BACKEND] Ignoring localhost Anthropic base URL because USE_LOCAL_MODEL is not true')
    }
    // Force official Anthropic endpoint so the SDK cannot read ANTHROPIC_BASE_URL from process.env
    return new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' })
  }

  // Local mode
  const localBaseUrl = getLocalModelBaseUrl()
  if (localBaseUrl) {
    safeLog('[AI_BACKEND] Using local model endpoint:', localBaseUrl)
    return new Anthropic({ apiKey, baseURL: localBaseUrl })
  }

  safeWarn('[AI_BACKEND] USE_LOCAL_MODEL is true but no local base URL is set; falling back to official Anthropic API')
  return new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' })
}
