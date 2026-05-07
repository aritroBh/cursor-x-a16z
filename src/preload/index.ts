import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Cursor
  moveCursor: (x: number, y: number, durationMs?: number) => ipcRenderer.invoke('cursor:move', x, y, durationMs),
  clickCursor: (x: number, y: number) => ipcRenderer.invoke('cursor:click', x, y),
  replaySteps: (steps: any[]) => ipcRenderer.invoke('cursor:replay', steps),
  getCursorPosition: () => ipcRenderer.invoke('cursor:getPosition'),
  waitForCursorTarget: (x: number, y: number, tolerancePx?: number, timeoutMs?: number) =>
    ipcRenderer.invoke('cursor:waitForTarget', x, y, tolerancePx, timeoutMs),

  // Overlay
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  setOverlayClickThrough: (clickThrough: boolean) => ipcRenderer.invoke('overlay:setClickThrough', clickThrough),
  onOverlayToggle: (callback: () => void) => ipcRenderer.on('overlay:toggle', () => callback()),

  // Screen
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  analyzeScreen: (base64PNG?: string) => ipcRenderer.invoke('screen:analyze', base64PNG),
  onScreenPermissionDenied: (callback: () => void) => ipcRenderer.on('permissions:screen-denied', () => callback()),

  // Planner
  planSteps: (userIntent: string, screenState: any, sessionHistory: any[], mode: string) =>
    ipcRenderer.invoke('planner:plan', userIntent, screenState, sessionHistory, mode),
  converse: (userMessage: string, screenState: any, conversationHistory: any[]) =>
    ipcRenderer.invoke('planner:converse', userMessage, screenState, conversationHistory),

  // Session
  saveSession: (graph: any) => ipcRenderer.invoke('session:save', graph),
  loadSession: (appName?: string) => ipcRenderer.invoke('session:load', appName),
  getResumePrompt: (appName?: string) => ipcRenderer.invoke('session:resume-prompt', appName),
  startRecording: () => ipcRenderer.invoke('session:record-start'),
  recordStep: (step: any) => ipcRenderer.invoke('session:record-step', step),
  stopRecording: () => ipcRenderer.invoke('session:record-stop'),
  saveNode: (nodeId: string, steps: any[], appName?: string) =>
    ipcRenderer.invoke('session:save-node', nodeId, steps, appName),
  markNodeComplete: (nodeId: string, appName?: string) => ipcRenderer.invoke('session:mark-complete', nodeId, appName),
  createBranch: (fromNodeId: string, fromStep: number, appName?: string) =>
    ipcRenderer.invoke('session:create-branch', fromNodeId, fromStep, appName),
  getNextNode: (appName?: string) => ipcRenderer.invoke('session:next-node', appName),
  getAvailableNodes: (appName?: string) => ipcRenderer.invoke('session:available-nodes', appName),

  // Bandit
  selectStyle: (appName?: string) => ipcRenderer.invoke('bandit:select', appName),
  recordReward: (arm: string, reward: number, appName?: string) =>
    ipcRenderer.invoke('bandit:reward', arm, reward, appName),
  getCurrentStyle: (appName?: string) => ipcRenderer.invoke('bandit:style', appName),

  // TTS & Whisper
  speak: (text: string) => ipcRenderer.invoke('tts:speak', text),
  stopSpeaking: () => ipcRenderer.invoke('tts:stop'),
  transcribe: (audioData: ArrayBuffer) => ipcRenderer.invoke('whisper:transcribe', audioData),

  // Replay System
  walkthrough: (nodeId?: string) => ipcRenderer.invoke('replay:walkthrough', nodeId),
  autoExecute: (nodeId?: string) => ipcRenderer.invoke('replay:auto', nodeId),
  stopReplay: () => ipcRenderer.invoke('replay:stop'),
  onReplayStep: (callback: (data: any) => void) => ipcRenderer.on('replay:step', (_event, data) => callback(data)),
  onReplayRetry: (callback: (data: any) => void) => ipcRenderer.on('replay:retry', (_event, data) => callback(data)),
  onReplayProgress: (callback: (data: any) => void) => ipcRenderer.on('replay:progress', (_event, data) => callback(data)),
  onReplayComplete: (callback: () => void) => ipcRenderer.on('replay:complete', () => callback()),
  onReplayStopped: (callback: () => void) => ipcRenderer.on('replay:stopped', () => callback())
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
