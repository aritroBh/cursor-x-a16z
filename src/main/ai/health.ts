import {
  classifyAnthropicError,
  createAnthropicClient,
  getAnthropicApiKey,
  getAnthropicBaseUrlForMode,
  getAnthropicModel,
  getAnthropicVisionModel,
  getUseLocalModel,
  isLocalhostUrl,
  OFFICIAL_ANTHROPIC_BASE_URL
} from './config'
import { safeLog } from '../logger'

interface KeyHealth {
  present: boolean
  keyLength: number
  placeholderDetected: boolean
}

interface AnthropicHealth {
  key: KeyHealth
  configured: boolean
  useLocalModel: boolean
  baseURLKind: 'official' | 'local' | 'custom'
  baseURLOfficial: boolean
  plannerModel: string
  visionModel: string
  testRequest: {
    attempted: boolean
    pass: boolean
    category?: string
    status?: number
    reason?: string
  }
}

interface OpenAIHealth {
  key: KeyHealth
  whisperConfigured: boolean
}

export interface AIHealthResult {
  ok: boolean
  anthropic: AnthropicHealth
  openai: OpenAIHealth
}

function keyHealth(value: string | undefined): KeyHealth {
  const trimmed = value?.trim() || ''
  const placeholderDetected =
    !trimmed
      ? false
      : /placeholder|changeme|change_me|replace|your[_-]?key|xxx|sk-xxx|test[_-]?key/i.test(trimmed)

  return {
    present: Boolean(trimmed),
    keyLength: trimmed.length,
    placeholderDetected
  }
}

function baseURLKind(baseURL: string, useLocalModel: boolean): 'official' | 'local' | 'custom' {
  if (baseURL === OFFICIAL_ANTHROPIC_BASE_URL) return 'official'
  if (useLocalModel || isLocalhostUrl(baseURL)) return 'local'
  return 'custom'
}

function friendlyAnthropicReason(category: string, status?: number): string {
  if (category === 'auth_error') return 'Anthropic authentication failed. Check ANTHROPIC_API_KEY.'
  if (category === 'network_error') return 'Anthropic could not be reached from this machine.'
  if (category === 'model_error') return 'The selected Anthropic model is unavailable for this key.'
  if (category === 'rate_limit') return 'Anthropic rate limit reached.'
  if (category === 'api_key_missing') return 'ANTHROPIC_API_KEY is missing.'
  return status ? `Anthropic request failed with status ${status}.` : 'Anthropic request failed.'
}

export async function checkAIHealth(): Promise<AIHealthResult> {
  const anthropicKey = keyHealth(getAnthropicApiKey())
  const openaiKey = keyHealth(process.env.OPENAI_API_KEY)
  const useLocalModel = getUseLocalModel()
  const baseURL = getAnthropicBaseUrlForMode()

  const result: AIHealthResult = {
    ok: false,
    anthropic: {
      key: anthropicKey,
      configured: anthropicKey.present && !anthropicKey.placeholderDetected,
      useLocalModel,
      baseURLKind: baseURLKind(baseURL, useLocalModel),
      baseURLOfficial: baseURL === OFFICIAL_ANTHROPIC_BASE_URL,
      plannerModel: getAnthropicModel(),
      visionModel: getAnthropicVisionModel(),
      testRequest: {
        attempted: false,
        pass: false
      }
    },
    openai: {
      key: openaiKey,
      whisperConfigured: openaiKey.present && !openaiKey.placeholderDetected
    }
  }

  if (!result.anthropic.configured) {
    result.anthropic.testRequest = {
      attempted: false,
      pass: false,
      category: anthropicKey.present ? 'auth_error' : 'api_key_missing',
      reason: anthropicKey.present ? 'Anthropic key looks like placeholder text.' : 'ANTHROPIC_API_KEY is missing.'
    }
  } else {
    const client = createAnthropicClient()
    if (!client) {
      result.anthropic.testRequest = {
        attempted: false,
        pass: false,
        category: 'api_key_missing',
        reason: 'ANTHROPIC_API_KEY is missing.'
      }
    } else {
      result.anthropic.testRequest.attempted = true
      try {
        const message = await client.messages.create({
          model: getAnthropicModel(),
          max_tokens: 8,
          messages: [
            {
              role: 'user',
              content: 'Return OK'
            }
          ]
        })
        const text = message.content
          .flatMap((part) => (part.type === 'text' && 'text' in part && typeof part.text === 'string' ? [part.text] : []))
          .join('\n')
          .trim()

        result.anthropic.testRequest.pass = /^ok\.?$/i.test(text) || /ok/i.test(text)
        if (!result.anthropic.testRequest.pass) {
          result.anthropic.testRequest.category = 'unknown'
          result.anthropic.testRequest.reason = 'Anthropic responded, but not with OK.'
        }
      } catch (error: any) {
        const summary = classifyAnthropicError(error)
        result.anthropic.testRequest.pass = false
        result.anthropic.testRequest.category = summary.category
        result.anthropic.testRequest.status = summary.status
        result.anthropic.testRequest.reason = friendlyAnthropicReason(summary.category, summary.status)
      }
    }
  }

  result.ok = result.anthropic.testRequest.pass && result.openai.whisperConfigured
  safeLog('[AI_BACKEND] health check result', {
    ok: result.ok,
    anthropic: {
      keyPresent: result.anthropic.key.present,
      keyLength: result.anthropic.key.keyLength,
      placeholderDetected: result.anthropic.key.placeholderDetected,
      configured: result.anthropic.configured,
      useLocalModel: result.anthropic.useLocalModel,
      baseURLKind: result.anthropic.baseURLKind,
      baseURLOfficial: result.anthropic.baseURLOfficial,
      plannerModel: result.anthropic.plannerModel,
      visionModel: result.anthropic.visionModel,
      testRequest: result.anthropic.testRequest
    },
    openai: {
      keyPresent: result.openai.key.present,
      keyLength: result.openai.key.keyLength,
      placeholderDetected: result.openai.key.placeholderDetected,
      whisperConfigured: result.openai.whisperConfigured
    }
  })

  return result
}
