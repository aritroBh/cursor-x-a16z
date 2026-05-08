import { spawn, ChildProcess } from 'child_process'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { shell } from 'electron'
import { safeLog, safeWarn, safeError } from '../logger'

import OpenAI from 'openai'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech'
const RACHEL_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const DEFAULT_MODEL_ID = 'eleven_turbo_v2'

let activePlayback: ChildProcess | null = null
let activeRequest: AbortController | null = null
let speechRunId = 0

function waitForProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', () => resolve())
  })
}

async function playAudioFile(filePath: string): Promise<void> {
  if (process.platform === 'darwin') {
    activePlayback = spawn('afplay', [filePath], { stdio: 'ignore' })
    const child = activePlayback
    try {
      await waitForProcess(child)
    } finally {
      if (activePlayback === child) {
        activePlayback = null
      }
      unlink(filePath).catch(() => undefined)
    }
    return
  }
  await shell.openPath(filePath)
}

export async function stopSpeaking(): Promise<void> {
  speechRunId += 1
  if (activeRequest) {
    activeRequest.abort()
    activeRequest = null
  }
  if (activePlayback) {
    activePlayback.kill()
    activePlayback = null
  }
}

async function speakFallback(text: string, reason?: string): Promise<void> {
  await stopSpeaking()
  if (!text.trim()) return

  safeLog(`[TTS] using macOS fallback ${reason ? `(${reason})` : ''}`)
  activePlayback = spawn('say', ['-v', 'Samantha', text], { stdio: 'ignore' })
  const child = activePlayback
  try {
    await waitForProcess(child)
  } finally {
    if (activePlayback === child) {
      activePlayback = null
    }
  }
}

async function speakOpenAI(text: string, apiKey: string): Promise<boolean> {
  const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
  const voice = (process.env.OPENAI_TTS_VOICE as any) || 'nova'
  
  safeLog('[TTS] Trying OpenAI TTS...', { model, voice })
  try {
    const openai = new OpenAI({ apiKey })
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text
    })

    const buffer = Buffer.from(await response.arrayBuffer())
    const outputDir = join(tmpdir(), 'specter-tts')
    const outputPath = join(outputDir, `openai-speech-${Date.now()}.mp3`)

    await mkdir(outputDir, { recursive: true })
    await writeFile(outputPath, buffer)

    safeLog('[TTS] OpenAI TTS success, playing...')
    await playAudioFile(outputPath)
    return true
  } catch (error: any) {
    safeError('[TTS] OpenAI TTS failed', error)
    return false
  }
}

export interface SpeakResult {
  success: boolean
  providerUsed: 'elevenlabs' | 'openai' | 'macos'
  fallbackReason?: string
}

export async function speak(text: string): Promise<SpeakResult> {
  safeLog('[TTS] speak called', { preview: text?.slice(0, 50) })
  await stopSpeaking()
  if (!text.trim()) return { success: true, providerUsed: 'macos' }

  const runId = speechRunId
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID

  // 1. Try ElevenLabs
  if (elevenlabsKey) {
    let request: AbortController | null = null
    try {
      safeLog('[TTS] Calling ElevenLabs...', { voiceId, modelId })
      request = new AbortController()
      activeRequest = request

      const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
        method: 'POST',
        signal: request.signal,
        headers: {
          'xi-api-key': elevenlabsKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true }
        })
      })

      if (activeRequest === request) activeRequest = null
      if (runId !== speechRunId) return { success: false, providerUsed: 'elevenlabs', fallbackReason: 'stale run' }

      if (response.ok) {
        const audio = Buffer.from(await response.arrayBuffer())
        const outputDir = join(tmpdir(), 'specter-tts')
        const outputPath = join(outputDir, `eleven-speech-${Date.now()}.mp3`)
        await mkdir(outputDir, { recursive: true })
        await writeFile(outputPath, audio)
        if (runId === speechRunId) {
          safeLog('[TTS] ElevenLabs success, playing...')
          await playAudioFile(outputPath)
          return { success: true, providerUsed: 'elevenlabs' }
        }
      } else {
        const errorText = await response.text()
        safeWarn('[TTS] ElevenLabs returned error', { status: response.status, errorText })
      }
    } catch (error: any) {
      safeError('[TTS] ElevenLabs exception', error)
    }
  }

  // 2. Try OpenAI TTS Fallback
  if (openaiKey) {
    safeLog('[TTS] ElevenLabs failed or skipped; trying OpenAI TTS fallback')
    const ok = await speakOpenAI(text, openaiKey)
    if (ok) return { success: true, providerUsed: 'openai' }
  }

  // 3. Last resort: macOS say
  safeLog('[TTS] ElevenLabs and OpenAI failed; using macOS fallback')
  await speakFallback(text, 'OpenAI fallback failed')
  return { success: true, providerUsed: 'macos' }
}
