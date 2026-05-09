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
const uploads = require("openai/uploads");
const node_buffer = require("node:buffer");
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
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9._-]{8,}/g,
  /sk-proj-[A-Za-z0-9._-]{8,}/g,
  /sk-[A-Za-z0-9._-]{8,}/g,
  /(OPENAI_API_KEY|ANTHROPIC_API_KEY|ELEVENLABS_API_KEY)\s*=\s*["']?[^"'\s]+/gi,
  /(x-api-key|authorization)\s*:\s*["']?[^"',\s}]+/gi
];
function redactString(value) {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED]"), value);
}
function sanitize(value, depth = 0, seen = /* @__PURE__ */ new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 4) return "[Object]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message)
    };
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /key|token|secret|authorization/i.test(key) && typeof entry === "string" ? "[REDACTED]" : sanitize(entry, depth + 1, seen)
    ])
  );
}
function safeLog(...args) {
  try {
    console.log(...args.map((arg) => sanitize(arg)));
  } catch {
  }
}
function safeWarn(...args) {
  try {
    console.warn(...args.map((arg) => sanitize(arg)));
  } catch {
  }
}
function safeError(...args) {
  try {
    console.error(...args.map((arg) => sanitize(arg)));
  } catch {
  }
}
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
  const inputMonitoringLine = "• Input Monitoring — enable this if global clicks, Space/Enter fallback, or double-shift detection do not fire\n";
  const detail = `Specter needs the following permissions to function:

` + screenLine + accessibilityLine + inputMonitoringLine + `
For Screen Recording: if the system prompt did not appear, open System Settings → Privacy & Security → Screen Recording and enable Specter, then click Retry.
For Accessibility: grant access in System Settings, then click Retry.
For Input Monitoring: Specter does not block startup on this, but walkthrough click detection depends on macOS allowing global input hooks.`;
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
    safeLog("[PERMISSIONS] Status check:", {
      screen: screenStatus,
      accessibility: accessibilityStatus,
      missing
    });
    if (missing.length === 0) {
      safeLog("[PERMISSIONS] All required permissions granted.");
      return true;
    }
    if (missing.includes("accessibility")) {
      electron.shell.openExternal(ACCESSIBILITY_SETTINGS_URL);
    }
    const action2 = showPermissionDialog(missing);
    if (action2 === "quit") {
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
const COORDINATE_MODE = "electron logical display bounds";
let activeCoordinateDisplayId = null;
function clampPercent$1(value) {
  return Math.min(100, Math.max(0, value));
}
function rectSnapshot(rect) {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}
function getDisplayById(displayId) {
  if (displayId === null) return null;
  return electron.screen.getAllDisplays().find((display) => display.id === displayId) || null;
}
function displayContainsScreenPoint(display, x, y) {
  const bounds = display.bounds;
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
}
function displayForScreenPoint(x, y) {
  return electron.screen.getAllDisplays().find((display) => displayContainsScreenPoint(display, x, y)) || getActiveCoordinateDisplay();
}
function setActiveCoordinateDisplay(displayId) {
  activeCoordinateDisplayId = displayId;
  safeLog("[WINDOW_ROUTING] active coordinate display set", { displayId });
}
function getActiveCoordinateDisplay() {
  const pinned = getDisplayById(activeCoordinateDisplayId);
  if (pinned) return pinned;
  return electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()) || electron.screen.getPrimaryDisplay();
}
function getPrimaryDisplayMetrics() {
  const primary = electron.screen.getPrimaryDisplay();
  const active = getActiveCoordinateDisplay();
  const metrics = {
    id: primary.id,
    scaleFactor: primary.scaleFactor,
    bounds: rectSnapshot(primary.bounds),
    workArea: rectSnapshot(primary.workArea),
    activeDisplay: {
      id: active.id,
      scaleFactor: active.scaleFactor,
      bounds: rectSnapshot(active.bounds),
      workArea: rectSnapshot(active.workArea)
    },
    size: {
      width: primary.size.width,
      height: primary.size.height
    }
  };
  safeLog("[COORD_CALIBRATION] Primary display metrics retrieved", {
    coordinateMode: COORDINATE_MODE,
    ...metrics
  });
  return metrics;
}
async function toScreenPoint(x, y) {
  const display = getActiveCoordinateDisplay();
  const logicalX = display.bounds.x + clampPercent$1(x) / 100 * display.bounds.width;
  const logicalY = display.bounds.y + clampPercent$1(y) / 100 * display.bounds.height;
  const screenX = Math.round(logicalX);
  const screenY = Math.round(logicalY);
  const expectedCenter = {
    x: Math.round(display.bounds.x + display.bounds.width / 2),
    y: Math.round(display.bounds.y + display.bounds.height / 2)
  };
  safeLog("[COORD_CALIBRATION] Mapping percent to screen point", {
    coordinateMode: COORDINATE_MODE,
    input: { x, y },
    display: {
      id: display.id,
      bounds: rectSnapshot(display.bounds),
      scaleFactor: display.scaleFactor
    },
    expectedCenter,
    output: { x: screenX, y: screenY }
  });
  return new nutJs.Point(screenX, screenY);
}
function screenPointToPercent(x, y) {
  const display = displayForScreenPoint(x, y);
  const bounds = display.bounds;
  return {
    x: clampPercent$1((x - bounds.x) / bounds.width * 100),
    y: clampPercent$1((y - bounds.y) / bounds.height * 100)
  };
}
function logicalPointToPercent(x, y) {
  const display = getDisplayById(activeCoordinateDisplayId) || electron.screen.getDisplayNearestPoint({ x, y });
  return {
    x: clampPercent$1((x - display.bounds.x) / display.bounds.width * 100),
    y: clampPercent$1((y - display.bounds.y) / display.bounds.height * 100)
  };
}
async function captureScreenBase64() {
  const activeDisplay = getActiveCoordinateDisplay();
  const { width, height } = activeDisplay.size;
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
  const source = sources.find((s) => s.display_id === String(activeDisplay.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    const err = new Error("Screen Recording permission denied. Grant access in System Settings, then retry.");
    err.code = "SCREEN_PERMISSION_DENIED";
    throw err;
  }
  safeLog("[WINDOW_ROUTING] screen capture display selected", {
    displayId: activeDisplay.id,
    bounds: activeDisplay.bounds
  });
  return source.thumbnail.toPNG().toString("base64");
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
  safeLog("[AUTO_REAL_MOUSE] moveRealMouse invoked REAL OS cursor automation", { x, y, durationMs });
  try {
    const target = await toScreenPoint(x, y);
    safeLog("[AUTO_REAL_MOUSE] target screen point", { x: target.x, y: target.y });
    const current = await nutJs.mouse.getPosition();
    const distance = Math.max(1, Math.hypot(target.x - current.x, target.y - current.y));
    const previousSpeed = nutJs.mouse.config.mouseSpeed;
    const durationSeconds = Math.max(0.05, durationMs / 1e3);
    nutJs.mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds);
    try {
      await nutJs.mouse.move(nutJs.straightTo(target), easeInOutCubic);
      safeLog("[AUTO_REAL_MOUSE] nut-js REAL OS move complete");
    } finally {
      nutJs.mouse.config.mouseSpeed = previousSpeed;
    }
  } catch (error) {
    safeError("[AUTO_REAL_MOUSE] nut-js REAL OS automation error:", error);
    throw cursorPermissionError(error);
  }
}
async function clickRealMouse(x, y, durationMs = DEFAULT_MOVE_DURATION_MS) {
  try {
    safeLog("[AUTO_REAL_MOUSE] clickRealMouse invoked REAL OS cursor automation", { x, y, durationMs });
    await moveRealMouse(x, y, durationMs);
    await nutJs.mouse.click(nutJs.Button.LEFT);
    safeLog("[AUTO_REAL_MOUSE] nut-js REAL OS click complete", { x, y });
  } catch (error) {
    throw cursorPermissionError(error);
  }
}
async function executeRealMouseSteps(steps, moveDurationMs = DEFAULT_MOVE_DURATION_MS) {
  safeLog("[AUTO_REAL_MOUSE] executeRealMouseSteps invoked REAL OS automation", { totalSteps: steps.length });
  for (const [index, step] of steps.entries()) {
    safeLog("[AUTO_REAL_MOUSE] executing real cursor step", {
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
        await clickRealMouse(step.x, step.y, moveDurationMs);
        break;
      case "type":
        await moveRealMouse(step.x, step.y, moveDurationMs);
        if (step.typeText) {
          await nutJs.mouse.click(nutJs.Button.LEFT);
          await nutJs.keyboard.type(step.typeText);
        }
        break;
      case "scroll":
        await moveRealMouse(step.x, step.y, moveDurationMs);
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
async function getMousePosition() {
  try {
    const pos = await nutJs.mouse.getPosition();
    return { x: pos.x, y: pos.y };
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
async function getMousePercent() {
  try {
    const pos = await nutJs.mouse.getPosition();
    return screenPointToPercent(pos.x, pos.y);
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
async function getCoordinateCalibrationDiagnostics() {
  try {
    const currentMousePosition = await nutJs.mouse.getPosition();
    const computedPercent = screenPointToPercent(currentMousePosition.x, currentMousePosition.y);
    const centerTarget = await toScreenPoint(50, 50);
    const metrics = getPrimaryDisplayMetrics();
    const diagnostics = {
      primaryDisplay: metrics,
      currentMousePosition: {
        x: currentMousePosition.x,
        y: currentMousePosition.y
      },
      computedPercent,
      toScreenPoint50_50: {
        x: centerTarget.x,
        y: centerTarget.y
      },
      expectedCenter: {
        x: Math.round(metrics.activeDisplay.bounds.x + metrics.activeDisplay.bounds.width / 2),
        y: Math.round(metrics.activeDisplay.bounds.y + metrics.activeDisplay.bounds.height / 2)
      },
      coordinateMode: COORDINATE_MODE
    };
    safeLog("[COORD_CALIBRATION]", diagnostics);
    return diagnostics;
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
        safeLog("[USER_CURSOR] entered target tolerance", {
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
    safeWarn("[USER_CURSOR] target tolerance wait timed out", { targetPercentX, targetPercentY, tolerancePx, timeoutMs });
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
          safeWarn("[CLICK_DETECT] timed out waiting for user click", {
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
          safeLog("[CLICK_DETECT] click observed", {
            targetPercentX,
            targetPercentY,
            tolerancePx,
            cursorX: pos.x,
            cursorY: pos.y,
            distancePx
          });
          if (distancePx <= tolerancePx) {
            safeLog("[CLICK_DETECT] click detected inside target tolerance", {
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
      safeLog("[CLICK_DETECT] armed user click detector", { targetPercentX, targetPercentY, tolerancePx, timeoutMs });
      signal?.addEventListener("abort", onAbort, { once: true });
      uiohookNapi.uIOhook.on("click", onClick);
    });
  } catch (error) {
    throw userCursorPermissionError(error);
  }
}
const OFFICIAL_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY;
}
function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}
function getAnthropicVisionModel() {
  return process.env.ANTHROPIC_VISION_MODEL || "claude-3-5-sonnet-20241022";
}
function getUseLocalModel() {
  return process.env.USE_LOCAL_MODEL === "true";
}
function getLocalModelBaseUrl() {
  if (process.env.USE_LOCAL_MODEL !== "true") {
    return void 0;
  }
  return process.env.LOCAL_MODEL_BASE_URL || process.env.ANTHROPIC_BASE_URL;
}
function isLocalhostUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
function getAnthropicBaseUrlForMode() {
  if (getUseLocalModel()) {
    return getLocalModelBaseUrl() || OFFICIAL_ANTHROPIC_BASE_URL;
  }
  return OFFICIAL_ANTHROPIC_BASE_URL;
}
function classifyAnthropicError(error) {
  const status = typeof error?.status === "number" ? error.status : typeof error?.response?.status === "number" ? error.response.status : void 0;
  const name = typeof error?.name === "string" ? error.name : void 0;
  const message = typeof error?.message === "string" ? error.message : String(error || "");
  const causeMessage = typeof error?.cause?.message === "string" ? error.cause.message : "";
  const combined = `${name || ""} ${message} ${causeMessage}`.toLowerCase();
  if (status === 401 || status === 403 || /auth|unauthorized|forbidden|api key|invalid x-api-key/.test(combined)) {
    return { category: "auth_error", status, name, message };
  }
  if (status === 429 || /rate limit|too many requests/.test(combined)) {
    return { category: "rate_limit", status, name, message };
  }
  if (status === 404 || status === 400 && /model/.test(combined) || /model.*not found|model.*access|unsupported model|invalid model/.test(combined)) {
    return { category: "model_error", status, name, message };
  }
  if (/network|fetch|connection|econn|enotfound|etimedout|timeout|socket|dns|offline|11434/.test(combined) || name === "APIConnectionError") {
    return { category: "network_error", status, name, message };
  }
  return { category: "unknown", status, name, message };
}
function createAnthropicClient() {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return null;
  }
  const useLocal = getUseLocalModel();
  if (!useLocal) {
    const envBaseUrl = process.env.ANTHROPIC_BASE_URL || process.env.LOCAL_MODEL_BASE_URL;
    if (envBaseUrl && isLocalhostUrl(envBaseUrl)) {
      safeWarn("[AI_BACKEND] Ignoring localhost Anthropic base URL because USE_LOCAL_MODEL is not true");
    }
    return new Anthropic({ apiKey, baseURL: OFFICIAL_ANTHROPIC_BASE_URL });
  }
  const localBaseUrl = getLocalModelBaseUrl();
  if (localBaseUrl) {
    safeLog("[AI_BACKEND] Using local model endpoint:", localBaseUrl);
    return new Anthropic({ apiKey, baseURL: localBaseUrl });
  }
  safeWarn("[AI_BACKEND] USE_LOCAL_MODEL is true but no local base URL is set; falling back to official Anthropic API");
  return new Anthropic({ apiKey, baseURL: OFFICIAL_ANTHROPIC_BASE_URL });
}
const CLAUDE_VISION_MODEL = getAnthropicVisionModel();
function fallbackScreenState(error) {
  return {
    app: "Unknown",
    coordinates: [],
    error,
    fallbackAvailable: true
  };
}
function percent$1(value, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}
function confidence(value, fallback = 0.5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}
function action(value) {
  return ["click", "type", "scroll", "wait"].includes(value) ? value : "click";
}
function extractJson$1(text) {
  const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}
function normalizeScreenState(value) {
  if (!value || typeof value !== "object") {
    return fallbackScreenState();
  }
  const coordinates = Array.isArray(value.coordinates) ? value.coordinates.filter((item) => item && typeof item === "object").map((item) => ({
    label: typeof item.label === "string" && item.label.trim() ? item.label : "Untitled target",
    x: percent$1(item.x ?? item.targetX),
    y: percent$1(item.y ?? item.targetY),
    confidence: confidence(item.confidence, 0.5)
  })) : [];
  return {
    app: typeof value.app === "string" && value.app.trim() ? value.app : "Unknown",
    coordinates
  };
}
function normalizeScreenTargets(value, prompt) {
  if (!value || typeof value !== "object") {
    return {
      app: "Unknown",
      prompt,
      microTask: "First, I will teach one visible action.",
      targets: [],
      needsConfirmation: true,
      reason: "No target JSON returned.",
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const rawTargets = Array.isArray(value.targets) ? value.targets : Array.isArray(value.coordinates) ? value.coordinates : [];
  const targets = rawTargets.filter((item) => item && typeof item === "object").map(
    (item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : `target-${index + 1}`,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Target ${index + 1}`,
      description: typeof item.description === "string" && item.description.trim() ? item.description.trim() : void 0,
      x: percent$1(item.x ?? item.targetX),
      y: percent$1(item.y ?? item.targetY),
      confidence: confidence(item.confidence, 0.45),
      action: action(item.action),
      source: "vision"
    })
  ).sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  return {
    app: typeof value.app === "string" && value.app.trim() ? value.app.trim() : "Unknown",
    prompt,
    microTask: typeof value.microTask === "string" && value.microTask.trim() ? value.microTask.trim() : "First, I will teach one visible action.",
    targets,
    needsConfirmation: value.needsConfirmation !== false,
    reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : void 0,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function fallbackScreenTargets(prompt = "", error) {
  return {
    app: "Unknown",
    prompt,
    microTask: "First, I will teach one visible action.",
    targets: [],
    needsConfirmation: true,
    reason: "No visible targets were detected.",
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    error,
    fallbackAvailable: true
  };
}
async function detectScreenTargets(base64PNG, prompt = "") {
  const anthropic = createAnthropicClient();
  const normalizedPrompt = typeof prompt === "string" && prompt.trim() ? prompt.trim() : "Teach one visible action";
  safeLog("[SCREEN_TARGETS] detect request", {
    hasBase64: Boolean(base64PNG),
    prompt: normalizedPrompt
  });
  if (!base64PNG) {
    safeWarn("[SCREEN_TARGETS] no screenshot provided; returning empty target set");
    return fallbackScreenTargets(normalizedPrompt);
  }
  if (!anthropic) {
    safeWarn("[AI_BACKEND] Anthropic API key missing; using fallback");
    return fallbackScreenTargets(normalizedPrompt, "AI_BACKEND_UNAVAILABLE");
  }
  try {
    safeLog("[SCREEN_TARGETS] calling Claude Vision...", {
      model: CLAUDE_VISION_MODEL
    });
    const message = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
      max_tokens: 4096,
      system: "You are a real-app UI target detector for Specter, a visual software tutor. Return ONLY valid JSON. Identify visible clickable UI targets in the screenshot. Coordinates must be percentages from 0-100 of the full screenshot width and height. Include confidence from 0-1. If the user asks for a broad tutorial, reduce it to one visible micro-task and return at most 12 likely targets. Do not invent hidden menu items or off-screen steps.",
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
              text: JSON.stringify(
                {
                  userPrompt: normalizedPrompt,
                  requiredShape: {
                    app: "detected app or web page",
                    microTask: "First, I will teach one visible action.",
                    needsConfirmation: true,
                    reason: "short uncertainty note if useful",
                    targets: [
                      {
                        id: "target-1",
                        label: "Text tool",
                        description: "visible T icon in toolbar",
                        x: 12.5,
                        y: 8.2,
                        confidence: 0.86,
                        action: "click"
                      }
                    ]
                  }
                },
                null,
                2
              )
            }
          ]
        }
      ]
    });
    const textParts = message.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n");
    if (textParts) {
      safeLog("[SCREEN_TARGETS] raw response:", textParts);
      const parsed = extractJson$1(textParts);
      if (parsed) {
        const normalized = normalizeScreenTargets(parsed, normalizedPrompt);
        safeLog("[SCREEN_TARGETS] normalized targets", {
          app: normalized.app,
          count: normalized.targets.length,
          topTarget: normalized.targets[0] ? {
            label: normalized.targets[0].label,
            x: normalized.targets[0].x,
            y: normalized.targets[0].y,
            confidence: normalized.targets[0].confidence
          } : null
        });
        return normalized;
      }
    }
    return fallbackScreenTargets(normalizedPrompt);
  } catch (error) {
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env."
      );
    }
    safeError("[AI_BACKEND] Anthropic unavailable; using fallback", summary);
    return fallbackScreenTargets(normalizedPrompt, "AI_BACKEND_UNAVAILABLE");
  }
}
async function analyzeScreen(base64PNG) {
  safeLog("[SCREENER] Got base64, length:", base64PNG?.length);
  const anthropic = createAnthropicClient();
  if (!base64PNG) {
    safeWarn("[Specter] No screenshot provided; skipping screen analysis.");
    return fallbackScreenState();
  }
  if (!anthropic) {
    safeWarn("[AI_BACKEND] Anthropic API key missing; using fallback");
    return fallbackScreenState("AI_BACKEND_UNAVAILABLE");
  }
  try {
    safeLog("[SCREENER] Calling Claude Vision...", {
      model: CLAUDE_VISION_MODEL
    });
    const message = await anthropic.messages.create({
      model: CLAUDE_VISION_MODEL,
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
      safeLog("[SCREENER] Raw response:", textParts);
      const cleanJson = textParts.replace(/```json/g, "").replace(/```/g, "").trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        safeLog("[SCREENER] Parsed state:", JSON.stringify(parsed));
        return normalizeScreenState(parsed);
      }
    }
    return fallbackScreenState();
  } catch (error) {
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env."
      );
    }
    safeError("[AI_BACKEND] Anthropic unavailable; using fallback", summary);
    return fallbackScreenState("AI_BACKEND_UNAVAILABLE");
  }
}
const MOODS = ["idle", "thinking", "stuck", "flow", "celebrating", "mirroring", "judging"];
const ACTIONS = [
  "scan",
  "click",
  "repeat-click",
  "type",
  "pause",
  "backtrack",
  "app-switch",
  "replay-retry",
  "replay-failure",
  "accept",
  "override",
  "hesitation",
  "correction",
  "unknown"
];
const METRIC_KEYS = [
  "cognitiveLoad",
  "impulsivity",
  "flowScore",
  "revisionRate",
  "backtrackRate",
  "decisionConfidence"
];
function isRecord$1(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function isMood(value) {
  return typeof value === "string" && MOODS.includes(value);
}
function isoString(value, fallback = (/* @__PURE__ */ new Date()).toISOString()) {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}
function safeLabel$1(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function percent(value) {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}
function metricLabel(key) {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}
function clamp01(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
function createDefaultBehavioralState() {
  return {
    cognitiveLoad: 0.24,
    impulsivity: 0.22,
    flowScore: 0.36,
    revisionRate: 0.08,
    backtrackRate: 0.04,
    decisionConfidence: 0.48,
    moodLabel: "idle",
    sampledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function deriveSpecMood(state) {
  if (isMood(state.moodLabel) && state.moodLabel === "celebrating") return "celebrating";
  if (isMood(state.moodLabel) && state.moodLabel === "mirroring") return "mirroring";
  const cognitiveLoad = clamp01(state.cognitiveLoad, 0.24);
  const impulsivity = clamp01(state.impulsivity, 0.22);
  const flowScore = clamp01(state.flowScore, 0.36);
  const revisionRate = clamp01(state.revisionRate, 0.08);
  const backtrackRate = clamp01(state.backtrackRate, 0.04);
  const decisionConfidence = clamp01(state.decisionConfidence, 0.48);
  if (flowScore >= 0.72 && decisionConfidence >= 0.58 && backtrackRate < 0.25) return "flow";
  if (cognitiveLoad >= 0.78 || backtrackRate >= 0.55) return "stuck";
  if (revisionRate >= 0.48 || impulsivity >= 0.74 && decisionConfidence < 0.48) return "judging";
  if (cognitiveLoad >= 0.5 || decisionConfidence < 0.38) return "thinking";
  return "idle";
}
function normalizeBehavioralState(value) {
  const fallback = createDefaultBehavioralState();
  const raw = isRecord$1(value) ? value : {};
  const partial = {
    cognitiveLoad: clamp01(raw.cognitiveLoad, fallback.cognitiveLoad),
    impulsivity: clamp01(raw.impulsivity, fallback.impulsivity),
    flowScore: clamp01(raw.flowScore, fallback.flowScore),
    revisionRate: clamp01(raw.revisionRate, fallback.revisionRate),
    backtrackRate: clamp01(raw.backtrackRate, fallback.backtrackRate),
    decisionConfidence: clamp01(raw.decisionConfidence, fallback.decisionConfidence)
  };
  return {
    ...partial,
    moodLabel: isMood(raw.moodLabel) ? raw.moodLabel : deriveSpecMood(partial),
    sampledAt: isoString(raw.sampledAt, fallback.sampledAt)
  };
}
function normalizeBehavioralFrame(value) {
  const raw = isRecord$1(value) ? value : {};
  const actionType = typeof raw.actionType === "string" && ACTIONS.includes(raw.actionType) ? raw.actionType : "unknown";
  const cursorDelta = isRecord$1(raw.cursorDelta) ? {
    dx: typeof raw.cursorDelta.dx === "number" && Number.isFinite(raw.cursorDelta.dx) ? raw.cursorDelta.dx : 0,
    dy: typeof raw.cursorDelta.dy === "number" && Number.isFinite(raw.cursorDelta.dy) ? raw.cursorDelta.dy : 0
  } : void 0;
  return {
    t: typeof raw.t === "number" && Number.isFinite(raw.t) ? Math.max(0, raw.t) : Date.now(),
    cursorX: typeof raw.cursorX === "number" && Number.isFinite(raw.cursorX) ? Math.min(100, Math.max(0, raw.cursorX)) : void 0,
    cursorY: typeof raw.cursorY === "number" && Number.isFinite(raw.cursorY) ? Math.min(100, Math.max(0, raw.cursorY)) : void 0,
    cursorDelta,
    dwellMs: typeof raw.dwellMs === "number" && Number.isFinite(raw.dwellMs) ? Math.max(0, raw.dwellMs) : 0,
    actionType,
    revisionSignal: clamp01(raw.revisionSignal, 0),
    app: typeof raw.app === "string" && raw.app.trim() ? raw.app.trim() : void 0,
    targetLabel: typeof raw.targetLabel === "string" && raw.targetLabel.trim() ? raw.targetLabel.trim() : void 0,
    synthetic: raw.synthetic === true
  };
}
function aggregateBehavioralSignature(frames2, fallback = createDefaultBehavioralState()) {
  const normalized = Array.isArray(frames2) ? frames2.map(normalizeBehavioralFrame).slice(-160) : [];
  if (normalized.length === 0) return normalizeBehavioralState(fallback);
  const totals = normalized.reduce(
    (acc, frame, index) => {
      const previous = normalized[index - 1];
      const dwellNorm = clamp01(frame.dwellMs / 2200, 0);
      const deltaDistance = frame.cursorDelta ? Math.hypot(frame.cursorDelta.dx, frame.cursorDelta.dy) : previous && typeof frame.cursorX === "number" && typeof frame.cursorY === "number" ? Math.hypot(frame.cursorX - (previous.cursorX ?? frame.cursorX), frame.cursorY - (previous.cursorY ?? frame.cursorY)) : 0;
      const directness = clamp01(deltaDistance / (deltaDistance + frame.dwellMs / 140 + 1), 0.45);
      const actionWeight = frame.actionType === "click" || frame.actionType === "type" || frame.actionType === "accept" ? 1 : frame.actionType === "repeat-click" || frame.actionType === "override" || frame.actionType === "correction" ? 0.78 : frame.actionType === "scan" ? 0.24 : 0.12;
      const pauseWeight = frame.actionType === "pause" ? 1 : 0;
      const backtrackWeight = frame.actionType === "backtrack" || frame.actionType === "replay-retry" || frame.actionType === "replay-failure" || frame.actionType === "override" || frame.actionType === "correction" ? 1 : 0;
      const hesitationWeight = frame.actionType === "hesitation" ? 1 : 0;
      const revision = clamp01(frame.revisionSignal, 0);
      const confidence2 = clamp01(
        directness * 0.72 + (1 - dwellNorm) * 0.28 - revision * 0.25 - backtrackWeight * 0.3 - hesitationWeight * 0.18,
        0.3
      );
      const cognitiveLoad2 = clamp01(
        dwellNorm * 0.45 + revision * 0.32 + pauseWeight * 0.18 + backtrackWeight * 0.24 + hesitationWeight * 0.2,
        0
      );
      const impulsivity2 = clamp01(actionWeight * (1 - dwellNorm) * (0.55 + directness * 0.45), 0);
      acc.cognitiveLoad += cognitiveLoad2;
      acc.impulsivity += impulsivity2;
      acc.revisionRate += revision;
      acc.backtrackRate += backtrackWeight;
      acc.decisionConfidence += confidence2;
      acc.pauseRate += pauseWeight;
      return acc;
    },
    {
      cognitiveLoad: 0,
      impulsivity: 0,
      revisionRate: 0,
      backtrackRate: 0,
      decisionConfidence: 0,
      pauseRate: 0
    }
  );
  const count = normalized.length;
  const decisionConfidence = clamp01(totals.decisionConfidence / count, fallback.decisionConfidence);
  const backtrackRate = clamp01(totals.backtrackRate / count, fallback.backtrackRate);
  const revisionRate = clamp01(totals.revisionRate / count, fallback.revisionRate);
  const pauseRate = clamp01(totals.pauseRate / count, 0);
  const impulsivity = clamp01(totals.impulsivity / count, fallback.impulsivity);
  const cognitiveLoad = clamp01(totals.cognitiveLoad / count, fallback.cognitiveLoad);
  const flowScore = clamp01(decisionConfidence * 0.58 + (1 - backtrackRate) * 0.2 + (1 - revisionRate) * 0.12 + (1 - pauseRate) * 0.1, fallback.flowScore);
  const state = {
    cognitiveLoad,
    impulsivity,
    flowScore,
    revisionRate,
    backtrackRate,
    decisionConfidence
  };
  return {
    ...state,
    moodLabel: deriveSpecMood(state),
    sampledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function personalityForState(state) {
  const normalized = normalizeBehavioralState(state);
  const mood = deriveSpecMood(normalized);
  const eyeShape = mood === "mirroring" ? "glow" : mood === "judging" ? "judging" : mood === "stuck" ? "sleepy" : mood === "flow" || mood === "celebrating" ? "wide" : "focused";
  return {
    defaultMood: mood,
    eyeShape,
    bounce: clamp01(0.24 + normalized.flowScore * 0.48 + normalized.impulsivity * 0.22 - normalized.cognitiveLoad * 0.14, 0.35),
    sass: clamp01(0.16 + normalized.impulsivity * 0.34 + normalized.revisionRate * 0.28 + normalized.backtrackRate * 0.16, 0.24)
  };
}
function humanCommitMessage(previous, next) {
  const normalizedNext = normalizeBehavioralState(next);
  if (!previous) {
    return `commit: initialized behavioral checkpoint at ${Math.round(normalizedNext.decisionConfidence * 100)}% confidence`;
  }
  const normalizedPrevious = normalizeBehavioralState(previous);
  const deltas = METRIC_KEYS.map((key) => ({
    key,
    delta: normalizedNext[key] - normalizedPrevious[key]
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const [primary, secondary] = deltas;
  const secondaryText = secondary ? `, ${metricLabel(secondary.key)} ${percent(secondary.delta)}` : "";
  return `commit: ${metricLabel(primary.key)} ${percent(primary.delta)}${secondaryText}`;
}
function createBehavioralCheckpoint(args) {
  const timestamp = isoString(args.timestamp);
  const sessionN = Math.max(1, Math.round(args.sessionN || 1));
  const signature = normalizeBehavioralState(args.signature);
  const previousSignature = args.previous && "signature" in args.previous ? args.previous.signature : args.previous;
  const id = safeLabel$1(args.id, `behavior-${sessionN}-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`);
  return {
    id,
    timestamp,
    sessionN,
    signature,
    specPersonality: personalityForState(signature),
    parentId: typeof args.parentId === "string" ? args.parentId : null,
    label: safeLabel$1(args.label, `Session ${sessionN}: ${signature.moodLabel} you`),
    commitMessage: safeLabel$1(args.commitMessage, humanCommitMessage(previousSignature, signature)),
    synthetic: args.synthetic === true
  };
}
function normalizeBehavioralCheckpoint(value, fallbackId) {
  const raw = isRecord$1(value) ? value : {};
  const signature = normalizeBehavioralState(raw.signature);
  const timestamp = isoString(raw.timestamp, signature.sampledAt);
  const sessionN = typeof raw.sessionN === "number" && Number.isFinite(raw.sessionN) ? Math.max(1, Math.round(raw.sessionN)) : 1;
  const checkpoint = createBehavioralCheckpoint({
    id: safeLabel$1(raw.id, fallbackId || `behavior-${sessionN}`),
    timestamp,
    sessionN,
    signature,
    parentId: typeof raw.parentId === "string" ? raw.parentId : null,
    label: safeLabel$1(raw.label, `Session ${sessionN}: ${signature.moodLabel} you`),
    commitMessage: safeLabel$1(raw.commitMessage, humanCommitMessage(null, signature)),
    synthetic: raw.synthetic === true
  });
  return {
    ...checkpoint,
    synthetic: raw.synthetic === true,
    specPersonality: isRecord$1(raw.specPersonality) ? {
      defaultMood: isMood(raw.specPersonality.defaultMood) ? raw.specPersonality.defaultMood : checkpoint.specPersonality.defaultMood,
      eyeShape: ["wide", "focused", "sleepy", "judging", "glow"].includes(raw.specPersonality.eyeShape) ? raw.specPersonality.eyeShape : checkpoint.specPersonality.eyeShape,
      bounce: clamp01(raw.specPersonality.bounce, checkpoint.specPersonality.bounce),
      sass: clamp01(raw.specPersonality.sass, checkpoint.specPersonality.sass)
    } : checkpoint.specPersonality
  };
}
function diffBehavioralCheckpoints(from, to) {
  const normalizedFrom = normalizeBehavioralCheckpoint(from);
  const normalizedTo = normalizeBehavioralCheckpoint(to);
  const deltas = {
    cognitiveLoad: normalizedTo.signature.cognitiveLoad - normalizedFrom.signature.cognitiveLoad,
    impulsivity: normalizedTo.signature.impulsivity - normalizedFrom.signature.impulsivity,
    flowScore: normalizedTo.signature.flowScore - normalizedFrom.signature.flowScore,
    revisionRate: normalizedTo.signature.revisionRate - normalizedFrom.signature.revisionRate,
    backtrackRate: normalizedTo.signature.backtrackRate - normalizedFrom.signature.backtrackRate,
    decisionConfidence: normalizedTo.signature.decisionConfidence - normalizedFrom.signature.decisionConfidence
  };
  const summary = METRIC_KEYS.map((key) => ({ key, delta: deltas[key] })).filter((entry) => Math.abs(entry.delta) >= 0.03).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4).map((entry) => `${metricLabel(entry.key)} ${percent(entry.delta)}`);
  if (summary.length === 0) {
    summary.push("behavioral signature stayed stable");
  }
  return {
    fromId: normalizedFrom.id,
    toId: normalizedTo.id,
    deltas,
    summary
  };
}
function blendBehavioralStates(a, b, t) {
  const from = normalizeBehavioralState(a);
  const to = normalizeBehavioralState(b);
  const amount = clamp01(t, 0);
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  const blended = {
    cognitiveLoad: from.cognitiveLoad + (to.cognitiveLoad - from.cognitiveLoad) * amount,
    impulsivity: from.impulsivity + (to.impulsivity - from.impulsivity) * amount,
    flowScore: from.flowScore + (to.flowScore - from.flowScore) * amount,
    revisionRate: from.revisionRate + (to.revisionRate - from.revisionRate) * amount,
    backtrackRate: from.backtrackRate + (to.backtrackRate - from.backtrackRate) * amount,
    decisionConfidence: from.decisionConfidence + (to.decisionConfidence - from.decisionConfidence) * amount
  };
  return {
    ...blended,
    moodLabel: deriveSpecMood(blended),
    sampledAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
const CLAUDE_MODEL = getAnthropicModel();
const STEP_ACTIONS$1 = ["click", "type", "scroll", "wait"];
const SYSTEM_PROMPT = "You are a software tutor. Given the user's intent, current screen state, and their learning history, generate a precise step-by-step tutorial. Return ONLY valid JSON. Coordinates must be percentages of screen dimensions. Keep instructions under 15 words each for Silent mode, conversational for Ultra mode.";
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
  safeLog("[PLANNER] Intent:", normalizedIntent);
  safeLog("[PLANNER] Mode:", normalizedMode);
  safeLog("[PLANNER] Screen app detected:", normalizedScreenState.app);
  const fallback = fallbackSequence(normalizedIntent, normalizedScreenState, normalizedMode);
  const client = createAnthropicClient();
  if (!client) {
    safeWarn("[AI_BACKEND] Anthropic API key missing; using fallback");
    return fallback;
  }
  try {
    safeLog("[PLANNER] Calling Claude...", { model: CLAUDE_MODEL });
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
    safeLog("[PLANNER] Raw response:", rawText);
    const steps = normalizeSequence(extractJson(rawText), fallback);
    return steps;
  } catch (error) {
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env."
      );
    }
    safeError("[AI_BACKEND] Anthropic unavailable; using fallback. AI_BACKEND_UNAVAILABLE", summary);
    return fallback;
  }
}
async function converse(userMessage, screenState, conversationHistory) {
  const client = createAnthropicClient();
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
    const summary = classifyAnthropicError(error);
    const errorMessage = error?.message || String(error);
    const causeMessage = error?.cause?.message || "";
    if (errorMessage.includes("11434") || causeMessage.includes("11434")) {
      safeError(
        "[AI_BACKEND] Refusing localhost:11434 Anthropic route because USE_LOCAL_MODEL is not true. Check ANTHROPIC_BASE_URL / proxy env."
      );
    }
    safeError("[AI_BACKEND] Anthropic unavailable; using fallback", summary);
    return "I hit a temporary issue answering that. Keep going with the highlighted next step.";
  }
}
function fallbackUltraReply(message) {
  const lower = message.toLowerCase();
  if (lower.includes("what") && lower.includes("next")) {
    return {
      reply: "Move your cursor toward the highlighted target. I will wait until you are close.",
      intent: "repeat_step",
      shouldSpeak: true
    };
  }
  if (lower.includes("why")) {
    return {
      reply: "This is the next step to accomplish your goal. Keep going!",
      intent: "clarify",
      shouldSpeak: true
    };
  }
  return {
    reply: "I am here to help you through the steps. Just follow the ghost cursor.",
    intent: "answer",
    shouldSpeak: true
  };
}
async function ultraConverse(payload) {
  const { message, mode, currentGoal, screenState, sessionHistory } = payload;
  const client = createAnthropicClient();
  if (!client || mode === "silent") {
    return fallbackUltraReply(message);
  }
  try {
    const history = (sessionHistory || []).slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: "You are Specter, an encouraging and concise software tutor. You guide the user through tasks on their computer. Keep your responses short (under 2 sentences) because they will be read aloud. Return ONLY valid JSON.",
      messages: [
        ...history,
        {
          role: "user",
          content: JSON.stringify(
            {
              userMessage: message,
              currentGoal,
              screenState,
              requiredShape: {
                reply: "string (short, conversational)",
                intent: "answer | start_walkthrough | repeat_step | clarify | stop",
                shouldSpeak: "boolean",
                shouldStartWalkthrough: "boolean"
              }
            },
            null,
            2
          )
        }
      ]
    });
    const rawText = response.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n");
    const result = extractJson(rawText);
    return {
      reply: typeof result.reply === "string" ? result.reply : fallbackUltraReply(message).reply,
      intent: result.intent || "answer",
      shouldSpeak: typeof result.shouldSpeak === "boolean" ? result.shouldSpeak : true,
      shouldStartWalkthrough: typeof result.shouldStartWalkthrough === "boolean" ? result.shouldStartWalkthrough : false
    };
  } catch (error) {
    safeError("[ULTRA] Anthropic converse failed", error);
    return fallbackUltraReply(message);
  }
}
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const RACHEL_VOICE_ID$1 = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID$1 = "eleven_turbo_v2";
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
async function speakFallback(text, reason) {
  await stopSpeaking();
  if (!text.trim()) return;
  safeLog(`[TTS] using macOS fallback ${`(${reason})`}`);
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
async function speakOpenAI(text, apiKey) {
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE || "nova";
  safeLog("[TTS] Trying OpenAI TTS...", { model, voice });
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const outputDir = path.join(os.tmpdir(), "specter-tts");
    const outputPath = path.join(outputDir, `openai-speech-${Date.now()}.mp3`);
    await promises.mkdir(outputDir, { recursive: true });
    await promises.writeFile(outputPath, buffer);
    safeLog("[TTS] OpenAI TTS success, playing...");
    await playAudioFile(outputPath);
    return true;
  } catch (error) {
    safeError("[TTS] OpenAI TTS failed", error);
    return false;
  }
}
async function speak(text) {
  safeLog("[TTS] speak called", { preview: text?.slice(0, 50) });
  await stopSpeaking();
  if (!text.trim()) return { success: true, providerUsed: "macos" };
  const runId = speechRunId;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID$1;
  const modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID$1;
  if (elevenlabsKey) {
    let request = null;
    try {
      safeLog("[TTS] Calling ElevenLabs...", { voiceId, modelId });
      request = new AbortController();
      activeRequest = request;
      const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
        method: "POST",
        signal: request.signal,
        headers: {
          "xi-api-key": elevenlabsKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true }
        })
      });
      if (activeRequest === request) activeRequest = null;
      if (runId !== speechRunId) return { success: false, providerUsed: "elevenlabs", fallbackReason: "stale run" };
      if (response.ok) {
        const audio = Buffer.from(await response.arrayBuffer());
        const outputDir = path.join(os.tmpdir(), "specter-tts");
        const outputPath = path.join(outputDir, `eleven-speech-${Date.now()}.mp3`);
        await promises.mkdir(outputDir, { recursive: true });
        await promises.writeFile(outputPath, audio);
        if (runId === speechRunId) {
          safeLog("[TTS] ElevenLabs success, playing...");
          await playAudioFile(outputPath);
          return { success: true, providerUsed: "elevenlabs" };
        }
      } else {
        const errorText = await response.text();
        safeWarn("[TTS] ElevenLabs returned error", { status: response.status, errorText });
      }
    } catch (error) {
      safeError("[TTS] ElevenLabs exception", error);
    }
  }
  if (openaiKey) {
    safeLog("[TTS] ElevenLabs failed or skipped; trying OpenAI TTS fallback");
    const ok = await speakOpenAI(text, openaiKey);
    if (ok) return { success: true, providerUsed: "openai" };
  }
  safeLog("[TTS] ElevenLabs and OpenAI failed; using macOS fallback");
  await speakFallback(text, "OpenAI fallback failed");
  return { success: true, providerUsed: "macos" };
}
const WHISPER_TIMEOUT_MS = 2e4;
if (typeof globalThis.File === "undefined") {
  globalThis.File = node_buffer.File;
  safeLog("[WHISPER] installed Node File polyfill for OpenAI uploads");
}
function timeoutPromise(ms) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`Whisper transcription timed out after ${ms}ms`);
      err.code = "WHISPER_TIMEOUT";
      reject(err);
    }, ms);
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      timer.unref();
    }
  });
}
function classifyWhisperError(error) {
  if (error?.code === "WHISPER_TIMEOUT") {
    return { error: "openai_timeout", message: "Whisper transcription timed out. Try again." };
  }
  const status = error?.status;
  const code = error?.code;
  const message = error?.message || String(error);
  if (status === 401) {
    return { error: "openai_auth_error", message: "OpenAI authentication failed. Check OPENAI_API_KEY." };
  }
  if (status === 429) {
    return { error: "openai_rate_limit", message: "OpenAI rate limit reached." };
  }
  if (code === "ENOTFOUND" || code === "ECONNREFUSED") {
    return { error: "openai_network_error", message: "OpenAI could not be reached. Check your network." };
  }
  return { error: "openai_unknown", message: `Whisper failed: ${message}` };
}
async function transcribe(audioBuffer) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const primaryModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
  safeLog("[WHISPER] received buffer", { bufferSize: audioBuffer?.length || 0 });
  if (!audioBuffer || audioBuffer.length === 0) {
    safeWarn("[WHISPER] empty audio buffer, skipping OpenAI");
    return { ok: false, error: "empty_audio", message: "No audio captured. Speak a little longer." };
  }
  if (!OPENAI_API_KEY) {
    safeWarn("[WHISPER] OPENAI_API_KEY missing; transcription unavailable");
    return { ok: false, error: "openai_key_missing", message: "Whisper is not configured. Check OPENAI_API_KEY." };
  }
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const file = await uploads.toFile(audioBuffer, "audio.webm", {
    type: "audio/webm"
  });
  const tryTranscribe = async (model) => {
    safeLog(`[WHISPER] OpenAI request started with model: ${model}`);
    return await Promise.race([
      openai.audio.transcriptions.create({ file, model }),
      timeoutPromise(WHISPER_TIMEOUT_MS)
    ]);
  };
  try {
    const response = await tryTranscribe(primaryModel);
    safeLog("[WHISPER] transcription success", { model: primaryModel, textLength: response.text?.length || 0 });
    return { ok: true, text: response.text || "" };
  } catch (error) {
    safeWarn(`[WHISPER] primary model (${primaryModel}) failed, trying fallback whisper-1`, { error: error?.message });
    try {
      const response = await tryTranscribe("whisper-1");
      safeLog("[WHISPER] transcription success with fallback", { model: "whisper-1", textLength: response.text?.length || 0 });
      return { ok: true, text: response.text || "" };
    } catch (fallbackError) {
      const classified = classifyWhisperError(fallbackError);
      safeError("[WHISPER] transcription failed completely", {
        code: classified.error,
        message: classified.message
      });
      return { ok: false, ...classified };
    }
  }
}
function keyHealth(value) {
  const trimmed = value?.trim() || "";
  const placeholderDetected = !trimmed ? false : /placeholder|changeme|change_me|replace|your[_-]?key|xxx|sk-xxx|test[_-]?key/i.test(trimmed);
  return {
    present: Boolean(trimmed),
    keyLength: trimmed.length,
    placeholderDetected
  };
}
function baseURLKind(baseURL, useLocalModel) {
  if (baseURL === OFFICIAL_ANTHROPIC_BASE_URL) return "official";
  if (useLocalModel || isLocalhostUrl(baseURL)) return "local";
  return "custom";
}
function friendlyAnthropicReason(category, status) {
  if (category === "auth_error") return "Anthropic authentication failed. Check ANTHROPIC_API_KEY.";
  if (category === "network_error") return "Anthropic could not be reached from this machine.";
  if (category === "model_error") return "The selected Anthropic model is unavailable for this key.";
  if (category === "rate_limit") return "Anthropic rate limit reached.";
  if (category === "api_key_missing") return "ANTHROPIC_API_KEY is missing.";
  return status ? `Anthropic request failed with status ${status}.` : "Anthropic request failed.";
}
const RACHEL_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL_ID = "eleven_turbo_v2";
async function checkAIHealth() {
  const anthropicKey = keyHealth(getAnthropicApiKey());
  const openaiKey = keyHealth(process.env.OPENAI_API_KEY);
  const elevenlabsKey = keyHealth(process.env.ELEVENLABS_API_KEY);
  const useLocalModel = getUseLocalModel();
  const baseURL = getAnthropicBaseUrlForMode();
  const result = {
    ok: false,
    overall: {
      readyForRealAppAI: false,
      readyForVoiceInput: false,
      readyForNaturalVoiceOutput: false
    },
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
    },
    openaiTTS: {
      key: openaiKey,
      configured: openaiKey.present && !openaiKey.placeholderDetected,
      model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "nova"
    },
    elevenlabs: {
      key: elevenlabsKey,
      configured: elevenlabsKey.present && !elevenlabsKey.placeholderDetected,
      voiceId: process.env.ELEVENLABS_VOICE_ID || RACHEL_VOICE_ID,
      modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID
    }
  };
  if (!result.anthropic.configured) {
    result.anthropic.testRequest = {
      attempted: false,
      pass: false,
      category: anthropicKey.present ? "auth_error" : "api_key_missing",
      reason: anthropicKey.present ? "Anthropic key looks like placeholder text." : "ANTHROPIC_API_KEY is missing."
    };
  } else {
    const client = createAnthropicClient();
    if (!client) {
      result.anthropic.testRequest = {
        attempted: false,
        pass: false,
        category: "api_key_missing",
        reason: "ANTHROPIC_API_KEY is missing."
      };
    } else {
      result.anthropic.testRequest.attempted = true;
      try {
        const message = await client.messages.create({
          model: getAnthropicModel(),
          max_tokens: 8,
          messages: [
            {
              role: "user",
              content: "Return OK"
            }
          ]
        });
        const text = message.content.flatMap((part) => part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("\n").trim();
        result.anthropic.testRequest.pass = /^ok\.?$/i.test(text) || /ok/i.test(text);
        if (!result.anthropic.testRequest.pass) {
          result.anthropic.testRequest.category = "unknown";
          result.anthropic.testRequest.reason = "Anthropic responded, but not with OK.";
        }
      } catch (error) {
        const summary = classifyAnthropicError(error);
        result.anthropic.testRequest.pass = false;
        result.anthropic.testRequest.category = summary.category;
        result.anthropic.testRequest.status = summary.status;
        result.anthropic.testRequest.reason = friendlyAnthropicReason(summary.category, summary.status);
      }
    }
  }
  result.overall.readyForRealAppAI = result.anthropic.configured && result.anthropic.testRequest.pass;
  result.overall.readyForVoiceInput = result.openai.whisperConfigured;
  result.overall.readyForNaturalVoiceOutput = result.elevenlabs.configured || result.openaiTTS.configured;
  result.ok = result.overall.readyForRealAppAI && result.overall.readyForVoiceInput && result.overall.readyForNaturalVoiceOutput;
  return result;
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
  safeLog("[Specter] Teaching style currently winning:", winningStyle);
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
    bandtState: createDefaultBandtState(),
    behavioralCheckpoints: {},
    currentBehavioralCheckpointId: null,
    behavioralFrames: []
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
    title: typeof step.title === "string" ? step.title : void 0,
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
  const source = isRecord(graph) ? graph : {};
  const nodes = isRecord(source.nodes) ? Object.fromEntries(Object.entries(source.nodes).map(([id, node]) => [id, normalizeNode(id, node)])) : fallback.nodes;
  const branches = isRecord(source.branches) ? Object.fromEntries(Object.entries(source.branches).map(([id, branch]) => [id, normalizeBranch(id, branch)])) : fallback.branches;
  const edges = Array.isArray(source.edges) ? source.edges.map(normalizeEdge).filter((edge) => Boolean(edge)) : fallback.edges;
  const sessions = Array.isArray(source.sessions) ? source.sessions.map((session, index) => normalizeSession(`session-${index + 1}`, session)) : fallback.sessions;
  const behavioralCheckpoints = isRecord(source.behavioralCheckpoints) ? Object.fromEntries(
    Object.entries(source.behavioralCheckpoints).map(([id, checkpoint]) => [
      id,
      normalizeBehavioralCheckpoint(checkpoint, id)
    ])
  ) : fallback.behavioralCheckpoints;
  const currentBehavioralCheckpointId = typeof source.currentBehavioralCheckpointId === "string" && behavioralCheckpoints && source.currentBehavioralCheckpointId in behavioralCheckpoints ? source.currentBehavioralCheckpointId : null;
  const behavioralFrames = Array.isArray(source.behavioralFrames) ? source.behavioralFrames.map(normalizeBehavioralFrame).slice(-500) : fallback.behavioralFrames;
  return {
    ...fallback,
    ...source,
    userId: typeof source.userId === "string" && source.userId.trim() ? source.userId : fallback.userId,
    app: typeof source.app === "string" && source.app.trim() ? source.app : appName,
    nodes,
    edges,
    branches,
    sessions,
    bandtState: normalizeBandtState(source.bandtState),
    behavioralCheckpoints,
    currentBehavioralCheckpointId,
    behavioralFrames
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
    safeError("[Specter] Failed to load learning graph:", error);
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
    title: typeof step.title === "string" ? step.title : void 0,
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
function hasActiveReplay() {
  return Boolean(activeReplay && !activeReplay.cancelled);
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
  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog("[OVERLAY_INTERACTION] replay starting, enabled click-through");
  }
  overlayWindow2.setIgnoreMouseEvents(true, { forward: true });
}
function setOverlayForKeyboardFallback() {
  const overlayWindow2 = getOverlayWindow();
  if (!overlayWindow2 || overlayWindow2.isDestroyed()) return;
  if (!overlayWindow2.isVisible()) overlayWindow2.show();
  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog("[OVERLAY_INTERACTION] keyboard fallback, disabled click-through (interactive mode)");
  }
  overlayWindow2.setIgnoreMouseEvents(false);
  overlayWindow2.focus();
}
function restoreOverlayAfterReplay(controller) {
  const overlayWindow2 = getOverlayWindow();
  if (!overlayWindow2 || overlayWindow2.isDestroyed()) return;
  if (controller.overlayWasVisible && overlayWindow2.isVisible()) {
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog("[OVERLAY_INTERACTION] replay ended, restoring click-through true");
    }
    overlayWindow2.setIgnoreMouseEvents(true, { forward: true });
    return;
  }
  if (process.env.DEBUG_VERBOSE === "true") {
    safeLog("[OVERLAY_INTERACTION] replay ended, restoring click-through true and hiding overlay");
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
function stepWaitMs$2(step) {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS$1;
}
function stepTitle$2(step) {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}
async function replayAutoExecute(steps) {
  const controller = createReplayController();
  setOverlayForReplay();
  safeLog("[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION", { totalSteps: steps.length });
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      safeLog("[AUTO_REAL_MOUSE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle$2(step),
        action: step.action,
        x: step.x,
        y: step.y
      });
      if (step.action === "click") {
        if (!await sleep(step.delayMs || 0, controller)) break;
        safeLog("[AUTO_REAL_MOUSE] REAL OS move/click", { index, x: step.x, y: step.y });
        await clickRealMouse(step.x, step.y);
      } else if (step.action === "wait") {
        const waitMs = stepWaitMs$2(step);
        safeLog("[AUTO_REAL_MOUSE] wait before next real OS action", { index, waitMs });
        if (!await sleep(waitMs, controller)) break;
      } else {
        if (!await sleep(step.delayMs || 0, controller)) break;
        safeLog("[AUTO_REAL_MOUSE] REAL OS action replay", {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText)
        });
        await executeRealMouseSteps([{ ...step, delayMs: 0 }]);
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step complete", { index, action: step.action });
      sendOverlay("replay:progress", { index, total: steps.length });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED", { cancelled: controller.cancelled });
  }
}
const PAUSE_FRAME_INTERVAL_MS = 1e3;
const HESITATION_THRESHOLD_MS = 1200;
const REPEATED_CLICK_WINDOW_MS = 1200;
const REPEATED_CLICK_RADIUS_PERCENT = 1.5;
let frames = [];
let currentState = createDefaultBehavioralState();
let isTracking = false;
let lastCursor = null;
let lastActionAt = Date.now();
let lastMouseFrameAt = 0;
let pauseTimer = null;
let lastClick = null;
let cleanupListeners = [];
let stateEmitter = null;
function pushFrame(frame) {
  const normalized = normalizeBehavioralFrame(frame);
  frames = [...frames, normalized].slice(-260);
  currentState = aggregateBehavioralSignature(frames, currentState);
  if (normalized.actionType !== "pause") {
    lastActionAt = normalized.t;
  }
  if (typeof normalized.cursorX === "number" && typeof normalized.cursorY === "number") {
    lastCursor = { x: normalized.cursorX, y: normalized.cursorY, t: normalized.t };
  }
  stateEmitter?.(currentState, normalized);
  return normalized;
}
function safeHook(eventName, handler) {
  try {
    const hook = uiohookNapi.uIOhook;
    if (typeof hook.on !== "function") return;
    hook.on(eventName, handler);
    cleanupListeners.push(() => {
      try {
        if (typeof hook.off === "function") hook.off(eventName, handler);
        else if (typeof hook.removeListener === "function") hook.removeListener(eventName, handler);
      } catch (error) {
        safeWarn("[BEHAVIOR] failed to remove uiohook listener", { eventName, error });
      }
    });
  } catch (error) {
    safeWarn("[BEHAVIOR] uiohook listener unavailable; real behavior source disabled", { eventName, error });
  }
}
function cursorPercentFromEvent(event) {
  const x = typeof event?.x === "number" && Number.isFinite(event.x) ? Math.min(100, Math.max(0, event.x)) : void 0;
  const y = typeof event?.y === "number" && Number.isFinite(event.y) ? Math.min(100, Math.max(0, event.y)) : void 0;
  const delta = typeof x === "number" && typeof y === "number" && lastCursor ? { dx: x - lastCursor.x, dy: y - lastCursor.y } : void 0;
  return { x, y, delta };
}
async function cursorPercentSafe(event) {
  try {
    const position = await getMousePercent();
    return cursorPercentFromEvent(position);
  } catch {
    return cursorPercentFromEvent(event);
  }
}
function isBackspaceOrDelete(event) {
  return event?.keycode === uiohookNapi.UiohookKey.Backspace || event?.keycode === uiohookNapi.UiohookKey.Delete;
}
function isRepeatedClick(cursor) {
  const now = Date.now();
  if (!lastClick) {
    lastClick = { x: cursor.x, y: cursor.y, t: now, count: 1 };
    return false;
  }
  const distance = typeof cursor.x === "number" && typeof cursor.y === "number" && typeof lastClick.x === "number" && typeof lastClick.y === "number" ? Math.hypot(cursor.x - lastClick.x, cursor.y - lastClick.y) : Number.POSITIVE_INFINITY;
  const repeated = now - lastClick.t <= REPEATED_CLICK_WINDOW_MS && distance <= REPEATED_CLICK_RADIUS_PERCENT;
  lastClick = {
    x: cursor.x,
    y: cursor.y,
    t: now,
    count: repeated ? lastClick.count + 1 : 1
  };
  return repeated;
}
function startPauseFrames() {
  if (pauseTimer) return;
  pauseTimer = setInterval(() => {
    if (!isTracking) return;
    const now = Date.now();
    const dwellMs = now - lastActionAt;
    if (dwellMs < HESITATION_THRESHOLD_MS) return;
    pushFrame({
      t: now,
      cursorX: lastCursor?.x,
      cursorY: lastCursor?.y,
      dwellMs,
      actionType: "pause",
      revisionSignal: 0,
      targetLabel: "hesitation before action"
    });
  }, PAUSE_FRAME_INTERVAL_MS);
}
function stopPauseFrames() {
  if (!pauseTimer) return;
  clearInterval(pauseTimer);
  pauseTimer = null;
}
function realFramesFrom(graph) {
  return (Array.isArray(graph.behavioralFrames) ? graph.behavioralFrames : []).filter((frame) => frame.synthetic !== true);
}
function setBehavioralStateEmitter(emitter) {
  stateEmitter = emitter;
}
function getBufferedBehavioralFrameCount() {
  return frames.filter((frame) => frame.synthetic !== true).length;
}
function getBehavioralFrameRate() {
  return {
    realFrames: frames.filter((frame) => frame.synthetic !== true && frame.actionType !== "pause").length,
    trackingMs: isTracking ? Date.now() - (frames[0]?.t ?? Date.now()) : 0
  };
}
function startBehavioralTracking() {
  if (isTracking) return;
  isTracking = true;
  safeLog("[BEHAVIOR] tracking start");
  safeHook("click", (event) => {
    void cursorPercentSafe(event).then((cursor) => {
      pushFrame({
        t: Date.now(),
        cursorX: cursor.x,
        cursorY: cursor.y,
        cursorDelta: cursor.delta,
        dwellMs: Math.max(0, Date.now() - lastActionAt),
        actionType: isRepeatedClick(cursor) ? "repeat-click" : "click",
        revisionSignal: 0
      });
    });
  });
  safeHook("keydown", (event) => {
    const revision = isBackspaceOrDelete(event) ? 1 : 0;
    pushFrame({
      t: Date.now(),
      dwellMs: Math.max(0, Date.now() - lastActionAt),
      actionType: revision ? "backtrack" : "type",
      revisionSignal: revision
    });
  });
  safeHook("mousemove", (event) => {
    const now = Date.now();
    if (now - lastMouseFrameAt < 180) return;
    lastMouseFrameAt = now;
    void cursorPercentSafe(event).then((cursor) => {
      pushFrame({
        t: Date.now(),
        cursorX: cursor.x,
        cursorY: cursor.y,
        cursorDelta: cursor.delta,
        dwellMs: Math.max(0, Date.now() - lastActionAt),
        actionType: "scan",
        revisionSignal: 0
      });
    });
  });
  startPauseFrames();
}
function stopBehavioralTracking() {
  if (!isTracking) return;
  isTracking = false;
  stopPauseFrames();
  for (const cleanup of cleanupListeners) cleanup();
  cleanupListeners = [];
  safeLog("[BEHAVIOR] tracking stop");
}
function getCurrentBehavioralState() {
  currentState = aggregateBehavioralSignature(frames, currentState);
  return currentState;
}
function recordBehavioralFrame(frame) {
  return pushFrame(normalizeBehavioralFrame(frame));
}
function rewardFromFeedback(input) {
  const kind = typeof input?.kind === "string" ? input.kind : "hesitation";
  const correctionCount = typeof input?.correctionCount === "number" && Number.isFinite(input.correctionCount) ? Math.max(0, Math.round(input.correctionCount)) : 0;
  if (kind === "accept") return 1;
  if (kind === "override") return 0;
  if (kind === "correction") return Math.max(0, 0.2 - correctionCount * 0.08);
  return 0.35;
}
function recordBehavioralFeedback(input) {
  const reward = rewardFromFeedback(input);
  const kind = typeof input?.kind === "string" ? input.kind : "hesitation";
  const actionType = kind === "accept" ? "accept" : kind === "override" ? "override" : kind === "correction" ? "correction" : "hesitation";
  const frame = pushFrame({
    t: Date.now(),
    dwellMs: typeof input?.hesitationMs === "number" && Number.isFinite(input.hesitationMs) ? Math.max(0, Math.round(input.hesitationMs)) : 350,
    actionType,
    revisionSignal: actionType === "accept" ? 0 : actionType === "hesitation" ? 0.3 : 1,
    targetLabel: typeof input?.targetLabel === "string" && input.targetLabel.trim() ? input.targetLabel.trim() : `Mirror Mode ${actionType} feedback`
  });
  return { frame, reward };
}
function recordAppSwitchFrame(label) {
  return pushFrame({
    t: Date.now(),
    dwellMs: Math.max(0, Date.now() - lastActionAt),
    actionType: "app-switch",
    revisionSignal: 0,
    app: label,
    targetLabel: "window/app switching"
  });
}
function recordReplayBehavioralEvent(kind, targetLabel) {
  return pushFrame({
    t: Date.now(),
    dwellMs: Math.max(0, Date.now() - lastActionAt),
    actionType: kind === "retry" ? "replay-retry" : "replay-failure",
    revisionSignal: kind === "retry" ? 0.45 : 0.85,
    targetLabel: targetLabel || `replay ${kind}`
  });
}
function createCheckpointFromCurrentGraph(graph) {
  const storedFrames = realFramesFrom(graph);
  const realFrames = [...storedFrames, ...frames.filter((frame) => frame.synthetic !== true)];
  if (realFrames.length === 0) {
    throw new Error("Create Checkpoint needs measured behavioral frames first. Use the computer normally for a bit, then try again.");
  }
  const signature = aggregateBehavioralSignature(realFrames, getCurrentBehavioralState());
  const checkpoints = graph.behavioralCheckpoints || {};
  const parentId = typeof graph.currentBehavioralCheckpointId === "string" && checkpoints[graph.currentBehavioralCheckpointId] && checkpoints[graph.currentBehavioralCheckpointId].synthetic !== true ? graph.currentBehavioralCheckpointId : null;
  const parent = parentId ? checkpoints[parentId] : null;
  const checkpoint = createBehavioralCheckpoint({
    sessionN: Math.max(1, graph.sessions.length + 1),
    signature,
    previous: parent,
    parentId,
    label: `Session ${Math.max(1, graph.sessions.length + 1)}: ${signature.moodLabel} you`
  });
  const nextGraph = {
    ...graph,
    behavioralCheckpoints: {
      ...checkpoints,
      [checkpoint.id]: checkpoint
    },
    currentBehavioralCheckpointId: checkpoint.id,
    behavioralFrames: realFrames.slice(-500)
  };
  currentState = signature;
  safeLog("[BEHAVIOR] checkpoint created", { id: checkpoint.id, label: checkpoint.label });
  return { graph: nextGraph, checkpoint };
}
function seedDemoCheckpoints(graph) {
  const existing = graph.behavioralCheckpoints || {};
  const baseTimestamp = Date.now();
  const demoStates = [
    {
      label: "DEV FALLBACK: synthetic cautious signature",
      commitMessage: "synthetic demo data: cautious interaction signature",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.82,
        impulsivity: 0.18,
        flowScore: 0.32,
        revisionRate: 0.62,
        backtrackRate: 0.38,
        decisionConfidence: 0.36,
        moodLabel: "thinking",
        sampledAt: new Date(baseTimestamp - 18e4).toISOString()
      })
    },
    {
      label: "DEV FALLBACK: synthetic flow signature",
      commitMessage: "synthetic demo data: reduced hesitation, increased cursor confidence",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.28,
        impulsivity: 0.58,
        flowScore: 0.88,
        revisionRate: 0.16,
        backtrackRate: 0.08,
        decisionConfidence: 0.86,
        moodLabel: "flow",
        sampledAt: new Date(baseTimestamp - 9e4).toISOString()
      })
    },
    {
      label: "DEV FALLBACK: synthetic mirror signature",
      commitMessage: "synthetic demo data: persona-conditioned mirror preview",
      signature: normalizeBehavioralState({
        cognitiveLoad: 0.56,
        impulsivity: 0.86,
        flowScore: 0.72,
        revisionRate: 0.24,
        backtrackRate: 0.12,
        decisionConfidence: 0.74,
        moodLabel: "mirroring",
        sampledAt: new Date(baseTimestamp).toISOString()
      })
    }
  ];
  let parentId = graph.currentBehavioralCheckpointId || null;
  const checkpoints = demoStates.map((entry, index) => {
    const checkpoint = createBehavioralCheckpoint({
      id: `demo-behavior-${index + 1}`,
      timestamp: entry.signature.sampledAt,
      sessionN: index + 1,
      signature: entry.signature,
      previous: parentId ? existing[parentId] : null,
      parentId,
      label: entry.label,
      commitMessage: entry.commitMessage,
      synthetic: true
    });
    parentId = checkpoint.id;
    return checkpoint;
  });
  const nextCheckpoints = {
    ...existing,
    ...Object.fromEntries(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]))
  };
  const nextGraph = {
    ...graph,
    behavioralCheckpoints: nextCheckpoints,
    currentBehavioralCheckpointId: checkpoints[checkpoints.length - 1]?.id || graph.currentBehavioralCheckpointId || null,
    behavioralFrames: graph.behavioralFrames || []
  };
  currentState = checkpoints[checkpoints.length - 1]?.signature || currentState;
  safeLog("[BEHAVIOR] demo checkpoints seeded", { count: checkpoints.length, current: nextGraph.currentBehavioralCheckpointId });
  return { graph: nextGraph, checkpoints };
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
const MANUAL_CONFIRM_TIMEOUT_MS = 3e4;
let pendingManualConfirm = null;
function stepTitle$1(step) {
  return step.instruction || step.targetLabel || step.title || step.id || "Untitled step";
}
function stepWaitMs$1(step) {
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
    return await getMousePercent();
  } catch (error) {
    safeWarn("[GHOST] could not read cursor for ghost start; using fallback", error);
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
      safeError("[USER_CURSOR] waitForMouseAtTarget failed", error);
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
      safeError("[CLICK_DETECT] waitForUserClickAtTarget failed", error);
      settle("timeout");
    });
  });
}
function waitForManualStepConfirmation(step, index, total, controller, timeoutMs = MANUAL_CONFIRM_TIMEOUT_MS) {
  if (controller.cancelled) return Promise.resolve("cancelled");
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => settle(controller.cancelled ? "cancelled" : "timeout"), timeoutMs);
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (pendingManualConfirm === confirm) pendingManualConfirm = null;
      controller.cancelHandlers.delete(cancel);
      sendOverlay("replay:confirm-cleared", {});
      setOverlayForReplay();
      resolve(result);
    };
    const confirm = () => settle("correct");
    const cancel = () => settle("cancelled");
    pendingManualConfirm = confirm;
    controller.cancelHandlers.add(cancel);
    safeWarn("[CLICK_DETECT] click fallback armed; waiting for Space/Enter confirmation", {
      index,
      x: step.x,
      y: step.y,
      timeoutMs
    });
    setOverlayForKeyboardFallback();
    sendOverlay("replay:confirm-needed", {
      message: "Click not detected. Press Space to confirm this step.",
      step,
      index,
      total,
      timeoutMs
    });
  });
}
function confirmReplayStep() {
  if (!pendingManualConfirm) {
    safeWarn("[WALKTHROUGH] manual step confirmation ignored; no confirmation is pending");
    return false;
  }
  safeLog("[WALKTHROUGH] manual step confirmation received");
  pendingManualConfirm();
  return true;
}
function stepsForNode(nodeId, appName) {
  const graph = loadGraph(appName);
  const sessions = nodeId ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId)) : graph.sessions.filter((s) => s.steps.length > 0);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}
function logWalkthroughStep(step, index, total, attempt) {
  safeLog("[WALKTHROUGH] step", {
    index,
    displayIndex: index + 1,
    total,
    attempt,
    title: stepTitle$1(step),
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
  safeLog("[GHOST] visual step emitted", {
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
    safeLog("[GHOST] looping started", { index, attempt, timeoutMs: DEFAULT_STEP_TIMEOUT_MS });
  }
}
function parkGhostAtEndpoint(step, index, total, attempt) {
  safeLog("[GHOST] parked at endpoint", { index, action: step.action, x: step.x, y: step.y });
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
  safeLog("[WALKTHROUGH] start", { totalSteps: steps.length });
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
          const waitMs = stepWaitMs$1(step);
          safeLog("[WALKTHROUGH] wait step sleeping", { index, waitMs });
          result = await sleep(waitMs, controller) ? "correct" : "cancelled";
        } else if (step.action === "click") {
          safeLog("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          });
          result = await waitForUserNearTarget(step, controller);
          if (result === "correct") {
            safeLog("[USER_CURSOR] real cursor entered tolerance", { index, x: step.x, y: step.y });
            previousGhostTarget = { x: step.x, y: step.y };
            parkGhostAtEndpoint(step, index, steps.length, attempts);
            safeLog("[CLICK_DETECT] waiting for actual user click", {
              index,
              x: step.x,
              y: step.y,
              tolerancePx: TARGET_CLICK_TOLERANCE_PX
            });
            result = await waitForUserClickOnTarget(step, controller);
            if (result === "correct") {
              safeLog("[CLICK_DETECT] Success: User click detected at target", { index, x: step.x, y: step.y });
            } else if (result === "timeout" && isActive(controller)) {
              safeWarn("[CLICK_DETECT] Failed: Click not detected within timeout. Activating Space/Enter fallback.");
              result = await waitForManualStepConfirmation(step, index, steps.length, controller);
              if (result === "correct") {
                safeLog("[CLICK_DETECT] Step advanced by Space/Enter manual confirmation", { index, x: step.x, y: step.y });
              }
            }
          }
        } else {
          safeLog("[USER_CURSOR] waiting for real cursor to enter tolerance", {
            index,
            action: step.action,
            x: step.x,
            y: step.y,
            tolerancePx: TARGET_APPROACH_TOLERANCE_PX
          });
          result = await waitForUserNearTarget(step, controller);
          if (result === "correct") {
            safeLog("[USER_CURSOR] real cursor entered tolerance", { index, action: step.action, x: step.x, y: step.y });
            previousGhostTarget = { x: step.x, y: step.y };
            parkGhostAtEndpoint(step, index, steps.length, attempts);
          }
        }
        if (result === "correct") {
          safeLog("[WALKTHROUGH] step complete", { index, action: step.action, title: stepTitle$1(step) });
        } else if (result === "timeout") {
          attempts++;
          recordReplayBehavioralEvent("retry", stepTitle$1(step));
          safeWarn("[WALKTHROUGH] step timed out", {
            index,
            action: step.action,
            title: stepTitle$1(step),
            attempt: attempts,
            maxAttempts: MAX_WALKTHROUGH_ATTEMPTS
          });
          if (attempts >= MAX_WALKTHROUGH_ATTEMPTS) {
            recordReplayBehavioralEvent("failure", stepTitle$1(step));
            safeWarn("[WALKTHROUGH] step skipped after timeout", { index, action: step.action, title: stepTitle$1(step) });
            break;
          }
        } else if (result === "cancelled") {
          safeWarn("[WALKTHROUGH] step cancelled", { index, action: step.action, title: stepTitle$1(step) });
          break;
        }
      }
    }
    if (!controller.cancelled) {
      safeLog("[WALKTHROUGH] complete");
      sendOverlay("replay:complete", {});
    }
  } finally {
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[WALKTHROUGH] finished", { cancelled: controller.cancelled });
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
  ipcMain.handle("replay:confirmStep", async () => confirmReplayStep());
}
const DEFAULT_MIRROR_MOVE_MS = 650;
const DEFAULT_MIRROR_WAIT_MS = 620;
function stepWaitMs(step, signature) {
  const base = step.waitForMs || step.delayMs || DEFAULT_MIRROR_WAIT_MS;
  return durationForPersona(base, signature);
}
function stepTitle(step) {
  return step.instruction || step.targetLabel || step.title || step.id || "Untitled step";
}
function durationForPersona(baseMs, signature) {
  const state = normalizeBehavioralState(signature);
  const base = typeof baseMs === "number" && Number.isFinite(baseMs) ? Math.max(120, baseMs) : DEFAULT_MIRROR_MOVE_MS;
  const impulsivityFactor = 1.52 - state.impulsivity * 0.98;
  const loadFactor = 1 + state.cognitiveLoad * 0.52;
  const confidenceFactor = 1 - state.decisionConfidence * 0.32;
  const flowFactor = 1 - state.flowScore * 0.12;
  return Math.round(Math.min(1800, Math.max(240, base * impulsivityFactor * loadFactor * confidenceFactor * flowFactor)));
}
async function mirrorReplayExecute(steps, signature) {
  const controller = createReplayController();
  const state = normalizeBehavioralState(signature);
  setOverlayForReplay();
  sendOverlay("mirror:started", { total: steps.length, signature: state });
  sendOverlay("spec:mood", "mirroring");
  safeLog("[MIRROR_MODE] STARTING persona-conditioned real OS automation", {
    totalSteps: steps.length,
    impulsivity: state.impulsivity,
    cognitiveLoad: state.cognitiveLoad,
    decisionConfidence: state.decisionConfidence
  });
  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      const moveDurationMs = durationForPersona(DEFAULT_MIRROR_MOVE_MS, state);
      const preDelayMs = durationForPersona(step.delayMs || 120, state);
      sendOverlay("mirror:progress", { index, total: steps.length, step, signature: state });
      safeLog("[MIRROR_MODE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y,
        moveDurationMs,
        preDelayMs
      });
      if (step.action === "wait") {
        if (!await sleep(stepWaitMs(step, state), controller)) break;
      } else if (step.action === "click") {
        if (!await sleep(preDelayMs, controller)) break;
        await clickRealMouse(step.x, step.y, moveDurationMs);
      } else {
        if (!await sleep(preDelayMs, controller)) break;
        await executeRealMouseSteps([{ ...step, delayMs: 0 }], moveDurationMs);
      }
      sendOverlay("replay:progress", { index, total: steps.length });
      safeLog("[MIRROR_MODE] real mouse step complete", { index, action: step.action });
    }
    if (!controller.cancelled) {
      sendOverlay("mirror:complete", { total: steps.length });
      sendOverlay("spec:mood", "celebrating");
    }
  } catch (error) {
    recordReplayBehavioralEvent("failure", "Mirror Mode execution failed");
    sendOverlay("mirror:error", { message: error instanceof Error ? error.message : String(error) });
    sendOverlay("spec:mood", "stuck");
    throw error;
  } finally {
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[MIRROR_MODE] automation finished", { cancelled: controller.cancelled });
  }
}
const CONTROLLED_DEMO_NODE_ID = "Specter Controlled Demo";
const CONTROLLED_DEMO_INTENT = "Controlled Specter demo";
const CONTROLLED_DEMO_WIDTH = 900;
const CONTROLLED_DEMO_HEIGHT = 650;
const DEMO_TARGETS = {
  buttonOne: { x: 0.28, y: 0.32 },
  buttonTwo: { x: 0.72, y: 0.32 },
  textInput: { x: 0.5, y: 0.54 },
  finalConfirm: { x: 0.5, y: 0.74 }
};
function contentTargetPercent(window, target) {
  const contentBounds = window && !window.isDestroyed() ? window.getContentBounds() : null;
  const fallbackBounds = electron.screen.getPrimaryDisplay().bounds;
  const bounds = contentBounds || fallbackBounds;
  const logicalX = bounds.x + bounds.width * target.x;
  const logicalY = bounds.y + bounds.height * target.y;
  return logicalPointToPercent(logicalX, logicalY);
}
function createControlledDemoWorkflow(window) {
  const buttonOne = contentTargetPercent(window, DEMO_TARGETS.buttonOne);
  const buttonTwo = contentTargetPercent(window, DEMO_TARGETS.buttonTwo);
  const textInput = contentTargetPercent(window, DEMO_TARGETS.textInput);
  const finalConfirm = contentTargetPercent(window, DEMO_TARGETS.finalConfirm);
  return {
    nodeId: CONTROLLED_DEMO_NODE_ID,
    intent: CONTROLLED_DEMO_INTENT,
    steps: [
      {
        id: "demo-button-1",
        instruction: "Open settings.",
        targetLabel: "Open Settings",
        x: buttonOne.x,
        y: buttonOne.y,
        action: "click"
      },
      {
        id: "demo-button-2",
        instruction: "Choose template.",
        targetLabel: "Choose Template",
        x: buttonTwo.x,
        y: buttonTwo.y,
        action: "click"
      },
      {
        id: "demo-type-text",
        instruction: "Name the project.",
        targetLabel: "Project name",
        x: textInput.x,
        y: textInput.y,
        action: "type",
        typeText: "Specter Launch"
      },
      {
        id: "demo-final-confirm",
        instruction: "Create project.",
        targetLabel: "Create",
        x: finalConfirm.x,
        y: finalConfirm.y,
        action: "click"
      }
    ]
  };
}
const icon = path.join(__dirname, "../../resources/icon.png");
const DEFAULT_APP_NAME = "Specter";
const REAL_APP_CONFIDENCE_THRESHOLD = 0.65;
let mainWindow = null;
let overlayWindow = null;
function bufferFromAudioData(audioData) {
  if (!audioData) return Buffer.alloc(0);
  if (Buffer.isBuffer(audioData)) return audioData;
  if (audioData instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(audioData));
  }
  if (ArrayBuffer.isView(audioData)) {
    return Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
  }
  return Buffer.from(audioData);
}
function byteLengthOfAudioData(audioData) {
  if (!audioData) return 0;
  if (typeof audioData.byteLength === "number") return audioData.byteLength;
  if (typeof audioData.length === "number") return audioData.length;
  return 0;
}
function displaySummary(display) {
  return {
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    workArea: display.workArea
  };
}
function getSummonDisplay() {
  safeLog("[WINDOW_ROUTING] overlay summon request");
  const cursorPoint = electron.screen.getCursorScreenPoint();
  const display = electron.screen.getDisplayNearestPoint(cursorPoint);
  safeLog("[WINDOW_ROUTING] cursor point", cursorPoint);
  safeLog("[WINDOW_ROUTING] selected display id / bounds", displaySummary(display));
  setActiveCoordinateDisplay(display.id);
  return { cursorPoint, display };
}
function enableOverlayWorkspaceBehavior() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setAlwaysOnTop(true, "screen-saver", 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") {
    overlayWindow.setFullScreenable(false);
  }
  safeLog("[WINDOW_ROUTING] visible on all workspaces enabled", {
    displayId: electron.screen.getDisplayMatching(overlayWindow.getBounds()).id,
    platform: process.platform
  });
}
function moveOverlayToDisplay(display) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setBounds(display.bounds);
  enableOverlayWorkspaceBehavior();
  safeLog("[WINDOW_ROUTING] moved overlay to display", displaySummary(display));
}
function centerContentBounds(display, width, height) {
  const workArea = display.workArea;
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height
  };
}
function movePracticeWindowToDisplay(display, showWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setContentBounds(centerContentBounds(display, CONTROLLED_DEMO_WIDTH, CONTROLLED_DEMO_HEIGHT));
  safeLog("[WINDOW_ROUTING] moved practice window to display", displaySummary(display));
  if (showWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}
function overlayIsOnDisplay(display) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  return electron.screen.getDisplayMatching(overlayWindow.getBounds()).id === display.id;
}
function routeVisibleWindowsToDisplay(display) {
  moveOverlayToDisplay(display);
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    movePracticeWindowToDisplay(display, false);
  }
}
function registerWindowRoutingListeners() {
  const refreshVisibleOverlayRoute = (reason) => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible()) return;
    safeLog("[WINDOW_ROUTING] refreshing visible overlay route", { reason });
    safeLog("[STRESS_TEST] display topology changed while overlay was visible", { reason });
    const { display } = getSummonDisplay();
    routeVisibleWindowsToDisplay(display);
  };
  electron.screen.on("display-metrics-changed", () => refreshVisibleOverlayRoute("display-metrics-changed"));
  electron.screen.on("display-added", () => refreshVisibleOverlayRoute("display-added"));
  electron.screen.on("display-removed", () => refreshVisibleOverlayRoute("display-removed"));
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function clampPercent(value, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
}
function confidenceValue(value, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, normalized));
}
function realAppAction(value) {
  return ["click", "type", "scroll", "wait"].includes(value) ? value : "click";
}
function safeLabel(value, fallback = "Selected target") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function instructionForTarget(label, action2) {
  if (action2 === "type") return `Move to ${label}.`;
  if (action2 === "scroll") return `Scroll near ${label}.`;
  if (action2 === "wait") return `Watch ${label}.`;
  return `Click ${label}.`;
}
function createRealAppStep(target, source) {
  const label = safeLabel(target?.label, source === "manual" ? "Manual target" : "Selected target");
  const action2 = realAppAction(target?.action);
  return {
    id: source === "manual" ? "manual-real-app-target" : safeLabel(target?.id, "real-app-target"),
    title: source === "manual" ? "Manual target" : label,
    instruction: instructionForTarget(label, action2),
    targetLabel: label,
    action: action2,
    x: clampPercent(target?.x),
    y: clampPercent(target?.y)
  };
}
function realAppNodeId(input, label) {
  const microTask = safeLabel(input?.microTask, "");
  const intent = safeLabel(input?.intent, "");
  const title = microTask || intent || `Click ${label}`;
  return `Real App Test: ${title}`.slice(0, 120);
}
function isLearningGraph(value) {
  return Boolean(
    value && typeof value === "object" && "userId" in value && "app" in value && "nodes" in value && "sessions" in value && "bandtState" in value
  );
}
function sendOverlayEvent(channel, payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send(channel, payload);
}
function sortedBehavioralCheckpoints(graph, includeSynthetic = true) {
  return Object.values(graph.behavioralCheckpoints || {}).filter((checkpoint) => includeSynthetic || checkpoint.synthetic !== true).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
function behavioralCheckpointForId(graph, checkpointId) {
  const checkpoints = graph.behavioralCheckpoints || {};
  return typeof checkpointId === "string" && checkpoints[checkpointId] ? checkpoints[checkpointId] : null;
}
function newestBehavioralCheckpoint(graph) {
  const checkpoints = sortedBehavioralCheckpoints(graph, false);
  return checkpoints[checkpoints.length - 1] || null;
}
function realBehavioralFrameCount(graph) {
  const persisted = (graph.behavioralFrames || []).filter((frame) => frame.synthetic !== true).length;
  return persisted + getBufferedBehavioralFrameCount();
}
function hasRealBehavioralSignature(graph) {
  return realBehavioralFrameCount(graph) > 0 || sortedBehavioralCheckpoints(graph, false).length > 0;
}
function realCheckpointOrNull(checkpoint) {
  return checkpoint && checkpoint.synthetic !== true ? checkpoint : null;
}
function safeFeedbackArm(value) {
  return value === "A" || value === "B" || value === "C" ? value : "C";
}
function latestStepsForNode(graph, nodeId) {
  const sessions = nodeId ? graph.sessions.filter((session) => session.nodesVisited.includes(nodeId)) : graph.sessions.filter((session) => session.steps.length > 0);
  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  return latest?.steps || [];
}
function selectMirrorSignature(graph, input) {
  if (input?.blendedSignature) return normalizeBehavioralState(input.blendedSignature);
  const requested = realCheckpointOrNull(behavioralCheckpointForId(graph, input?.checkpointId));
  if (requested) return requested.signature;
  const current = realCheckpointOrNull(behavioralCheckpointForId(graph, graph.currentBehavioralCheckpointId));
  if (current) return current.signature;
  return newestBehavioralCheckpoint(graph)?.signature || getCurrentBehavioralState() || createDefaultBehavioralState();
}
function toggleOverlay() {
  safeLog("[TOGGLE] toggleOverlay called, isVisible:", overlayWindow?.isVisible());
  if (!overlayWindow) return;
  if (hasActiveReplay()) {
    safeWarn("[TOGGLE] double-shift pressed during active replay; stopping replay instead of hiding the overlay");
    stopReplay();
    return;
  }
  const { display } = getSummonDisplay();
  if (overlayWindow.isVisible()) {
    if (!overlayIsOnDisplay(display)) {
      safeLog("[WINDOW_ROUTING] overlay already visible; moving to active display instead of hiding");
      routeVisibleWindowsToDisplay(display);
      overlayWindow.showInactive();
      overlayWindow.moveTop();
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      return;
    }
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog("[OVERLAY_INTERACTION] hiding overlay, enabled click-through");
      safeLog("[STRESS_TEST] overlay hidden; click-through restored");
    }
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
  } else {
    routeVisibleWindowsToDisplay(display);
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog("[OVERLAY_INTERACTION] showing overlay, enabled click-through (ignore mouse: true)");
      safeLog("[STRESS_TEST] overlay shown; duplicate window count", {
        windows: electron.BrowserWindow.getAllWindows().length
      });
    }
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.showInactive();
    overlayWindow.moveTop();
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
    width: CONTROLLED_DEMO_WIDTH,
    height: CONTROLLED_DEMO_HEIGHT,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    safeLog("[WINDOW_ROUTING] practice window ready and waiting for controlled demo");
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
  const initialDisplay = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
  const { x, y, width, height } = initialDisplay.bounds;
  setActiveCoordinateDisplay(initialDisplay.id);
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
    visibleOnAllWorkspaces: true,
    fullscreenable: false,
    focusable: true,
    acceptFirstMouse: true,
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
  enableOverlayWorkspaceBehavior();
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
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
  registerWindowRoutingListeners();
  const shouldOpenDevTools = !electron.app.isPackaged && process.env["SPECTER_OPEN_DEVTOOLS"] === "true";
  if (shouldOpenDevTools) {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
    overlayWindow?.webContents.openDevTools({ mode: "detach" });
  }
  if (!electron.app.isPackaged) {
    electron.globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
    });
  }
  uiohookNapi.uIOhook.start();
  setBehavioralStateEmitter((state) => {
    sendOverlayEvent("spec:state", state);
    sendOverlayEvent("spec:mood", state.moodLabel);
  });
  startBehavioralTracking();
  setTimeout(() => {
    const { realFrames, trackingMs } = getBehavioralFrameRate();
    if (trackingMs > 8e3 && realFrames < 3) {
      safeWarn("[BEHAVIOR] No real frames after 12s - uiohook likely blocked by macOS permissions");
      sendOverlayEvent("spec:mood", "stuck");
      sendOverlayEvent("behavior:permissions-warning", {
        message: "Specter needs Accessibility + Input Monitoring permissions. Grant them in System Settings -> Privacy & Security, then restart."
      });
    }
  }, 12e3);
  electron.app.on("browser-window-blur", (_event, window) => {
    recordAppSwitchFrame(window === overlayWindow ? "overlay blur" : "window blur");
  });
  electron.app.on("browser-window-focus", (_event, window) => {
    recordAppSwitchFrame(window === overlayWindow ? "overlay focus" : "window focus");
  });
  electron.app.on("before-quit", () => {
    stopBehavioralTracking();
    setBehavioralStateEmitter(null);
  });
  electron.ipcMain.on("overlay:hide", () => {
    if (!overlayWindow) return;
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.hide();
  });
  electron.ipcMain.handle("cursor:move", async (_event, x, y, durationMs) => {
    safeLog("[IPC] cursor:move", { x, y, durationMs });
    return moveRealMouse(x, y, durationMs);
  });
  electron.ipcMain.handle("cursor:click", async (_event, x, y) => clickRealMouse(x, y));
  electron.ipcMain.handle("cursor:replay", async (_event, steps) => {
    safeWarn("[AUTO_REAL_MOUSE] LOUD WARNING: REAL OS automation steps triggered from IPC", { count: steps?.length });
    return executeRealMouseSteps(steps);
  });
  electron.ipcMain.handle("cursor:getPosition", async () => getMousePosition());
  electron.ipcMain.handle("cursor:getPositionPercent", async () => getMousePercent());
  electron.ipcMain.handle("cursor:diagnostics", async () => getCoordinateCalibrationDiagnostics());
  electron.ipcMain.handle("cursor:moveCenter", async () => {
    safeLog("[COORD_CALIBRATION] explicit center move requested");
    return moveRealMouse(50, 50);
  });
  electron.ipcMain.handle("cursor:waitForTarget", async (_event, x, y, tolerancePx = 50, timeoutMs = 12e3) => {
    safeLog("[IPC] cursor:waitForTarget", { x, y, tolerancePx, timeoutMs });
    return waitForMouseAtTarget(x, y, tolerancePx, timeoutMs);
  });
  electron.ipcMain.handle("overlay:setClickThrough", async (_event, clickThrough) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (process.env.DEBUG_VERBOSE === "true") {
      safeLog(`[OVERLAY_INTERACTION] ${clickThrough ? "enabled click-through" : "enabled interactive zone"}`);
    }
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  });
  electron.ipcMain.handle("screen:capture", async (event) => {
    safeLog("[IPC] screen:capture");
    try {
      return await captureScreenBase64();
    } catch (err) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        event.sender.send("permissions:screen-denied");
      }
      throw err;
    }
  });
  electron.ipcMain.handle("screen:analyze", async (event, base64PNG, options) => {
    safeLog("[IPC] screen:analyze", { hasBase64: !!base64PNG, captureUnderlying: !!options?.captureUnderlying });
    const captureUnderlying = options?.captureUnderlying;
    const logPrefix = captureUnderlying ? "[CAPTURE_UNDERLYING]" : "[CAPTURE_SCREEN]";
    const wasOverlayVisible = captureUnderlying && Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    try {
      if (wasOverlayVisible && overlayWindow) {
        safeLog("[CAPTURE_UNDERLYING] hiding overlay before screen capture");
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.hide();
        await delay(160);
      }
      safeLog(`${logPrefix} starting screenshot capture`);
      const screenshot = base64PNG || await captureScreenBase64();
      safeLog(`${logPrefix} screenshot captured`, { bytesBase64: screenshot.length });
      const result = await analyzeScreen(screenshot);
      recordBehavioralFrame({
        t: Date.now(),
        dwellMs: 0,
        actionType: "scan",
        revisionSignal: 0,
        app: typeof result?.app === "string" ? result.app : "screen",
        targetLabel: "real screenshot/VLM state"
      });
      return result;
    } catch (err) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        event.sender.send("permissions:screen-denied");
      }
      safeError("[Specter] Screen analysis failed; using fallback screen state:", err);
      return fallbackScreenState();
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        safeLog("[CAPTURE_UNDERLYING] restoring overlay after capture, click-through true");
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });
  electron.ipcMain.handle("realApp:detectTargets", async (event, userIntent = "") => {
    const prompt = typeof userIntent === "string" && userIntent.trim() ? userIntent.trim() : "Teach one visible action";
    safeLog("[REAL_APP_TEST] capture requested", { prompt });
    const wasOverlayVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible());
    try {
      if (wasOverlayVisible && overlayWindow) {
        safeLog("[CAPTURE_UNDERLYING] hiding overlay before real-app target detection");
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.hide();
        await delay(160);
      }
      safeLog("[CAPTURE_UNDERLYING] starting screenshot capture for real-app targets");
      const screenshot = await captureScreenBase64();
      safeLog("[CAPTURE_UNDERLYING] screenshot captured for real-app targets", {
        prompt,
        bytesBase64: screenshot.length
      });
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        safeLog("[CAPTURE_UNDERLYING] restoring overlay after real-app capture, click-through true");
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
      const result = await detectScreenTargets(screenshot, prompt);
      recordBehavioralFrame({
        t: Date.now(),
        dwellMs: 0,
        actionType: "scan",
        revisionSignal: result.targets.length > 0 ? 0 : 0.35,
        app: typeof result.app === "string" ? result.app : "screen",
        targetLabel: `VLM targets: ${result.targets.length}`
      });
      safeLog("[SCREEN_TARGETS] targets returned", {
        prompt,
        app: result.app,
        count: result.targets.length,
        threshold: REAL_APP_CONFIDENCE_THRESHOLD,
        topConfidence: result.targets[0]?.confidence ?? null
      });
      return {
        ...result,
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD
      };
    } catch (err) {
      if (isPermissionError(err) || err.code === "SCREEN_PERMISSION_DENIED") {
        event.sender.send("permissions:screen-denied");
      }
      safeError("[REAL_APP_TEST] target detection failed:", err);
      return {
        ...fallbackScreenTargets(prompt),
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD
      };
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  });
  electron.ipcMain.handle("realApp:createWorkflow", async (_event, input) => {
    const target = input && typeof input === "object" ? input.target : null;
    const mode = input?.mode === "ultra" ? "ultra" : "silent";
    safeLog("[MODE] current mode", { mode, flow: "real-app-workflow" });
    const source = target?.source === "manual" || input?.source === "manual" ? "manual" : "vision";
    const step = createRealAppStep(target, source);
    const nodeId = realAppNodeId(input, step.targetLabel || step.title || "Selected target");
    const targetConfidence = confidenceValue(target?.confidence, source === "manual" ? 1 : 0);
    if (source === "manual") {
      safeLog("[MANUAL_TARGET] saving manual real-app target", {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y
      });
    } else {
      safeLog("[TARGET_CONFIRM] saving confirmed real-app target", {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y,
        confidence: targetConfidence
      });
    }
    const graph = saveToNode(loadGraph(DEFAULT_APP_NAME), nodeId, [step]);
    saveGraph(graph);
    safeLog("[REAL_APP_WALKTHROUGH] workflow ready", {
      nodeId,
      totalSteps: 1,
      label: step.targetLabel,
      source,
      mode,
      confidence: targetConfidence
    });
    return {
      nodeId,
      steps: [step],
      intent: safeLabel(input?.intent, step.targetLabel || "Real App Test"),
      source,
      confidence: targetConfidence
    };
  });
  electron.ipcMain.handle("planner:plan", async (_event, userIntent, screenState, sessionHistory, mode) => {
    safeLog("[IPC] planner:plan", { userIntent, mode });
    return planSteps(userIntent, screenState, sessionHistory, mode);
  });
  electron.ipcMain.handle(
    "planner:converse",
    async (_event, userMessage, screenState, conversationHistory) => converse(userMessage, screenState, conversationHistory)
  );
  electron.ipcMain.handle("ultra:converse", async (_event, payload) => {
    safeLog("[ULTRA_IPC] ultra:converse received");
    return ultraConverse(payload);
  });
  electron.ipcMain.handle("ai:healthCheck", async () => checkAIHealth());
  electron.ipcMain.handle("session:save", async (_event, graph) => {
    if (isLearningGraph(graph)) {
      saveGraph(graph);
      return graph;
    }
    return loadGraph(DEFAULT_APP_NAME);
  });
  electron.ipcMain.handle("session:load", async (_event, appName = DEFAULT_APP_NAME) => loadGraph(appName));
  electron.ipcMain.handle("behavior:getState", async () => getCurrentBehavioralState());
  electron.ipcMain.handle("behavior:recordFrame", async (_event, frame, appName = DEFAULT_APP_NAME) => {
    const recorded = recordBehavioralFrame(frame);
    const graph = loadGraph(appName);
    graph.behavioralFrames = [...graph.behavioralFrames || [], recorded].slice(-500);
    saveGraph(graph);
    const state = getCurrentBehavioralState();
    sendOverlayEvent("spec:state", state);
    sendOverlayEvent("spec:mood", state.moodLabel);
    return { frame: recorded, state };
  });
  electron.ipcMain.handle("behavior:createCheckpoint", async (_event, appName = DEFAULT_APP_NAME) => {
    const result = createCheckpointFromCurrentGraph(loadGraph(appName));
    saveGraph(result.graph);
    sendOverlayEvent("behavior:checkpoint-created", result.checkpoint);
    sendOverlayEvent("spec:state", result.checkpoint.signature);
    sendOverlayEvent("spec:mood", result.checkpoint.signature.moodLabel);
    return result.checkpoint;
  });
  electron.ipcMain.handle(
    "behavior:listCheckpoints",
    async (_event, appName = DEFAULT_APP_NAME) => sortedBehavioralCheckpoints(loadGraph(appName))
  );
  electron.ipcMain.handle("behavior:diffCheckpoints", async (_event, fromId, toId, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    const from = realCheckpointOrNull(behavioralCheckpointForId(graph, fromId));
    const to = realCheckpointOrNull(behavioralCheckpointForId(graph, toId));
    if (!from || !to) return null;
    return diffBehavioralCheckpoints(from, to);
  });
  electron.ipcMain.handle("behavior:blendCheckpoints", async (_event, fromId, toId, t, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    const from = realCheckpointOrNull(behavioralCheckpointForId(graph, fromId));
    const to = realCheckpointOrNull(behavioralCheckpointForId(graph, toId));
    if (!from || !to) return null;
    const state = blendBehavioralStates(from.signature, to.signature, t);
    sendOverlayEvent("spec:state", state);
    sendOverlayEvent("spec:mood", state.moodLabel);
    return state;
  });
  electron.ipcMain.handle("behavior:seedDemo", async (_event, appName = DEFAULT_APP_NAME) => {
    if (electron.app.isPackaged && process.env.SPECTER_ENABLE_DEV_FALLBACK !== "true") {
      throw new Error("Synthetic demo checkpoints are a dev-only fallback and cannot be used as learned behavior.");
    }
    const result = seedDemoCheckpoints(loadGraph(appName));
    saveGraph(result.graph);
    const current = result.checkpoints[result.checkpoints.length - 1];
    sendOverlayEvent("behavior:checkpoint-created", current);
    sendOverlayEvent("spec:state", current?.signature || getCurrentBehavioralState());
    sendOverlayEvent("spec:mood", current?.signature.moodLabel || "idle");
    return sortedBehavioralCheckpoints(result.graph);
  });
  electron.ipcMain.handle("behavior:feedback", async (_event, input = {}, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName);
    const result = recordBehavioralFeedback(input);
    const arm = safeFeedbackArm(input?.arm);
    graph.behavioralFrames = [...graph.behavioralFrames || [], result.frame].slice(-500);
    graph.bandtState = recordReward(graph.bandtState, arm, result.reward);
    saveGraph(graph);
    const state = getCurrentBehavioralState();
    sendOverlayEvent("spec:state", state);
    sendOverlayEvent("spec:mood", state.moodLabel);
    safeLog("[BEHAVIOR] feedback recorded", {
      kind: input?.kind || "hesitation",
      reward: result.reward,
      arm,
      actionType: result.frame.actionType
    });
    return { frame: result.frame, state, reward: result.reward, bandtState: graph.bandtState };
  });
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
  electron.ipcMain.handle("demo:controlledWorkflow", async () => {
    const { display } = getSummonDisplay();
    moveOverlayToDisplay(display);
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      movePracticeWindowToDisplay(display, true);
    }
    const workflow = createControlledDemoWorkflow(mainWindow);
    const graph = saveToNode(loadGraph(DEFAULT_APP_NAME), workflow.nodeId, workflow.steps);
    saveGraph(graph);
    safeLog("[DEMO] controlled workflow prepared", {
      nodeId: workflow.nodeId,
      totalSteps: workflow.steps.length,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        action: step.action,
        x: step.x,
        y: step.y
      }))
    });
    return workflow;
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
  electron.ipcMain.handle("mirror:run", async (_event, input = {}, appName = DEFAULT_APP_NAME) => {
    if (input?.confirmed !== true) {
      const message = "Mirror Mode requires visible renderer confirmation before real mouse automation.";
      sendOverlayEvent("mirror:error", { message });
      sendOverlayEvent("spec:mood", "stuck");
      throw new Error(message);
    }
    const graph = loadGraph(appName);
    if (!hasRealBehavioralSignature(graph)) {
      const message = "Mirror Mode needs measured behavioral frames or a real behavioral checkpoint before it can run.";
      sendOverlayEvent("mirror:error", { message });
      sendOverlayEvent("spec:mood", "stuck");
      throw new Error(message);
    }
    const signature = selectMirrorSignature(graph, input);
    sendOverlayEvent("mirror:started", { signature });
    sendOverlayEvent("spec:mood", "mirroring");
    try {
      let steps = latestStepsForNode(graph, input?.nodeId);
      if (steps.length === 0) {
        steps = latestStepsForNode(graph);
      }
      if (steps.length === 0) {
        const message = "Mirror Mode needs a real recorded or saved workflow. Start a real-app walkthrough or record a session first.";
        sendOverlayEvent("mirror:error", { message });
        sendOverlayEvent("spec:mood", "stuck");
        throw new Error(message);
      }
      await mirrorReplayExecute(steps, signature);
      sendOverlayEvent("mirror:complete", { total: steps.length });
      sendOverlayEvent("spec:mood", "celebrating");
      return { ok: true, totalSteps: steps.length, signature };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      safeError("[MIRROR_MODE] failed", error);
      sendOverlayEvent("mirror:error", { message });
      sendOverlayEvent("spec:mood", "stuck");
      throw error;
    }
  });
  electron.ipcMain.handle("tts:speak", async (_event, text) => {
    safeLog("[IPC] tts:speak", { text: text?.slice(0, 50) });
    return speak(text);
  });
  electron.ipcMain.handle("tts:stop", async () => stopSpeaking());
  electron.ipcMain.handle("ai:testVoiceOutput", async () => {
    safeLog("[IPC] ai:testVoiceOutput");
    return speak("Specter voice test. This is a check of the natural speech system.");
  });
  electron.ipcMain.handle("whisper:transcribe", async (_event, audioData) => {
    const buffer = bufferFromAudioData(audioData);
    safeLog("[IPC] whisper:transcribe", {
      byteLength: byteLengthOfAudioData(audioData),
      convertedBufferLength: buffer.length
    });
    return transcribe(buffer);
  });
  registerReplayIpc(electron.ipcMain, () => overlayWindow);
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
      if (shouldOpenDevTools) {
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
