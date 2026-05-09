"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
function onIpc(channel, callback) {
  const listener = (_event, ...args) => callback(...args);
  electron.ipcRenderer.on(channel, listener);
  return () => electron.ipcRenderer.removeListener(channel, listener);
}
const api = {
  // Cursor
  moveRealMouse: (x, y, durationMs) => electron.ipcRenderer.invoke("cursor:move", x, y, durationMs),
  clickRealMouse: (x, y) => electron.ipcRenderer.invoke("cursor:click", x, y),
  executeRealMouseSteps: (steps) => electron.ipcRenderer.invoke("cursor:replay", steps),
  moveCursor: (x, y, durationMs) => electron.ipcRenderer.invoke("cursor:move", x, y, durationMs),
  clickCursor: (x, y) => electron.ipcRenderer.invoke("cursor:click", x, y),
  replaySteps: (steps) => electron.ipcRenderer.invoke("cursor:replay", steps),
  getCursorPosition: () => electron.ipcRenderer.invoke("cursor:getPosition"),
  getCursorPercent: () => electron.ipcRenderer.invoke("cursor:getPositionPercent"),
  getCursorCalibration: () => electron.ipcRenderer.invoke("cursor:diagnostics"),
  moveCursorToScreenCenter: () => electron.ipcRenderer.invoke("cursor:moveCenter"),
  waitForCursorTarget: (x, y, tolerancePx, timeoutMs) => electron.ipcRenderer.invoke("cursor:waitForTarget", x, y, tolerancePx, timeoutMs),
  // Overlay
  hideOverlay: () => electron.ipcRenderer.send("overlay:hide"),
  setOverlayClickThrough: (clickThrough) => electron.ipcRenderer.invoke("overlay:setClickThrough", clickThrough),
  onOverlayToggle: (callback) => onIpc("overlay:toggle", callback),
  // Screen
  captureScreen: () => electron.ipcRenderer.invoke("screen:capture"),
  analyzeScreen: (base64PNG, options) => electron.ipcRenderer.invoke("screen:analyze", base64PNG, options),
  onScreenPermissionDenied: (callback) => onIpc("permissions:screen-denied", callback),
  // Real App Test
  detectRealAppTargets: (userIntent) => electron.ipcRenderer.invoke("realApp:detectTargets", userIntent),
  createRealAppWorkflow: (input) => electron.ipcRenderer.invoke("realApp:createWorkflow", input),
  // Planner
  planSteps: (userIntent, screenState, sessionHistory, mode) => electron.ipcRenderer.invoke("planner:plan", userIntent, screenState, sessionHistory, mode),
  converse: (userMessage, screenState, conversationHistory) => electron.ipcRenderer.invoke("planner:converse", userMessage, screenState, conversationHistory),
  ultraConverse: (payload) => electron.ipcRenderer.invoke("ultra:converse", payload),
  checkAIBackend: () => electron.ipcRenderer.invoke("ai:healthCheck"),
  healthCheck: () => electron.ipcRenderer.invoke("ai:healthCheck"),
  // Behavioral model / Spec
  behaviorGetState: () => electron.ipcRenderer.invoke("behavior:getState"),
  behaviorRecordFrame: (frame) => electron.ipcRenderer.invoke("behavior:recordFrame", frame),
  behaviorCreateCheckpoint: () => electron.ipcRenderer.invoke("behavior:createCheckpoint"),
  behaviorListCheckpoints: () => electron.ipcRenderer.invoke("behavior:listCheckpoints"),
  behaviorDiffCheckpoints: (fromId, toId) => electron.ipcRenderer.invoke("behavior:diffCheckpoints", fromId, toId),
  behaviorBlendCheckpoints: (fromId, toId, t) => electron.ipcRenderer.invoke("behavior:blendCheckpoints", fromId, toId, t),
  behaviorSeedDemo: () => electron.ipcRenderer.invoke("behavior:seedDemo"),
  behaviorRecordFeedback: (input) => electron.ipcRenderer.invoke("behavior:feedback", input),
  runMirrorMode: (input) => electron.ipcRenderer.invoke("mirror:run", input),
  onSpecState: (callback) => onIpc("spec:state", callback),
  onSpecMood: (callback) => onIpc("spec:mood", callback),
  onBehaviorCheckpointCreated: (callback) => onIpc("behavior:checkpoint-created", callback),
  onBehaviorPermissionsWarning: (callback) => onIpc("behavior:permissions-warning", callback),
  onMirrorStarted: (callback) => onIpc("mirror:started", callback),
  onMirrorComplete: (callback) => onIpc("mirror:complete", callback),
  onMirrorError: (callback) => onIpc("mirror:error", callback),
  // Session
  saveSession: (graph) => electron.ipcRenderer.invoke("session:save", graph),
  loadSession: (appName) => electron.ipcRenderer.invoke("session:load", appName),
  getResumePrompt: (appName) => electron.ipcRenderer.invoke("session:resume-prompt", appName),
  startRecording: () => electron.ipcRenderer.invoke("session:record-start"),
  recordStep: (step) => electron.ipcRenderer.invoke("session:record-step", step),
  stopRecording: () => electron.ipcRenderer.invoke("session:record-stop"),
  saveNode: (nodeId, steps, appName) => electron.ipcRenderer.invoke("session:save-node", nodeId, steps, appName),
  markNodeComplete: (nodeId, appName) => electron.ipcRenderer.invoke("session:mark-complete", nodeId, appName),
  createBranch: (fromNodeId, fromStep, appName) => electron.ipcRenderer.invoke("session:create-branch", fromNodeId, fromStep, appName),
  getNextNode: (appName) => electron.ipcRenderer.invoke("session:next-node", appName),
  getAvailableNodes: (appName) => electron.ipcRenderer.invoke("session:available-nodes", appName),
  // Bandit
  selectStyle: (appName) => electron.ipcRenderer.invoke("bandit:select", appName),
  recordReward: (arm, reward, appName) => electron.ipcRenderer.invoke("bandit:reward", arm, reward, appName),
  getCurrentStyle: (appName) => electron.ipcRenderer.invoke("bandit:style", appName),
  // TTS & Whisper
  speak: (text) => electron.ipcRenderer.invoke("tts:speak", text),
  stopSpeaking: () => electron.ipcRenderer.invoke("tts:stop"),
  testVoiceOutput: () => electron.ipcRenderer.invoke("ai:testVoiceOutput"),
  transcribe: (audioData) => electron.ipcRenderer.invoke("whisper:transcribe", audioData),
  // Replay System
  walkthrough: (nodeId) => electron.ipcRenderer.invoke("replay:walkthrough", nodeId),
  autoExecute: (nodeId) => electron.ipcRenderer.invoke("replay:auto", nodeId),
  stopReplay: () => electron.ipcRenderer.invoke("replay:stop"),
  confirmReplayStep: () => electron.ipcRenderer.invoke("replay:confirmStep"),
  onReplayStep: (callback) => onIpc("replay:step", callback),
  onReplayRetry: (callback) => onIpc("replay:retry", callback),
  onReplayTargetReached: (callback) => onIpc("replay:target-reached", callback),
  onReplayConfirmNeeded: (callback) => onIpc("replay:confirm-needed", callback),
  onReplayConfirmCleared: (callback) => onIpc("replay:confirm-cleared", callback),
  onReplayProgress: (callback) => onIpc("replay:progress", callback),
  onReplayComplete: (callback) => onIpc("replay:complete", callback),
  onReplayStopped: (callback) => onIpc("replay:stopped", callback),
  // Demo
  prepareControlledDemo: () => electron.ipcRenderer.invoke("demo:controlledWorkflow")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
