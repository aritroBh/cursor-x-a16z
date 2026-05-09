import { spawn, ChildProcess } from "child_process";
import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { shell } from "electron";
import { safeLog, safeWarn, safeError } from "../logger";

import OpenAI from "openai";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_turbo_v2";
const PROVIDER_TIMEOUT_MS = 20_000;

let activePlayback: ChildProcess | null = null;
let activeRequest: AbortController | null = null;
let speechRunId = 0;

function waitForProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
}

async function playAudioFile(filePath: string): Promise<void> {
  if (process.platform === "darwin") {
    activePlayback = spawn("afplay", [filePath], { stdio: "ignore" });
    const child = activePlayback;
    try {
      await waitForProcess(child);
    } finally {
      if (activePlayback === child) {
        activePlayback = null;
      }
      unlink(filePath).catch(() => undefined);
    }
    return;
  }
  await shell.openPath(filePath);
}

export async function stopSpeaking(): Promise<void> {
  speechRunId += 1;
  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }
  if (activePlayback) {
    activePlayback.kill();
    activePlayback = null;
  }
}

async function speakFallback(text: string, reason?: string): Promise<void> {
  await stopSpeaking();
  if (!text.trim()) return;

  safeLog(`[TTS] using macOS fallback ${reason ? `(${reason})` : ""}`);
  activePlayback = spawn("say", ["-v", "Samantha", text], { stdio: "ignore" });
  const child = activePlayback;
  try {
    await waitForProcess(child);
  } finally {
    if (activePlayback === child) {
      activePlayback = null;
    }
  }
}

async function speakOpenAI(
  text: string,
  apiKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = (process.env.OPENAI_TTS_VOICE as any) || "nova";

  safeLog("[TTS] Trying OpenAI TTS...", { model, voice });
  try {
    const openai = new OpenAI({ apiKey });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`OpenAI TTS timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`)),
        PROVIDER_TIMEOUT_MS,
      ),
    );
    const response = await Promise.race([
      openai.audio.speech.create({ model, voice, input: text }),
      timeoutPromise,
    ]);

    const buffer = Buffer.from(await response.arrayBuffer());
    const outputDir = join(tmpdir(), "specter-tts");
    const outputPath = join(outputDir, `openai-speech-${Date.now()}.mp3`);

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, buffer);

    safeLog("[TTS] OpenAI TTS success, playing...");
    await playAudioFile(outputPath);
    return { ok: true };
  } catch (error: any) {
    safeError("[TTS] OpenAI TTS failed", error);
    const reason =
      error?.message ||
      (error?.status ? `HTTP ${error.status}` : String(error));
    return { ok: false, reason };
  }
}

export interface SpeakResult {
  success: boolean;
  providerUsed: "elevenlabs" | "openai" | "macos";
  fallbackReason?: string;
  failures?: {
    elevenlabs?: string;
    openai?: string;
  };
}

export async function speak(text: string): Promise<SpeakResult> {
  safeLog("[TTS] speak called", { preview: text?.slice(0, 50) });
  await stopSpeaking();
  if (!text.trim()) return { success: true, providerUsed: "macos" };

  const runId = speechRunId;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID;

  const failures: { elevenlabs?: string; openai?: string } = {};

  // 1. Try ElevenLabs
  if (elevenlabsKey) {
    let request: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      safeLog("[TTS] Calling ElevenLabs...", { voiceId, modelId });
      request = new AbortController();
      activeRequest = request;
      timeoutId = setTimeout(() => {
        safeWarn(`[TTS] ElevenLabs timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`);
        request!.abort();
      }, PROVIDER_TIMEOUT_MS);

      const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
        method: "POST",
        signal: request.signal,
        headers: {
          "xi-api-key": elevenlabsKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      });

      clearTimeout(timeoutId);
      timeoutId = null;
      if (activeRequest === request) activeRequest = null;
      if (runId !== speechRunId)
        return {
          success: false,
          providerUsed: "elevenlabs",
          fallbackReason: "stale run",
        };

      if (response.ok) {
        const audio = Buffer.from(await response.arrayBuffer());
        const outputDir = join(tmpdir(), "specter-tts");
        const outputPath = join(outputDir, `eleven-speech-${Date.now()}.mp3`);
        await mkdir(outputDir, { recursive: true });
        await writeFile(outputPath, audio);
        if (runId === speechRunId) {
          safeLog("[TTS] ElevenLabs success, playing...");
          await playAudioFile(outputPath);
          return { success: true, providerUsed: "elevenlabs" };
        }
      } else {
        const errorText = await response.text();
        safeWarn("[TTS] ElevenLabs returned error", {
          status: response.status,
          errorText,
        });
        failures.elevenlabs = `HTTP ${response.status}${errorText ? `: ${errorText.slice(0, 120)}` : ""}`;
      }
    } catch (error: any) {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (activeRequest === request) activeRequest = null;
      safeError("[TTS] ElevenLabs exception", error);
      const isTimeout =
        error?.name === "AbortError" ||
        error?.message?.includes("aborted") ||
        error?.message?.includes("timed out");
      failures.elevenlabs = isTimeout
        ? `Timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`
        : error?.message || String(error);
    }
  }

  // 2. Try OpenAI TTS Fallback
  if (openaiKey) {
    safeLog("[TTS] ElevenLabs failed or skipped; trying OpenAI TTS fallback");
    const result = await speakOpenAI(text, openaiKey);
    if (result.ok)
      return { success: true, providerUsed: "openai", failures };
    failures.openai = result.reason;
  }

  // 3. Last resort: macOS say
  const fallbackReason =
    failures.elevenlabs || failures.openai || "all providers skipped";
  safeLog("[TTS] ElevenLabs and OpenAI failed; using macOS fallback");
  await speakFallback(text, fallbackReason);
  return { success: true, providerUsed: "macos", fallbackReason, failures };
}
