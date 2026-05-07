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
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const { getAuthStatus, askForAccessibilityAccess } = pkg;
const ACCESSIBILITY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
function sleep$3(ms) {
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
      await sleep$3(500);
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
function clampPercent(value) {
  return Math.min(100, Math.max(0, value));
}
async function toScreenPoint(x, y) {
  const primary = electron.screen.getPrimaryDisplay();
  const { width: logicalW, height: logicalH } = primary.size;
  const scale = primary.scaleFactor;
  const pixelX = Math.round(clampPercent(x) / 100 * logicalW * scale);
  const pixelY = Math.round(clampPercent(y) / 100 * logicalH * scale);
  return new nutJs.Point(pixelX, pixelY);
}
const DEFAULT_MOVE_DURATION_MS = 650;
function sleep$2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
async function moveRealMouse(x, y, durationMs = DEFAULT_MOVE_DURATION_MS) {
  console.log("[AUTO_REAL_MOUSE] moveRealMouse invoked REAL OS cursor automation", { x, y, durationMs });
  try {
    const target = await toScreenPoint(x, y);
    console.log("[AUTO_REAL_MOUSE] physical target pixels", { x: target.x, y: target.y });
    const current = await nutJs.mouse.getPosition();
    const distance = Math.max(1, Math.hypot(target.x - current.x, target.y - current.y));
    const previousSpeed = nutJs.mouse.config.mouseSpeed;
    const durationSeconds = Math.max(0.05, durationMs / 1e3);
    nutJs.mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds);
    try {
      await nutJs.mouse.move(nutJs.straightTo(target), easeInOutCubic);
      console.log("[AUTO_REAL_MOUSE] nut-js REAL OS move complete");
    } finally {
      nutJs.mouse.config.mouseSpeed = previousSpeed;
    }
  } catch (error) {
    console.error("[AUTO_REAL_MOUSE] nut-js REAL OS automation error:", error);
    throw cursorPermissionError(error);
  }
}
async function clickRealMouse(x, y) {
  try {
    console.log("[AUTO_REAL_MOUSE] clickRealMouse invoked REAL OS cursor automation", { x, y });
    await moveRealMouse(x, y);
    await nutJs.mouse.click(nutJs.Button.LEFT);
    console.log("[AUTO_REAL_MOUSE] nut-js REAL OS click complete", { x, y });
  } catch (error) {
    throw cursorPermissionError(error);
  }
}
async function executeRealMouseSteps(steps) {
  console.log("[AUTO_REAL_MOUSE] executeRealMouseSteps invoked REAL OS automation", { totalSteps: steps.length });
  for (const [index, step] of steps.entries()) {
    console.log("[AUTO_REAL_MOUSE] executing real cursor step", {
      index,
      action: step.action,
      x: step.x,
      y: step.y
    });
    if (step.action !== "wait" && step.delayMs) {
      await sleep$2(step.delayMs);
    }
    switch (step.action) {
      case "click":
        await clickRealMouse(step.x, step.y);
        break;
      case "type":
        await moveRealMouse(step.x, step.y);
        if (step.typeText) {
          await nutJs.keyboard.type(step.typeText);
        }
        break;
      case "scroll":
        await moveRealMouse(step.x, step.y);
        await nutJs.mouse.scrollDown(3);
        break;
      case "wait":
        await sleep$2(step.waitForMs || step.delayMs || 500);
        break;
    }
  }
}
function sleep$1(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function userCursorPermissionError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Specter could not monitor the macOS cursor. Grant Accessibility and Input Monitoring permissions to this app in System Settings > Privacy & Security, then retry. Original error: ${detail}`
  );
}
async function getPhysicalMousePosition() {
  try {
    const pos = await nutJs.mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
async function getPhysicalMousePercent() {
  try {
    const pos = await nutJs.mouse.getPosition();
    const primary = electron.screen.getPrimaryDisplay();
    const { width: logicalW, height: logicalH } = primary.size;
    const scale = primary.scaleFactor;
    return {
      x: clampPercent(pos.x / (logicalW * scale) * 100),
      y: clampPercent(pos.y / (logicalH * scale) * 100)
    };
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
async function waitForMouseAtTarget(targetPercentX, targetPercentY, tolerancePx, timeoutMs, signal) {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) return "cancelled";
      const pos = await nutJs.mouse.getPosition();
      const dx = pos.x - target.x;
      const dy = pos.y - target.y;
      if (Math.hypot(dx, dy) <= tolerancePx) {
        console.log("[USER_CURSOR] entered target tolerance", {
          targetPercentX,
          targetPercentY,
          tolerancePx,
          cursorX: pos.x,
          cursorY: pos.y
        });
        return "correct";
      }
      await sleep$1(100);
    }
    console.warn("[USER_CURSOR] target tolerance wait timed out", { targetPercentX, targetPercentY, tolerancePx, timeoutMs });
    return "timeout";
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
async function currentMousePositionOrEvent(event) {
  try {
    const pos = await nutJs.mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch {
    return { x: event.x, y: event.y };
  }
}
async function waitForUserClickAtTarget(targetPercentX, targetPercentY, tolerancePx, timeoutMs, signal) {
  try {
    const target = await toScreenPoint(targetPercentX, targetPercentY);
    return await new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => settle(signal?.aborted ? "cancelled" : "timeout"), timeoutMs);
      const settle = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        uiohookNapi.uIOhook.off("click", onClick);
        signal?.removeEventListener("abort", onAbort);
        if (result === "timeout") {
          console.warn("[CLICK_DETECT] timed out waiting for user click", {
            targetPercentX,
            targetPercentY,
            tolerancePx,
            timeoutMs
          });
        }
        resolve(result);
      };
      const onAbort = () => settle("cancelled");
      const onClick = (event) => {
        void currentMousePositionOrEvent(event).then((pos) => {
          const dx = pos.x - target.x;
          const dy = pos.y - target.y;
          const distancePx = Math.hypot(dx, dy);
          console.log("[CLICK_DETECT] click observed", {
            targetPercentX,
            targetPercentY,
            tolerancePx,
            cursorX: pos.x,
            cursorY: pos.y,
            distancePx
          });
          if (distancePx <= tolerancePx) {
            console.log("[CLICK_DETECT] click detected inside target tolerance", {
              targetPercentX,
              targetPercentY,
              tolerancePx
            });
            settle("correct");
          }
        }).catch(() => void 0);
      };
      if (signal?.aborted) {
        settle("cancelled");
        return;
      }
      console.log("[CLICK_DETECT] armed user click detector", { targetPercentX, targetPercentY, tolerancePx, timeoutMs });
      signal?.addEventListener("abort", onAbort, { once: true });
      uiohookNapi.uIOhook.on("click", onClick);
    });
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
function anthropicClient$1() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return null;
  }
  return new Anthropic({ apiKey: key });
}
function fallbackScreenState() {
  return {
    app: "Unknown",
    coordinates: []
  };
}
function percent(value, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}
function normalizeScreenState(value) {
  if (!value || typeof value !== "object") {
    return fallbackScreenState();
  }
  const coordinates = Array.isArray(value.coordinates) ? value.coordinates.filter((item) => item && typeof item === "object").map((item) => ({
    label: typeof item.label === "string" && item.label.trim() ? item.label : "Untitled target",
    x: percent(item.x ?? item.targetX),
    y: percent(item.y ?? item.targetY)
  })) : [];
  return {
    app: typeof value.app === "string" && value.app.trim() ? value.app : "Unknown",
    coordinates
  };
}
async function analyzeScreen(base64PNG) {
  console.log("[SCREENER] Got base64, length:", base64PNG?.length);
  const anthropic = anthropicClient$1();
  if (!base64PNG) {
    console.warn("[Specter] No screenshot provided; using screen analysis fallback.");
    return fallbackScreenState();
  }
  if (!anthropic) {
    console.warn("[Specter] ANTHROPIC_API_KEY missing; skipping screen analysis.");
    return fallbackScreenState();
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
    const textParts = message.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n");
    if (textParts) {
      console.log("[SCREENER] Raw response:", textParts);
      const cleanJson = textParts.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[SCREENER] Parsed state:", JSON.stringify(parsed));
        return normalizeScreenState(parsed);
      }
    }
    return fallbackScreenState();
  } catch (error) {
    console.error("[SCREENER] Error:", error);
    return fallbackScreenState();
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
function normalizeMode(mode) {
  return mode === "ultra" ? "ultra" : "silent";
}
function coordinatesFrom(screenState) {
  if (!screenState || typeof screenState !== "object" || !Array.isArray(screenState.coordinates)) {
    return [];
  }
  return screenState.coordinates.filter((item) => item && typeof item === "object").map((item) => ({
    label: typeof item.label === "string" && item.label.trim() ? item.label : "target",
    x: clampCoordinate(item.x ?? item.targetX, 50),
    y: clampCoordinate(item.y ?? item.targetY, 50)
  }));
}
function safeScreenState(screenState) {
  return {
    app: screenState && typeof screenState === "object" && typeof screenState.app === "string" && screenState.app.trim() ? screenState.app : "Unknown",
    coordinates: coordinatesFrom(screenState)
  };
}
function findCoordinate(coordinates, pattern) {
  return coordinates.find((item) => pattern.test(item.label));
}
function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : void 0;
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
      const partial = step && typeof step === "object" ? step : {};
      const fallbackStep = fallback.steps[Math.min(index, fallback.steps.length - 1)];
      const waitForMs = numberOrUndefined(partial.waitForMs) ?? numberOrUndefined(partial.delayMs) ?? numberOrUndefined(fallbackStep.waitForMs) ?? numberOrUndefined(fallbackStep.delayMs);
      return {
        id: typeof partial.id === "string" ? partial.id : `step-${index + 1}`,
        instruction: typeof partial.instruction === "string" && partial.instruction.trim() ? partial.instruction : fallbackStep.instruction,
        targetLabel: typeof partial.targetLabel === "string" && partial.targetLabel.trim() ? partial.targetLabel : fallbackStep.targetLabel,
        x: clampCoordinate(partial.x ?? partial.targetX, fallbackStep.x),
        y: clampCoordinate(partial.y ?? partial.targetY, fallbackStep.y),
        action: isStepAction(partial.action) ? partial.action : fallbackStep.action,
        typeText: typeof partial.typeText === "string" ? partial.typeText : void 0,
        delayMs: numberOrUndefined(partial.delayMs),
        waitForMs
      };
    })
  };
}
function fallbackSequence(userIntent, screenState, mode) {
  const coordinates = coordinatesFrom(screenState);
  const short = normalizeMode(mode) === "silent";
  if (/blender/i.test(userIntent) && /mesh/i.test(userIntent)) {
    const addMenu = findCoordinate(coordinates, /add/i);
    const meshItem = findCoordinate(coordinates, /mesh/i);
    const cubeItem = findCoordinate(coordinates, /cube/i);
    const moveTool = findCoordinate(coordinates, /move/i);
    return {
      levelTitle: "Add a Mesh in Blender",
      estimatedMinutes: 2,
      steps: [
        {
          id: "open-add-menu",
          instruction: short ? "Open Add." : "Start with the Add menu in the top-left.",
          targetLabel: "Add menu",
          x: addMenu?.x ?? 4,
          y: addMenu?.y ?? 3,
          action: "click"
        },
        {
          id: "choose-mesh",
          instruction: short ? "Choose Mesh." : "Now choose Mesh from that menu.",
          targetLabel: "Mesh",
          x: meshItem?.x ?? 6,
          y: meshItem?.y ?? 14,
          action: "click"
        },
        {
          id: "choose-cube",
          instruction: short ? "Select Cube." : "Pick Cube as your first simple mesh.",
          targetLabel: "Cube",
          x: cubeItem?.x ?? 10,
          y: cubeItem?.y ?? 20,
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
          x: moveTool?.x ?? 2,
          y: moveTool?.y ?? 24,
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
  const normalizedMode = normalizeMode(mode);
  const normalizedScreenState = safeScreenState(screenState);
  const normalizedHistory = Array.isArray(sessionHistory) ? sessionHistory : [];
  const normalizedIntent = typeof userIntent === "string" && userIntent.trim() ? userIntent : "Specter Tutorial";
  console.log("[PLANNER] Intent:", normalizedIntent);
  console.log("[PLANNER] Mode:", normalizedMode);
  console.log("[PLANNER] Screen app detected:", normalizedScreenState.app);
  const fallback = fallbackSequence(normalizedIntent, normalizedScreenState, normalizedMode);
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
              screenState: normalizedScreenState,
              sessionHistory: normalizedHistory,
              mode: normalizedMode,
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
    const rawText = message.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n");
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
    const text = message.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n").trim();
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
    id: typeof step.id === "string" ? step.id : void 0,
    instruction: typeof step.instruction === "string" ? step.instruction : void 0,
    targetLabel: typeof step.targetLabel === "string" ? step.targetLabel : void 0,
    x: percentNumber(step.x ?? step.targetX),
    y: percentNumber(step.y ?? step.targetY),
    action: normalizeAction(step.action),
    typeText: typeof step.typeText === "string" ? step.typeText : void 0,
    delayMs: nonNegativeInteger(step.delayMs),
    waitForMs: nonNegativeInteger(step.waitForMs),
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
    id: typeof step.id === "string" ? step.id : void 0,
    instruction: typeof step.instruction === "string" ? step.instruction : void 0,
    targetLabel: typeof step.targetLabel === "string" ? step.targetLabel : void 0,
    x: Number.isFinite(step.x) ? Math.min(100, Math.max(0, step.x)) : 50,
    y: Number.isFinite(step.y) ? Math.min(100, Math.max(0, step.y)) : 50,
    action: ["click", "type", "scroll", "wait"].includes(step.action) ? step.action : "click",
    typeText: typeof step.typeText === "string" ? step.typeText : void 0,
    delayMs: Number.isFinite(step.delayMs) ? Math.max(0, Math.round(step.delayMs)) : 0,
    waitForMs: Number.isFinite(step.waitForMs) ? Math.max(0, Math.round(step.waitForMs)) : void 0,
    narration: typeof step.narration === "string" ? step.narration : void 0
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
function setReplayWindowProvider(windowProvider) {
  getOverlayWindow = windowProvider;
}
function createReplayController() {
  stopReplay();
  const overlayWindow2 = getOverlayWindow();
  const controller = {
    cancelled: false,
    cancelHandlers: /* @__PURE__ */ new Set(),
    overlayWasVisible: Boolean(overlayWindow2?.isVisible())
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
function releaseReplayController(controller) {
  if (activeReplay === controller) activeReplay = null;
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
function restoreOverlayAfterReplay(controller) {
  const overlayWindow2 = getOverlayWindow();
  if (!overlayWindow2 || overlayWindow2.isDestroyed()) return;
  if (controller.overlayWasVisible && overlayWindow2.isVisible()) {
    overlayWindow2.setIgnoreMouseEvents(false);
    return;
  }
  overlayWindow2.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow2.hide();
}
function stopReplay() {
  const hadActiveReplay = Boolean(activeReplay);
  if (activeReplay) {
    cancelReplay(activeReplay);
  }
  activeReplay = null;
  if (hadActiveReplay) {
    sendOverlay("replay:stopped", {});
  }
}
const DEFAULT_WAIT_STEP_MS$1 = 800;
function stepWaitMs$1(step) {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS$1;
}
function stepTitle$1(step) {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}
async function replayAutoExecute(steps) {
  const controller = createReplayController();
  setOverlayForReplay();
  console.log("[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION", { totalSteps: steps.length });
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      console.log("[AUTO_REAL_MOUSE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle$1(step),
        action: step.action,
        x: step.x,
        y: step.y
      });
      if (step.action === "click") {
        if (!await sleep(step.delayMs || 0, controller)) break;
        console.log("[AUTO_REAL_MOUSE] REAL OS move/click", { index, x: step.x, y: step.y });
        await clickRealMouse(step.x, step.y);
      } else if (step.action === "wait") {
        const waitMs = stepWaitMs$1(step);
        console.log("[AUTO_REAL_MOUSE] wait before next real OS action", { index, waitMs });
        if (!await sleep(waitMs, controller)) break;
      } else {
        if (!await sleep(step.delayMs || 0, controller)) break;
        console.log("[AUTO_REAL_MOUSE] REAL OS action replay", {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText)
        });
        await executeRealMouseSteps([{ ...step, delayMs: 0 }]);
      }
      console.log("[AUTO_REAL_MOUSE] real mouse step complete", { index, action: step.action });
      sendOverlay("replay:progress", { index, total: steps.length });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    console.log("[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED", { cancelled: controller.cancelled });
  }
}
let walkthroughSafetyChecked = false;
function functionSource(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  if (start === -1) return "";
  const bodyStart = source.indexOf("{", start);
  if (bodyStart === -1) return "";
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}
function assertWalkthroughReplaySafety() {
  if (walkthroughSafetyChecked || process.env.NODE_ENV === "production") return;
  walkthroughSafetyChecked = true;
  const replayPath = path__namespace.join(process.cwd(), "src/main/session/replay.ts");
  if (!fs__namespace.existsSync(replayPath)) return;
  const source = fs__namespace.readFileSync(replayPath, "utf-8");
  const walkthroughBody = functionSource(source, "replayWalkthrough");
  const forbiddenImport = source.match(/from\s+['"](\.\.\/cursor|\.\/cursor)['"]|@nut-tree-fork\/nut-js/);
  const forbiddenCall = walkthroughBody.match(
    /\b(moveRealMouse|clickRealMouse|executeRealMouseSteps|mouse\.(move|click|scrollDown|scrollUp)|keyboard\.type|straightTo|Button\.LEFT)\b/
  );
  if (forbiddenImport || forbiddenCall) {
    throw new Error(
      `[WALKTHROUGH] DEV SAFETY GUARD: replayWalkthrough must not import or call real mouse automation. Matched: ${forbiddenImport?.[0] || forbiddenCall?.[0]}`
    );
  }
}
const DEFAULT_STEP_TIMEOUT_MS = 12e3;
const DEFAULT_WAIT_STEP_MS = 800;
const MAX_WALKTHROUGH_ATTEMPTS = 2;
const TARGET_APPROACH_TOLERANCE_PX = 50;
const TARGET_CLICK_TOLERANCE_PX = 60;
function stepTitle(step) {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}
function stepWaitMs(step) {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS;
}
function fallbackGhostStart(step, previousTarget) {
  if (previousTarget) return previousTarget;
  const offsetX = step.x > 58 ? -18 : 18;
  const offsetY = step.y > 58 ? -12 : 12;
  return {
    x: Math.min(96, Math.max(4, step.x + offsetX)),
    y: Math.min(96, Math.max(4, step.y + offsetY))
  };
}
async function ghostStartForStep(step, previousTarget) {
  try {
    return await getPhysicalMousePercent();
  } catch (error) {
    console.warn("[GHOST] could not read physical cursor for ghost start; using fallback", error);
    return fallbackGhostStart(step, previousTarget);
  }
}
function waitForUserNearTarget(step, controller, timeoutMs = DEFAULT_STEP_TIMEOUT_MS) {
  if (controller.cancelled) return Promise.resolve("cancelled");
  return new Promise((resolve) => {
    let settled = false;
    const abort = new AbortController();
    const timeout = setTimeout(() => settle(controller.cancelled ? "cancelled" : "timeout"), timeoutMs);
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abort.abort();
      controller.cancelHandlers.delete(cancel);
      resolve(result);
    };
    const cancel = () => settle("cancelled");
    controller.cancelHandlers.add(cancel);
    waitForMouseAtTarget(step.x, step.y, TARGET_APPROACH_TOLERANCE_PX, timeoutMs, abort.signal).then((result) => {
      settle(result);
    }).catch((error) => {
      console.error("[USER_CURSOR] waitForMouseAtTarget failed", error);
      settle("timeout");
    });
  });
}
function waitForUserClickOnTarget(step, controller, timeoutMs = DEFAULT_STEP_TIMEOUT_MS) {
  if (controller.cancelled) return Promise.resolve("cancelled");
  return new Promise((resolve) => {
    let settled = false;
    const abort = new AbortController();
    const timeout = setTimeout(() => settle(controller.cancelled ? "cancelled" : "timeout"), timeoutMs);
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abort.abort();
      controller.cancelHandlers.delete(cancel);
      resolve(result);
    };
    const cancel = () => settle("cancelled");
    controller.cancelHandlers.add(cancel);
    waitForUserClickAtTarget(step.x, step.y, TARGET_CLICK_TOLERANCE_PX, timeoutMs, abort.signal).then((result) => {
      settle(result);
    }).catch((error) => {
      console.error("[CLICK_DETECT] waitForUserClickAtTarget failed", error);
      settle("timeout");
    });
  });
}
function stepsForNode(nodeId, appName) {
  const graph = loadGraph(appName);
  const sessions = nodeId ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId)) : graph.sessions.filter((s) => s.steps.length > 0);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}
function logWalkthroughStep(step, index, total, attempt) {
  console.log("[WALKTHROUGH] step", {
    index,
    displayIndex: index + 1,
    total,
    attempt,
    title: stepTitle(step),
    action: step.action,
    x: step.x,
    y: step.y
  });
}
function emitGhostStep(step, index, total, attempt, reason, ghostStart) {
  const channel = attempt === 0 ? "replay:step" : "replay:retry";
  const ghostLoops = step.action !== "wait";
  sendOverlay(channel, {
    step,
    index,
    total,
    reason,
    attempt,
    ghost: {
      startX: ghostStart.x,
      startY: ghostStart.y,
      loop: ghostLoops,
      timeoutMs: DEFAULT_STEP_TIMEOUT_MS
    }
  });
  console.log("[GHOST] visual step emitted", {
    channel,
    index,
    attempt,
    action: step.action,
    x: step.x,
    y: step.y,
    startX: ghostStart.x,
    startY: ghostStart.y
  });
  if (ghostLoops) {
    console.log("[GHOST] looping started", { index, attempt, timeoutMs: DEFAULT_STEP_TIMEOUT_MS });
  }
}
function parkGhostAtEndpoint(step, index, total, attempt) {
  console.log("[GHOST] parked at endpoint", { index, action: step.action, x: step.x, y: step.y });
  sendOverlay("replay:target-reached", {
    step,
    index,
    total,
    attempt
  });
}
async function replayWalkthrough(steps, onStep) {
  assertWalkthroughReplaySafety();
  const controller = createReplayController();
  setOverlayForReplay();
  let previousGhostTarget = null;
  console.log("[WALKTHROUGH] start", { totalSteps: steps.length });
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      let result = "timeout";
      let attempts = 0;
      while (result !== "correct" && isActive(controller)) {
        logWalkthroughStep(step, index, steps.length, attempts);
        const ghostStart = await ghostStartForStep(step, previousGhostTarget);
        emitGhostStep(step, index, steps.length, attempts, result, ghostStart);
        if (attempts === 0) onStep(step, index);
        if (step.action === "wait") {
          const waitMs = stepWaitMs(step);
          console.log("[WALKTHROUGH] wait step sleeping", { index, waitMs });
          result = await sleep(waitMs, controller) ? "correct" : "cancelled";
        } else if (step.action === "click") {
          console.log("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          });
          result = await waitForUserNearTarget(step, controller);
          if (result === "correct") {
            console.log("[USER_CURSOR] real cursor entered tolerance", { index, x: step.x, y: step.y });
            previousGhostTarget = { x: step.x, y: step.y };
            parkGhostAtEndpoint(step, index, steps.length, attempts);
            console.log("[CLICK_DETECT] waiting for actual user click", {
              index,
              x: step.x,
              y: step.y,
              tolerancePx: TARGET_CLICK_TOLERANCE_PX
            });
            result = await waitForUserClickOnTarget(step, controller);
            if (result === "correct") {
              console.log("[CLICK_DETECT] click detected", { index, x: step.x, y: step.y });
            }
          }
        } else {
          console.log("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            action: step.action,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          });
          result = await waitForUserNearTarget(step, controller);
          if (result === "correct") {
            console.log("[USER_CURSOR] real cursor entered tolerance", { index, action: step.action, x: step.x, y: step.y });
            previousGhostTarget = { x: step.x, y: step.y };
            parkGhostAtEndpoint(step, index, steps.length, attempts);
          }
        }
        if (result === "correct") {
          console.log("[WALKTHROUGH] step complete", { index, action: step.action, title: stepTitle(step) });
        } else if (result === "timeout") {
          attempts++;
          console.warn("[WALKTHROUGH] step timed out", {
            index,
            action: step.action,
            title: stepTitle(step),
            attempt: attempts,
            maxAttempts: MAX_WALKTHROUGH_ATTEMPTS
          });
          if (attempts >= MAX_WALKTHROUGH_ATTEMPTS) {
            console.warn("[WALKTHROUGH] step skipped after timeout", { index, action: step.action, title: stepTitle(step) });
            break;
          }
        } else if (result === "cancelled") {
          console.warn("[WALKTHROUGH] step cancelled", { index, action: step.action, title: stepTitle(step) });
          break;
        }
      }
    }
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
  } finally {
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    console.log("[WALKTHROUGH] finished", { cancelled: controller.cancelled });
  }
}
function registerReplayIpc(ipcMain, windowProvider, appName = "Specter") {
  setReplayWindowProvider(windowProvider);
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
  console.log("[TOGGLE] toggleOverlay called, isVisible:", overlayWindow?.isVisible());
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
let lastToggleTime = 0;
const DOUBLE_TAP_MS = 300;
const TOGGLE_COOLDOWN_MS = 300;
uiohookNapi.uIOhook.on("keydown", (e) => {
  if (e.keycode === uiohookNapi.UiohookKey.Shift || e.keycode === uiohookNapi.UiohookKey.ShiftRight) {
    const now = Date.now();
    if (now - lastShiftTime < DOUBLE_TAP_MS) {
      if (now - lastToggleTime >= TOGGLE_COOLDOWN_MS) {
        toggleOverlay();
        lastToggleTime = now;
      }
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
  const { x, y, width, height } = electron.screen.getPrimaryDisplay().bounds;
  overlayWindow = new electron.BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    // 'panel' is the macOS-native overlay type: always-on-top across all
    // Spaces without entering fullscreen mode, which would break transparency
    ...process.platform === "darwin" ? { type: "panel" } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
    return moveRealMouse(x, y, durationMs);
  });
  electron.ipcMain.handle("cursor:click", async (_event, x, y) => clickRealMouse(x, y));
  electron.ipcMain.handle("cursor:replay", async (_event, steps) => executeRealMouseSteps(steps));
  electron.ipcMain.handle("cursor:getPosition", async () => getPhysicalMousePosition());
  electron.ipcMain.handle("cursor:waitForTarget", async (_event, x, y, tolerancePx = 50, timeoutMs = 12e3) => {
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
      console.error("[Specter] Screen analysis failed; using fallback screen state:", err);
      return fallbackScreenState();
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
  electron.ipcMain.handle(
    "bandit:selectStyle",
    async (_event, appName = DEFAULT_APP_NAME) => selectArm(loadGraph(appName).bandtState)
  );
  electron.ipcMain.handle("bandit:recordReward", async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    graph.bandtState = recordReward(graph.bandtState, arm, reward);
    saveGraph(graph);
    return { bandtState: graph.bandtState, style: getCurrentStyle(graph.bandtState) };
  });
  electron.ipcMain.handle("session:markComplete", async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = markNodeComplete(loadGraph(appName), nodeId);
    saveGraph(graph);
    return graph;
  });
  electron.ipcMain.handle("session:saveNode", async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
    const graph = saveToNode(loadGraph(appName), nodeId, steps);
    saveGraph(graph);
    return graph;
  });
  electron.ipcMain.handle("session:walkthrough", async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    const sessions = nodeId ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId)) : graph.sessions.filter((s) => s.steps.length > 0);
    const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    const steps = latest?.steps || [];
    await replayWalkthrough(steps, () => {
    });
  });
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
