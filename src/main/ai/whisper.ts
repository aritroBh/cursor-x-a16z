import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { File as NodeFile } from 'node:buffer'
import { safeLog, safeWarn, safeError } from '../logger'

const WHISPER_TIMEOUT_MS = 20_000

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Whisper transcription timed out after ${ms}ms`)
      ;(err as any).code = 'WHISPER_TIMEOUT'
      reject(err)
    }, ms)
    // Prevent the timer from keeping the Node process alive
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      ;(timer as any).unref()
    }
  })
}

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  safeLog('[WHISPER] received buffer', { bufferSize: audioBuffer?.length || 0 })

  if (!audioBuffer || audioBuffer.length === 0) {
    safeWarn('[WHISPER] empty audio buffer, skipping OpenAI')
    return ''
  }

  if (!OPENAI_API_KEY) {
    safeWarn('[WHISPER] OPENAI_API_KEY missing; transcription unavailable')
    return ''
  }

  if (typeof globalThis.File === 'undefined') {
    ;(globalThis as any).File = NodeFile
    safeLog('[WHISPER] installed Node File polyfill for OpenAI uploads')
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    const file = await toFile(audioBuffer, 'audio.webm', {
      type: 'audio/webm'
    })
    safeLog('[WHISPER] created upload file', { name: 'audio.webm', type: 'audio/webm' })
    safeLog('[WHISPER] OpenAI request started')

    const response = await Promise.race([
      openai.audio.transcriptions.create({ file, model: 'whisper-1' }),
      timeoutPromise(WHISPER_TIMEOUT_MS)
    ])

    safeLog('[WHISPER] transcription success', { textLength: response.text?.length || 0 })
    return response.text || ''
  } catch (error: any) {
    if (error?.code === 'WHISPER_TIMEOUT') {
      safeWarn('[WHISPER] OpenAI request timed out', { timeoutMs: WHISPER_TIMEOUT_MS })
    } else {
      const category = error?.name || 'Error'
      const message = error?.message || String(error)
      safeError('[WHISPER] transcription failed', { category, message })
    }
    throw error
  }
}
