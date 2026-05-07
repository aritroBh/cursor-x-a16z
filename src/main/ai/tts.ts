import { spawn, ChildProcess } from 'child_process'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { shell } from 'electron'
import { safeLog, safeWarn, safeError } from '../logger'

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

async function speakFallback(text: string): Promise<void> {
  await stopSpeaking()
  if (!text.trim()) return

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

export async function speak(text: string): Promise<void> {
  safeLog('[TTS] speak called', { preview: text?.slice(0, 50) })
  await stopSpeaking()
  if (!text.trim()) return

  const runId = speechRunId
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    safeWarn('[TTS] ELEVENLABS_API_KEY missing; using macOS say fallback.')
    await speakFallback(text)
    return
  }

  let request: AbortController | null = null
  try {
    safeLog('[TTS] Calling ElevenLabs...')
    request = new AbortController()
    activeRequest = request

    const response = await fetch(`${ELEVENLABS_API_URL}/${RACHEL_VOICE_ID}`, {
      method: 'POST',
      signal: request.signal,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true
        }
      })
    })

    if (activeRequest === request) {
      activeRequest = null
    }

    if (runId !== speechRunId) return

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ElevenLabs returned ${response.status}: ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    if (runId !== speechRunId) return

    const audio = Buffer.from(arrayBuffer)
    const outputDir = join(tmpdir(), 'specter-tts')
    const outputPath = join(outputDir, `speech-${Date.now()}.mp3`)

    await mkdir(outputDir, { recursive: true })
    await writeFile(outputPath, audio)

    if (runId !== speechRunId) {
      unlink(outputPath).catch(() => undefined)
      return
    }

    safeLog('[TTS] Audio received, playing...')
    await playAudioFile(outputPath)
  } catch (error) {
    if (activeRequest === request) {
      activeRequest = null
    }
    if (runId !== speechRunId) return
    safeError('[TTS] error fallback', error)
    await speakFallback(text)
  }
}
