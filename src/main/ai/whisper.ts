import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { File as NodeFile } from 'node:buffer'
import { safeLog, safeWarn, safeError } from '../logger'

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  safeLog('[WHISPER] transcribe called', { bufferSize: audioBuffer?.length || 0 })

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
    safeLog('[WHISPER] Calling OpenAI...')
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    const file = await toFile(audioBuffer, 'audio.webm', {
      type: 'audio/webm'
    })
    safeLog('[WHISPER] created upload file', { name: 'audio.webm', type: 'audio/webm' })

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1'
    })

    safeLog('[WHISPER] transcription success', { textLength: response.text?.length || 0 })
    return response.text || ''
  } catch (error: any) {
    const category = error?.name || 'Error'
    const message = error?.message || String(error)
    safeError('[WHISPER] transcription failed', { category, message })
    return ''
  }
}
