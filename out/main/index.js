"use strict";
require("dotenv/config");
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const uiohookNapi = require("uiohook-napi");
const pkg = require("node-mac-permissions");
const nutJs = require("@nut-tree-fork/nut-js");
const Anthropic = require("@anthropic-ai/sdk");
const child_process = require("child_process");
const promises = require("fs/promises");
const os = require("os");
const OpenAI = require("openai");
const fs = require("fs");
const crypto = require("crypto");
const { getAuthStatus, askForAccessibilityAccess } = pkg;
const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
function sleep$2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function triggerScreenRecordingPrompt() {
  try {
    await electron.desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 }
    });
  } catch {
  }
}
function showPermissionDialog(missing) {
  const screenLine = missing.includes("screen") ? "• Screen Recording — required to capture your desktop\n" : "";
  const accessibilityLine = missing.includes("accessibility") ? "• Accessibility — required for mouse control automation\n" : "";
  const detail = `Specter needs the following permissions to function:

` + screenLine + accessibilityLine + `
For Screen Recording: if the system prompt did not appear, open System Settings → Privacy & Security → Screen Recording and enable Specter, then click Retry.
For Accessibility: grant access in System Settings, then click Retry.`;
  const result = electron.dialog.showMessageBoxSync({
    type: "warning",
    buttons: ["Retry", "Quit"],
    defaultId: 0,
    cancelId: 1,
    title: "Permissions Required",
    message: "Specter needs additional permissions",
    detail
  });
  return result === 0 ? "retry" : "quit";
}
async function checkPermissions() {
  if (process.platform !== "darwin") {
    return true;
  }
  while (true) {
    let screenStatus = getAuthStatus("screen");
    if (screenStatus !== "authorized") {
      await triggerScreenRecordingPrompt();
      await sleep$2(500);
      screenStatus = getAuthStatus("screen");
    }
    const accessibilityStatus = getAuthStatus("accessibility");
    if (accessibilityStatus === "not determined") {
      askForAccessibilityAccess();
    }
    const missing = [];
    if (screenStatus !== "authorized") missing.push("screen");
    if (accessibilityStatus !== "authorized") missing.push("accessibility");
    if (missing.length === 0) {
      return true;
    }
    if (missing.includes("accessibility")) {
      electron.shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
    }
    const action = showPermissionDialog(missing);
    if (action === "quit") {
      electron.app.quit();
      return false;
    }
  }
}
const PERMISSION_ERROR_PATTERNS = [/permission/i, /access denied/i, /not authorized/i, /screen recording/i];
function isPermissionError(err) {
  if (err instanceof Error) {
    return PERMISSION_ERROR_PATTERNS.some((re) => re.test(err.message));
  }
  return false;
}
async function captureScreenBase64() {
  const primaryDisplay = electron.screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  let sources;
  try {
    sources = await electron.desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height }
    });
  } catch (err) {
    const wrapped = new Error("Screen Recording permission denied. Grant access in System Settings, then retry.");
    wrapped.code = "SCREEN_PERMISSION_DENIED";
    wrapped.cause = err;
    throw wrapped;
  }
  const source = sources.find((s) => s.display_id === String(primaryDisplay.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    const err = new Error("Screen Recording permission denied. Grant access in System Settings, then retry.");
    err.code = "SCREEN_PERMISSION_DENIED";
    throw err;
  }
  return source.thumbnail.toPNG().toString("base64");
}
const DEFAULT_MOVE_DURATION_MS = 650;
function sleep$1(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}
function easeInOutCubic(progress) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
function cursorPermissionError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Specter could not control the macOS cursor. Grant Accessibility permission to this app in System Settings > Privacy & Security > Accessibility, then retry. Original error: ${detail}`
  );
}
async function toScreenPoint(x, y) {
  const primary = electron.screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = primary.size;
  const scale = primary.scaleFactor;
  const pixelX = Math.round(clampPercent(x) / 100 * logicalW * scale);
  const pixelY = Math.round(clampPercent(y) / 100 * logicalH * scale);
  return new nutJs.Point(pixelX, pixelY);
}
async function getPhysicalMousePosition() {
  try {
    const pos = await nutJs.mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch (error) {
    throw cursorPermissionError(error);
  }
}
async function waitForMouseAtTarget(targetPercentX, targetPercentY, tolerancePx, timeoutMs) {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const pos = await nutJs.mouse.getPosition();
      const dx = pos.x - target.x;
      const dy = pos.y - target.y;
      if (Math.abs(dx) <= tolerancePx && Math.abs(dy) <= tolerancePx) {
        return "correct";
      }
      await sleep$1(100);
    }
    return "timeout";
  } catch (error) {
    throw cursorPermissionError(error);
  }
}
async function ghostMove(x, y, durationMs = DEFAULT_MOVE_DURATION_MS) {
  console.log("[CURSOR] ghostMove called:", x, y, durationMs);
  try {
    const target = await toScreenPoint(x, y);
    console.log("[CURSOR] Physical pixels:", target.x, target.y);
    const current = await nutJs.mouse.getPosition();
    const distance = Math.max(1, Math.hypot(target.x - current.x, target.y - current.y));
    const previousSpeed = nutJs.mouse.config.mouseSpeed;
    const durationSeconds = Math.max(0.05, durationMs / 1e3);
    nutJs.mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds);
    try {
      await nutJs.mouse.move(nutJs.straightTo(target), easeInOutCubic);
      console.log("[CURSOR] nut-js move complete");
    } finally {
      nutJs.mouse.config.mouseSpeed = previousSpeed;
    }
  } catch (error) {
    console.error("[CURSOR] nut-js error:", error);
    throw cursorPermissionError(error);
  }
}
async function ghostClick(x, y) {
  try {
    await ghostMove(x, y);
    await nutJs.mouse.click(nutJs.Button.LEFT);
  } catch (error) {
    throw cursorPermissionError(error);
  }
}
async function executeSteps(steps) {
  for (const step of steps) {
    if (step.action !== "wait" && step.delayMs) {
      await sleep$1(step.delayMs);
    }
    switch (step.action) {
      case "click":
        await ghostClick(step.x, step.y);
        break;
      case "type":
        await ghostMove(step.x, step.y);
        if (step.typeText) {
          await nutJs.keyboard.type(step.typeText);
        }
        break;
      case "scroll":
        await ghostMove(step.x, step.y);
        await nutJs.mouse.scrollDown(3);
        break;
      case "wait":
        await sleep$1(step.delayMs || 500);
        break;
    }
  }
}
function anthropicClient$1() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return null;
  }
  return new Anthropic({ apiKey: key });
}
async function analyzeScreen(base64PNG) {
  console.log("[SCREENER] Got base64, length:", base64PNG?.length);
  const anthropic = anthropicClient$1();
  if (!anthropic) {
    console.warn("[Specter] ANTHROPIC_API_KEY missing; skipping screen analysis.");
    return null;
  }
  try {
    console.log("[SCREENER] Calling Claude Vision...");
    const message = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: "You are a UI state analyzer. Given a screenshot, return ONLY valid JSON matching the ScreenState schema. Identify clickable elements and their approximate screen coordinates as percentages (0-100) of screen width/height.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64PNG
              }
            },
            {
              type: "text",
              text: "Analyze this screenshot and return the UI state as JSON."
            }
          ]
        }
      ]
    });
    const textParts = message.content.filter((part) => part.type === "text" && "text" in part).map((part) => part.text).join("\n");
    if (textParts) {
      console.log("[SCREENER] Raw response:", textParts);
      const cleanJson = textParts.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[SCREENER] Parsed state:", JSON.stringify(parsed));
        return parsed;
      }
    }
    return null;
  } catch (error) {
    console.error("[SCREENER] Error:", error);
    return null;
  }
}
const CLAUDE_MODEL = "claude-sonnet-4-5";
const STEP_ACTIONS$1 = ["click", "type", "scroll", "wait"];
const SYSTEM_PROMPT = "You are a software tutor. Given the user's intent, current screen state, and their learning history, generate a precise step-by-step tutorial. Return ONLY valid JSON. Coordinates must be percentages of screen dimensions. Keep instructions under 15 words each for Silent mode, conversational for Ultra mode.";
function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text;
  return JSON.parse(candidate);
}
function clampCoordinate(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, value));
}
function isStepAction(value) {
  return typeof value === "string" && STEP_ACTIONS$1.includes(value);
}
function normalizeSequence(value, fallback) {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const maybeSequence = value;
  const steps = Array.isArray(maybeSequence.steps) && maybeSequence.steps.length > 0 ? maybeSequence.steps : fallback.steps;
  return {
    levelTitle: typeof maybeSequence.levelTitle === "string" && maybeSequence.levelTitle.trim() ? maybeSequence.levelTitle : fallback.levelTitle,
    estimatedMinutes: typeof maybeSequence.estimatedMinutes === "number" && Number.isFinite(maybeSequence.estimatedMinutes) ? Math.max(1, Math.round(maybeSequence.estimatedMinutes)) : fallback.estimatedMinutes,
    steps: steps.map((step, index) => {
      const partial = step;
      const fallbackStep = fallback.steps[Math.min(index, fallback.steps.length - 1)];
      return {
        id: typeof partial.id === "string" ? partial.id : `step-${index + 1}`,
        instruction: typeof partial.instruction === "string" && partial.instruction.trim() ? partial.instruction : fallbackStep.instruction,
        targetLabel: typeof partial.targetLabel === "string" && partial.targetLabel.trim() ? partial.targetLabel : fallbackStep.targetLabel,
        x: clampCoordinate(partial.x ?? partial.targetX, fallbackStep.x),
        y: clampCoordinate(partial.y ?? partial.targetY, fallbackStep.y),
        action: isStepAction(partial.action) ? partial.action : fallbackStep.action,
        typeText: typeof partial.typeText === "string" ? partial.typeText : void 0,
        waitForMs: typeof partial.waitForMs === "number" && Number.isFinite(partial.waitForMs) ? Math.max(0, partial.waitForMs) : void 0
      };
    })
  };
}
function fallbackSequence(userIntent, screenState, mode) {
  const coordinates = screenState.coordinates || [];
  const short = mode === "silent";
  if (/blender/i.test(userIntent) && /mesh/i.test(userIntent)) {
    return {
      levelTitle: "Add a Mesh in Blender",
      estimatedMinutes: 2,
      steps: [
        {
          id: "open-add-menu",
          instruction: short ? "Open Add." : "Start with the Add menu in the top-left.",
          targetLabel: "Add menu",
          x: coordinates.find((item) => /add/i.test(item.label))?.x ?? 4,
          y: coordinates.find((item) => /add/i.test(item.label))?.y ?? 3,
          action: "click"
        },
        {
          id: "choose-mesh",
          instruction: short ? "Choose Mesh." : "Now choose Mesh from that menu.",
          targetLabel: "Mesh",
          x: coordinates.find((item) => /mesh/i.test(item.label))?.x ?? 6,
          y: coordinates.find((item) => /mesh/i.test(item.label))?.y ?? 14,
          action: "click"
        },
        {
          id: "choose-cube",
          instruction: short ? "Select Cube." : "Pick Cube as your first simple mesh.",
          targetLabel: "Cube",
          x: coordinates.find((item) => /cube/i.test(item.label))?.x ?? 10,
          y: coordinates.find((item) => /cube/i.test(item.label))?.y ?? 20,
          action: "click"
        },
        {
          id: "confirm-viewport",
          instruction: short ? "Check viewport." : "Look in the viewport and confirm the cube appeared.",
          targetLabel: "Viewport",
          x: 50,
          y: 50,
          action: "wait",
          waitForMs: 800
        },
        {
          id: "select-move-tool",
          instruction: short ? "Select move." : "Select the move tool so you can position it.",
          targetLabel: "Move tool",
          x: coordinates.find((item) => /move/i.test(item.label))?.x ?? 2,
          y: coordinates.find((item) => /move/i.test(item.label))?.y ?? 24,
          action: "click"
        }
      ]
    };
  }
  const generatedSteps = coordinates.slice(0, 5).map((coordinate, index) => ({
    id: `step-${index + 1}`,
    instruction: short ? `Click ${coordinate.label}.` : `Next, click ${coordinate.label}.`,
    targetLabel: coordinate.label,
    x: coordinate.x,
    y: coordinate.y,
    action: "click"
  }));
  return {
    levelTitle: userIntent || "Specter Tutorial",
    estimatedMinutes: Math.max(1, Math.ceil(generatedSteps.length / 3)),
    steps: generatedSteps.length > 0 ? generatedSteps : [
      {
        id: "step-1",
        instruction: short ? "Start here." : "Start with the main control on screen.",
        targetLabel: "Main target",
        x: 50,
        y: 50,
        action: "click"
      }
    ]
  };
}
async function planSteps(userIntent, screenState, sessionHistory, mode) {
  console.log("[PLANNER] Intent:", userIntent);
  console.log("[PLANNER] Screen app detected:", screenState?.app);
  const fallback = fallbackSequence(userIntent, screenState, mode);
  const client = anthropicClient();
  if (!client) {
    console.warn("[Specter] ANTHROPIC_API_KEY missing; using planner fallback.");
    return fallback;
  }
  try {
    console.log("[PLANNER] Calling Claude...");
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              userIntent,
              screenState,
              sessionHistory,
              mode,
              requiredShape: {
                steps: [
                  {
                    id: "string",
                    instruction: "string",
                    targetLabel: "string",
                    x: 0,
                    y: 0,
                    action: "click | type | scroll | wait",
                    typeText: "optional string",
                    waitForMs: "optional number"
                  }
                ],
                levelTitle: "string",
                estimatedMinutes: "number"
              }
            },
            null,
            2
          )
        }
      ]
    });
    const rawText = message.content.filter((part) => part.type === "text" && "text" in part).map((part) => part.text).join("\n");
    console.log("[PLANNER] Raw response:", rawText);
    const steps = normalizeSequence(extractJson(rawText), fallback);
    return steps;
  } catch (error) {
    console.error("[Specter] Failed to plan steps:", error);
    return fallback;
  }
}
async function converse(userMessage, screenState, conversationHistory) {
  const client = anthropicClient();
  if (!client) {
    return "I can help with that once the Claude API key is configured. For now, keep following the cursor.";
  }
  try {
    const history = conversationHistory.slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: "You are a concise, encouraging software tutor answering a mid-session question. Use the screen state, keep the user moving, and return plain text only.",
      messages: [
        ...history,
        {
          role: "user",
          content: JSON.stringify(
            {
              question: userMessage,
              screenState
            },
            null,
            2
          )
        }
      ]
    });
    const text = message.content.filter((part) => part.type === "text" && "text" in part).map((part) => part.text).join("\n").trim();
    return text || "Yes. Keep going with the next highlighted step.";
  } catch (error) {
    console.error("[Specter] Failed to answer follow-up:", error);
    return "I hit a temporary issue answering that. Keep going with the highlighted next step.";
  }
}
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_turbo_v2";
let activePlayback = null;
let activeRequest = null;
let speechRunId = 0;
function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
}
async function playAudioFile(filePath) {
  if (process.platform === "darwin") {
    activePlayback = child_process.spawn("afplay", [filePath], { stdio: "ignore" });
    const child = activePlayback;
    try {
      await waitForProcess(child);
    } finally {
      if (activePlayback === child) {
        activePlayback = null;
      }
      promises.unlink(filePath).catch(() => void 0);
    }
    return;
  }
  await electron.shell.openPath(filePath);
}
async function stopSpeaking() {
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
async function speakFallback(text) {
  await stopSpeaking();
  if (!text.trim()) return;
  activePlayback = child_process.spawn("say", ["-v", "Samantha", text], { stdio: "ignore" });
  const child = activePlayback;
  try {
    await waitForProcess(child);
  } finally {
    if (activePlayback === child) {
      activePlayback = null;
    }
  }
}
async function speak(text) {
  console.log("[TTS] speak() called with:", text?.slice(0, 50));
  await stopSpeaking();
  if (!text.trim()) return;
  const runId = speechRunId;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("[Specter] ELEVENLABS_API_KEY missing; using macOS say fallback.");
    await speakFallback(text);
    return;
  }
  let request = null;
  try {
    console.log("[TTS] Calling ElevenLabs...");
    request = new AbortController();
    activeRequest = request;
    const response = await fetch(`${ELEVENLABS_API_URL}/${RACHEL_VOICE_ID}`, {
      method: "POST",
      signal: request.signal,
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
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
    });
    if (activeRequest === request) {
      activeRequest = null;
    }
    if (runId !== speechRunId) return;
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs returned ${response.status}: ${errorText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (runId !== speechRunId) return;
    const audio = Buffer.from(arrayBuffer);
    const outputDir = path.join(os.tmpdir(), "specter-tts");
    const outputPath = path.join(outputDir, `speech-${Date.now()}.mp3`);
    await promises.mkdir(outputDir, { recursive: true });
    await promises.writeFile(outputPath, audio);
    if (runId !== speechRunId) {
      promises.unlink(outputPath).catch(() => void 0);
      return;
    }
    console.log("[TTS] Audio received, playing...");
    await playAudioFile(outputPath);
  } catch (error) {
    if (activeRequest === request) {
      activeRequest = null;
    }
    if (runId !== speechRunId) return;
    console.error("[TTS] Error:", error);
    await speakFallback(text);
  }
}
async function transcribe(audioBuffer) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  console.log("[WHISPER] transcribe called, buffer size:", audioBuffer?.length);
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set in environment");
    return "";
  }
  try {
    console.log("[WHISPER] Calling OpenAI...");
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const file = new File([new Uint8Array(audioBuffer)], "audio.webm", { type: "audio/webm" });
    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1"
    });
    console.log("[WHISPER] Result:", response.text);
    return response.text || "";
  } catch (error) {
    console.error("[WHISPER] Error:", error);
    return "";
  }
}
const ARM_A = "show_once";
const ARM_B = "show_twice";
const ARM_C = "micro_steps";
const ARM_STYLE = {
  A: ARM_A,
  B: ARM_B,
  C: ARM_C
};
const ARMS = ["A", "B", "C"];
function sampleNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleGamma(shape) {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (; ; ) {
    const x = sampleNormal();
    const value = 1 + c * x;
    if (value <= 0) continue;
    const v = value * value * value;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}
function sampleBeta(alpha, beta) {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  const total = x + y;
  return total > 0 ? x / total : 0;
}
function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function normalizeBandtTuple(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  return [positiveNumber(value[0], fallback[0]), positiveNumber(value[1], fallback[1])];
}
function createDefaultBandtState() {
  return {
    A: [1, 1],
    B: [1, 1],
    C: [1, 1]
  };
}
function normalizeBandtState(bandtState) {
  const defaults = createDefaultBandtState();
  return {
    A: normalizeBandtTuple(bandtState?.A, defaults.A),
    B: normalizeBandtTuple(bandtState?.B, defaults.B),
    C: normalizeBandtTuple(bandtState?.C, defaults.C)
  };
}
function selectArm(bandtState) {
  const normalized = normalizeBandtState(bandtState);
  const samples = ARMS.map((arm) => {
    const [alpha, beta] = normalized[arm];
    return { arm, sample: sampleBeta(alpha, beta) };
  });
  samples.sort((left, right) => right.sample - left.sample);
  return samples[0].arm;
}
function recordReward(bandtState, arm, reward) {
  const normalized = normalizeBandtState(bandtState);
  const [alpha, beta] = normalized[arm];
  const updated = {
    ...normalized,
    [arm]: [alpha + reward, beta + (1 - reward)]
  };
  const winningStyle = getCurrentStyle(updated);
  console.log("[Specter] Teaching style currently winning:", winningStyle);
  return updated;
}
function getCurrentStyle(bandtState) {
  const normalized = normalizeBandtState(bandtState);
  const ranked = ARMS.map((arm) => {
    const [alpha, beta] = normalized[arm];
    return { arm, mean: alpha / (alpha + beta) };
  }).sort((left, right) => right.mean - left.mean);
  return ARM_STYLE[ranked[0].arm];
}
const DEFAULT_APP_NAME$1 = "Specter";
const STEP_ACTIONS = ["click", "type", "scroll", "wait"];
function createDefaultGraph(appName = DEFAULT_APP_NAME$1) {
  return {
    userId: process.env.SPECTER_USER_ID || "local-user",
    app: appName,
    nodes: {},
    edges: [],
    branches: {},
    sessions: [],
    bandtState: createDefaultBandtState()
  };
}
function graphPath(appName) {
  const safeName = appName.replace(/[^a-z0-9._-]/gi, "_");
  return path.join(os.homedir(), "Library", "Application Support", "Specter", `${safeName}.json`);
}
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function stringValue(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}
function nonNegativeNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}
function percentNumber(value, fallback = 50) {
  return Math.min(100, nonNegativeNumber(value, fallback));
}
function nonNegativeInteger(value, fallback = 0) {
  return Math.round(nonNegativeNumber(value, fallback));
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function normalizeAction(value) {
  return typeof value === "string" && STEP_ACTIONS.includes(value) ? value : "click";
}
function normalizeNode(nodeId, value) {
  const node = isRecord(value) ? value : {};
  return {
    id: stringValue(node.id, nodeId),
    title: stringValue(node.title, nodeId.replace(/[-_]/g, " ")),
    description: typeof node.description === "string" ? node.description : "",
    prerequisites: stringArray(node.prerequisites),
    completed: Boolean(node.completed),
    attempts: nonNegativeInteger(node.attempts),
    avgStepTimeMs: nonNegativeNumber(node.avgStepTimeMs),
    lastStepIndex: nonNegativeInteger(node.lastStepIndex)
  };
}
function normalizeEdge(value) {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string") {
    return null;
  }
  return { from: value.from, to: value.to };
}
function normalizeBranch(branchId, value) {
  const branch = isRecord(value) ? value : {};
  const forkedFrom = isRecord(branch.forkedFrom) ? branch.forkedFrom : {};
  const status = branch.status === "completed" ? "completed" : "active";
  return {
    id: stringValue(branch.id, branchId),
    forkedFrom: {
      nodeId: stringValue(forkedFrom.nodeId, ""),
      stepIndex: nonNegativeInteger(forkedFrom.stepIndex)
    },
    nodesCovered: stringArray(branch.nodesCovered),
    status
  };
}
function normalizeStep(value) {
  const step = isRecord(value) ? value : {};
  return {
    x: percentNumber(step.x),
    y: percentNumber(step.y),
    action: normalizeAction(step.action),
    typeText: typeof step.typeText === "string" ? step.typeText : void 0,
    delayMs: nonNegativeInteger(step.delayMs),
    narration: typeof step.narration === "string" ? step.narration : void 0
  };
}
function normalizeSession(sessionId, value) {
  const session = isRecord(value) ? value : {};
  return {
    id: stringValue(session.id, sessionId),
    timestamp: stringValue(session.timestamp, (/* @__PURE__ */ new Date()).toISOString()),
    nodesVisited: stringArray(session.nodesVisited),
    branchId: typeof session.branchId === "string" ? session.branchId : void 0,
    steps: Array.isArray(session.steps) ? session.steps.map(normalizeStep) : []
  };
}
function normalizeGraph(graph, appName) {
  const fallback = createDefaultGraph(appName);
  const nodes = isRecord(graph.nodes) ? Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => [id, normalizeNode(id, node)])) : fallback.nodes;
  const branches = isRecord(graph.branches) ? Object.fromEntries(Object.entries(graph.branches).map(([id, branch]) => [id, normalizeBranch(id, branch)])) : fallback.branches;
  const edges = Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge).filter((edge) => Boolean(edge)) : fallback.edges;
  const sessions = Array.isArray(graph.sessions) ? graph.sessions.map((session, index) => normalizeSession(`session-${index + 1}`, session)) : fallback.sessions;
  return {
    ...fallback,
    ...graph,
    userId: typeof graph.userId === "string" && graph.userId.trim() ? graph.userId : fallback.userId,
    app: typeof graph.app === "string" && graph.app.trim() ? graph.app : appName,
    nodes,
    edges,
    branches,
    sessions,
    bandtState: normalizeBandtState(graph.bandtState)
  };
}
function loadGraph(appName = DEFAULT_APP_NAME$1) {
  const filePath = graphPath(appName);
  if (!fs.existsSync(filePath)) {
    return createDefaultGraph(appName);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeGraph(parsed, appName);
  } catch (error) {
    console.error("[Specter] Failed to load learning graph:", error);
    return createDefaultGraph(appName);
  }
}
function saveGraph(graph) {
  const filePath = graphPath(graph.app || DEFAULT_APP_NAME$1);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeGraph(graph, graph.app), null, 2) + "\n", "utf8");
}
function cloneGraph$1(graph) {
  return {
    ...graph,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([id, node]) => [id, { ...node, prerequisites: [...node.prerequisites] }])
    ),
    edges: graph.edges.map((edge) => ({ ...edge })),
    branches: Object.fromEntries(
      Object.entries(graph.branches).map(([id, branch]) => [
        id,
        {
          ...branch,
          forkedFrom: { ...branch.forkedFrom },
          nodesCovered: [...branch.nodesCovered]
        }
      ])
    ),
    sessions: graph.sessions.map((session) => ({
      ...session,
      nodesVisited: [...session.nodesVisited],
      steps: session.steps.map((step) => ({ ...step }))
    })),
    bandtState: {
      A: [...graph.bandtState.A],
      B: [...graph.bandtState.B],
      C: [...graph.bandtState.C]
    }
  };
}
function defaultNode$1(nodeId) {
  return {
    id: nodeId,
    title: nodeId.replace(/[-_]/g, " "),
    description: "",
    prerequisites: [],
    completed: false,
    attempts: 0,
    avgStepTimeMs: 0,
    lastStepIndex: 0
  };
}
function markNodeComplete(graph, nodeId) {
  const next = cloneGraph$1(graph);
  const currentNode = next.nodes[nodeId] || defaultNode$1(nodeId);
  next.nodes[nodeId] = {
    ...currentNode,
    completed: true,
    lastStepIndex: Math.max(currentNode.lastStepIndex, 0)
  };
  for (const branch of Object.values(next.branches)) {
    if (branch.status === "active" && branch.nodesCovered.includes(nodeId)) {
      branch.status = "completed";
    }
  }
  return next;
}
function createBranch(graph, fromNodeId, fromStep) {
  const next = cloneGraph$1(graph);
  const branchId = crypto.randomUUID();
  const branch = {
    id: branchId,
    forkedFrom: { nodeId: fromNodeId, stepIndex: fromStep },
    nodesCovered: [fromNodeId],
    status: "active"
  };
  next.branches[branchId] = branch;
  return { graph: next, branchId };
}
function getAvailableNodes(graph) {
  return Object.values(graph.nodes).filter(
    (node) => node.prerequisites.every((prerequisite) => graph.nodes[prerequisite]?.completed)
  );
}
function getNextRecommendedNode(graph) {
  const candidates = getAvailableNodes(graph).filter((node) => !node.completed).sort((left, right) => {
    if (left.attempts !== right.attempts) {
      return left.attempts - right.attempts;
    }
    return left.title.localeCompare(right.title);
  });
  return candidates[0] || null;
}
function getResumePrompt(graph) {
  const completed = Object.values(graph.nodes).filter((node) => node.completed);
  const inProgress = Object.values(graph.nodes).find((node) => !node.completed && node.lastStepIndex > 0);
  const lastSession = graph.sessions.length > 0 ? graph.sessions[graph.sessions.length - 1] : null;
  if (!lastSession && completed.length === 0) {
    return "Welcome to Specter. Tell me what you want to learn first.";
  }
  if (inProgress) {
    return `Welcome back. You completed ${completed.length} ${completed.length === 1 ? "skill" : "skills"}. Resume ${inProgress.title} at step ${inProgress.lastStepIndex + 1}.`;
  }
  return `Welcome back. You completed ${completed.length} ${completed.length === 1 ? "skill" : "skills"}. Pick a new level when you are ready.`;
}
let activeRecording = null;
function cloneGraph(graph) {
  return {
    ...graph,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([id, node]) => [id, { ...node, prerequisites: [...node.prerequisites] }])
    ),
    edges: graph.edges.map((edge) => ({ ...edge })),
    branches: Object.fromEntries(
      Object.entries(graph.branches).map(([id, branch]) => [
        id,
        {
          ...branch,
          forkedFrom: { ...branch.forkedFrom },
          nodesCovered: [...branch.nodesCovered]
        }
      ])
    ),
    sessions: graph.sessions.map((session) => ({
      ...session,
      nodesVisited: [...session.nodesVisited],
      steps: session.steps.map((step) => ({ ...step }))
    })),
    bandtState: {
      A: [...graph.bandtState.A],
      B: [...graph.bandtState.B],
      C: [...graph.bandtState.C]
    }
  };
}
function defaultNode(nodeId) {
  return {
    id: nodeId,
    title: nodeId.replace(/[-_]/g, " "),
    description: "",
    prerequisites: [],
    completed: false,
    attempts: 0,
    avgStepTimeMs: 0,
    lastStepIndex: 0
  };
}
function averageStepTime(steps) {
  const timings = steps.map((s) => s.delayMs).filter((d) => typeof d === "number" && d > 0);
  if (timings.length === 0) return 0;
  return timings.reduce((a, b) => a + b, 0) / timings.length;
}
function normalizeRecordedStep(step) {
  return {
    ...step,
    x: Number.isFinite(step.x) ? Math.min(100, Math.max(0, step.x)) : 50,
    y: Number.isFinite(step.y) ? Math.min(100, Math.max(0, step.y)) : 50,
    delayMs: Number.isFinite(step.delayMs) ? Math.max(0, Math.round(step.delayMs)) : 0
  };
}
function startRecording() {
  activeRecording = [];
}
function recordStep(step) {
  if (!activeRecording) activeRecording = [];
  activeRecording.push(normalizeRecordedStep(step));
}
function stopRecording() {
  const steps = activeRecording ? [...activeRecording] : [];
  activeRecording = null;
  return steps;
}
function saveToNode(graph, nodeId, steps) {
  const next = cloneGraph(graph);
  const currentNode = next.nodes[nodeId] || defaultNode(nodeId);
  const normalizedSteps = steps.map(normalizeRecordedStep);
  const avgStepTimeMs = averageStepTime(normalizedSteps);
  const activeBranch = Object.values(next.branches).find((b) => b.status === "active");
  if (activeBranch && !activeBranch.nodesCovered.includes(nodeId)) {
    activeBranch.nodesCovered.push(nodeId);
  }
  next.nodes[nodeId] = {
    ...currentNode,
    attempts: currentNode.attempts + 1,
    avgStepTimeMs: currentNode.attempts === 0 ? avgStepTimeMs : (currentNode.avgStepTimeMs * currentNode.attempts + avgStepTimeMs) / (currentNode.attempts + 1),
    lastStepIndex: Math.max(0, normalizedSteps.length - 1)
  };
  next.sessions.push({
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    nodesVisited: [nodeId],
    branchId: activeBranch?.id,
    steps: normalizedSteps
  });
  return next;
}
let getOverlayWindow = () => null;
let activeReplay = null;
function createReplayController() {
  stopReplay();
  const controller = {
    cancelled: false,
    cancelHandlers: /* @__PURE__ */ new Set()
  };
  activeReplay = controller;
  return controller;
}
function cancelReplay(controller) {
  if (controller.cancelled) return;
  controller.cancelled = true;
  for (const handler of controller.cancelHandlers) {
    handler();
  }
  controller.cancelHandlers.clear();
}
function isActive(controller) {
  return activeReplay === controller && !controller.cancelled;
}
function sleep(ms, controller) {
  if (controller.cancelled) return Promise.resolve(false);
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => settle(true), ms);
    const settle = (completed) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      controller.cancelHandlers.delete(cancel);
      resolve(completed && !controller.cancelled);
    };
    const cancel = () => settle(false);
    controller.cancelHandlers.add(cancel);
  });
}
function sendOverlay(channel, payload) {
  const overlayWindow2 = getOverlayWindow();
  if (!overlayWindow2 || overlayWindow2.isDestroyed()) return;
  overlayWindow2.webContents.send(channel, payload);
}
function setOverlayForReplay() {
  const overlayWindow2 = getOverlayWindow();
  if (!overlayWindow2 || overlayWindow2.isDestroyed()) return;
  if (!overlayWindow2.isVisible()) overlayWindow2.show();
  overlayWindow2.setIgnoreMouseEvents(true, { forward: true });
}
function waitForUserAtTarget(step, controller, timeoutMs = 45e3) {
  if (controller.cancelled) return Promise.resolve("cancelled");
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => settle(controller.cancelled ? "cancelled" : "timeout"), timeoutMs);
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      controller.cancelHandlers.delete(cancel);
      resolve(result);
    };
    const cancel = () => settle("cancelled");
    controller.cancelHandlers.add(cancel);
    waitForMouseAtTarget(step.x, step.y, 50, timeoutMs).then((result) => {
      settle(result === "correct" ? "correct" : "timeout");
    });
  });
}
function stepsForNode(nodeId, appName) {
  const graph = loadGraph(appName);
  const sessions = nodeId ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId)) : graph.sessions.filter((s) => s.steps.length > 0);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}
function stopReplay() {
  if (activeReplay) {
    cancelReplay(activeReplay);
  }
  activeReplay = null;
  sendOverlay("replay:stopped", {});
}
async function replayWalkthrough(steps, onStep) {
  const controller = createReplayController();
  setOverlayForReplay();
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      let result = "timeout";
      let attempts = 0;
      while (result !== "correct" && isActive(controller)) {
        const channel = attempts === 0 ? "replay:step" : "replay:retry";
        sendOverlay(channel, { step, index, total: steps.length, reason: result });
        if (attempts === 0) onStep(step, index);
        if (step.action !== "wait") {
          await ghostMove(step.x, step.y, 600);
        }
        result = await waitForUserAtTarget(step, controller);
        if (result === "timeout") attempts++;
      }
    }
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
  } finally {
    if (activeReplay === controller) activeReplay = null;
  }
}
async function replayAutoExecute(steps) {
  const controller = createReplayController();
  setOverlayForReplay();
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      if (step.action === "click") {
        if (!await sleep(step.delayMs || 0, controller)) break;
        await ghostClick(step.x, step.y);
      } else if (step.action === "wait") {
        if (!await sleep(step.delayMs || 500, controller)) break;
      } else {
        if (!await sleep(step.delayMs || 0, controller)) break;
        await executeSteps([{ ...step, delayMs: 0 }]);
      }
      sendOverlay("replay:progress", { index, total: steps.length });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    if (activeReplay === controller) activeReplay = null;
  }
}
function registerReplayIpc(ipcMain, windowProvider, appName = "Specter") {
  getOverlayWindow = windowProvider;
  ipcMain.handle("replay:walkthrough", async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName);
    await replayWalkthrough(steps, () => {
    });
  });
  ipcMain.handle("replay:auto", async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName);
    await replayAutoExecute(steps);
  });
  ipcMain.handle("replay:stop", async () => {
    stopReplay();
  });
}
const icon = path.join(__dirname, "../../resources/icon.png");
const DEFAULT_APP_NAME = "Specter";
let mainWindow = null;
let overlayWindow = null;
function isLearningGraph(value) {
  return Boolean(
    value && typeof value === "object" && "userId" in value && "app" in value && "nodes" in value && "sessions" in value && "bandtState" in value
  );
}
function toggleOverlay() {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.show();
  }
  overlayWindow.webContents.send("overlay:toggle");
}
let lastShiftTime = 0;
const DOUBLE_TAP_MS = 300;
uiohookNapi.uIOhook.on("keydown", (e) => {
  if (e.keycode === uiohookNapi.UiohookKey.Shift || e.keycode === uiohookNapi.UiohookKey.ShiftRight) {
    const now = Date.now();
    if (now - lastShiftTime < DOUBLE_TAP_MS) {
      toggleOverlay();
      lastShiftTime = 0;
    } else {
      lastShiftTime = now;
    }
  }
});
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createOverlayWindow() {
  overlayWindow = new electron.BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.on("ready-to-show", () => {
    overlayWindow?.hide();
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    overlayWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../renderer/overlay.html"));
  }
}
electron.app.whenReady().then(async () => {
  utils.electronApp.setAppUserModelId("com.electron");
  const granted = await checkPermissions();
  if (!granted) return;
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  createOverlayWindow();
  if (!electron.app.isPackaged) {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
    overlayWindow?.webContents.openDevTools({ mode: "detach" });
    electron.globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
    });
  }
  uiohookNapi.uIOhook.start();
  electron.ipcMain.on("overlay:hide", () => {
    if (!overlayWindow) return;
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
  });
  electron.ipcMain.handle("cursor:move", async (_event, x, y, durationMs) => {
    console.log("[IPC] cursor:move", { x, y, durationMs });
    return ghostMove(x, y, durationMs);
  });
  electron.ipcMain.handle("cursor:click", async (_event, x, y) => ghostClick(x, y));
  electron.ipcMain.handle("cursor:replay", async (_event, steps) => executeSteps(steps));
  electron.ipcMain.handle("cursor:getPosition", async () => getPhysicalMousePosition());
  electron.ipcMain.handle("cursor:waitForTarget", async (_event, x, y, tolerancePx = 50, timeoutMs = 45e3) => {
    console.log("[IPC] cursor:waitForTarget", { x, y, tolerancePx, timeoutMs });
    return waitForMouseAtTarget(x, y, tolerancePx, timeoutMs);
  });
  electron.ipcMain.handle("overlay:setClickThrough", async (_event, clickThrough) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  });
  electron.ipcMain.handle("screen:capture", async (event) => {
    console.log("[IPC] screen:capture");
    try {
      return await captureScreenBase64();
    } catch (err) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        event.sender.send("permissions:screen-denied");
      }
      throw err;
    }
  });
  electron.ipcMain.handle("screen:analyze", async (event, base64PNG) => {
    console.log("[IPC] screen:analyze", { hasBase64: !!base64PNG });
    try {
      const screenshot = base64PNG || await captureScreenBase64();
      return analyzeScreen(screenshot);
    } catch (err) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        event.sender.send("permissions:screen-denied");
      }
      throw err;
    }
  });
  electron.ipcMain.handle("planner:plan", async (_event, userIntent, screenState, sessionHistory, mode) => {
    console.log("[IPC] planner:plan", { userIntent, mode });
    return planSteps(userIntent, screenState, sessionHistory, mode);
  });
  electron.ipcMain.handle(
    "planner:converse",
    async (_event, userMessage, screenState, conversationHistory) => converse(userMessage, screenState, conversationHistory)
  );
  electron.ipcMain.handle("session:save", async (_event, graph) => {
    if (isLearningGraph(graph)) {
      saveGraph(graph);
      return graph;
    }
    return loadGraph(DEFAULT_APP_NAME);
  });
  electron.ipcMain.handle("session:load", async (_event, appName = DEFAULT_APP_NAME) => loadGraph(appName));
  electron.ipcMain.handle(
    "session:resume-prompt",
    async (_event, appName = DEFAULT_APP_NAME) => getResumePrompt(loadGraph(appName))
  );
  electron.ipcMain.handle("session:record-start", async () => startRecording());
  electron.ipcMain.handle("session:record-step", async (_event, step) => recordStep(step));
  electron.ipcMain.handle("session:record-stop", async () => stopRecording());
  electron.ipcMain.handle("session:save-node", async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
    const graph = saveToNode(loadGraph(appName), nodeId, steps);
    saveGraph(graph);
    return graph;
  });
  electron.ipcMain.handle("session:mark-complete", async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = markNodeComplete(loadGraph(appName), nodeId);
    saveGraph(graph);
    return graph;
  });
  electron.ipcMain.handle("session:create-branch", async (_event, fromNodeId, fromStep, appName = DEFAULT_APP_NAME) => {
    const result = createBranch(loadGraph(appName), fromNodeId, fromStep);
    saveGraph(result.graph);
    return result;
  });
  electron.ipcMain.handle(
    "session:next-node",
    async (_event, appName = DEFAULT_APP_NAME) => getNextRecommendedNode(loadGraph(appName))
  );
  electron.ipcMain.handle(
    "session:available-nodes",
    async (_event, appName = DEFAULT_APP_NAME) => getAvailableNodes(loadGraph(appName))
  );
  electron.ipcMain.handle(
    "bandit:select",
    async (_event, appName = DEFAULT_APP_NAME) => selectArm(loadGraph(appName).bandtState)
  );
  electron.ipcMain.handle("bandit:reward", async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    graph.bandtState = recordReward(graph.bandtState, arm, reward);
    saveGraph(graph);
    return { bandtState: graph.bandtState, style: getCurrentStyle(graph.bandtState) };
  });
  electron.ipcMain.handle(
    "bandit:style",
    async (_event, appName = DEFAULT_APP_NAME) => getCurrentStyle(loadGraph(appName).bandtState)
  );
  electron.ipcMain.handle("tts:speak", async (_event, text) => {
    console.log("[IPC] tts:speak", { text: text?.slice(0, 50) });
    return speak(text);
  });
  electron.ipcMain.handle("tts:stop", async () => stopSpeaking());
  electron.ipcMain.handle("whisper:transcribe", async (_event, audioData) => {
    console.log("[IPC] whisper:transcribe", { size: audioData?.byteLength });
    const buffer = Buffer.from(audioData);
    return transcribe(buffer);
  });
  registerReplayIpc(electron.ipcMain, () => overlayWindow);
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
      if (!electron.app.isPackaged) {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
        overlayWindow?.webContents.openDevTools({ mode: "detach" });
      }
    }
  });
});
electron.app.on("will-quit", () => {
  uiohookNapi.uIOhook.stop();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
