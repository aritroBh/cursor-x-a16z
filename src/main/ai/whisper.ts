import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { safeLog, safeWarn, safeError } from '../logger'

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  safeLog('[WHISPER] transcribe called', { bufferSize: audioBuffer?.length || 0 })

  if (!audioBuffer || audioBuffer.length === 0) {
    safeWarn('[WHISPER] empty audio buffer')
    return ''
  }

  if (!OPENAI_API_KEY) {
    safeWarn('[WHISPER] OPENAI_API_KEY missing; transcription unavailable')
    return ''
  }

  try {
    safeLog('[WHISPER] Calling OpenAI...')
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
    const file = await toFile(audioBuffer, 'audio.webm', {
      type: 'audio/webm'
    })

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1'
    })

    safeLog('[WHISPER] transcription received', { length: response.text?.length || 0 })
    return response.text || ''
  } catch (error) {
    safeError('[WHISPER] Error:', error)
    return ''
  }
}
