import OpenAI from 'openai'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  console.log('[WHISPER] transcribe called, buffer size:', audioBuffer?.length)
  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set in environment')
    return ''
  }

  try {
    console.log('[WHISPER] Calling OpenAI...')
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

    // OpenAI SDK expects a File-like object for audio transcriptions
    const file = new File([new Uint8Array(audioBuffer)], 'audio.webm', { type: 'audio/webm' })

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1'
    })

    console.log('[WHISPER] Result:', response.text)
    return response.text || ''
  } catch (error) {
    console.error('[WHISPER] Error:', error)
    return ''
  }
}
