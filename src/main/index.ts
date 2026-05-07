import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { uIOhook, UiohookKey } from 'uiohook-napi'

import { checkPermissions, isPermissionError } from './permissions'
import { captureScreenBase64 } from './capture'
import {
  clickRealMouse,
  executeRealMouseSteps,
  moveRealMouse
} from './cursor'
import { getCoordinateCalibrationDiagnostics, getPhysicalMousePosition, waitForMouseAtTarget } from './userCursor'
import { analyzeScreen, detectScreenTargets, fallbackScreenState, fallbackScreenTargets } from './ai/screener'
import { planSteps, converse } from './ai/planner'
import { speak, stopSpeaking } from './ai/tts'
import { transcribe } from './ai/whisper'
import { selectArm, recordReward, getCurrentStyle } from './ai/bandit'
import { loadGraph, saveGraph } from './session/storage'
import {
  markNodeComplete,
  createBranch,
  getAvailableNodes,
  getNextRecommendedNode,
  getResumePrompt
} from './session/graph'
import { startRecording, recordStep, stopRecording, saveToNode } from './session/recorder'
import { registerReplayIpc, replayWalkthrough } from './session/replay'
import { hasActiveReplay, stopReplay } from './session/replayController'
import { CONTROLLED_DEMO_HEIGHT, CONTROLLED_DEMO_WIDTH, createControlledDemoWorkflow } from './session/demoWorkflow'
import type { Step } from './session/types'

const icon = join(__dirname, '../../resources/icon.png')
const DEFAULT_APP_NAME = 'Specter'
const REAL_APP_CONFIDENCE_THRESHOLD = 0.65

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampPercent(value: any, fallback = 50): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback
}

function confidenceValue(value: any, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const normalized = value > 1 ? value / 100 : value
  return Math.min(1, Math.max(0, normalized))
}

function realAppAction(value: any): Step['action'] {
  return ['click', 'type', 'scroll', 'wait'].includes(value) ? value : 'click'
}

function safeLabel(value: any, fallback = 'Selected target'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function instructionForTarget(label: string, action: Step['action']): string {
  if (action === 'type') return `Move to ${label}.`
  if (action === 'scroll') return `Scroll near ${label}.`
  if (action === 'wait') return `Watch ${label}.`
  return `Click ${label}.`
}

function createRealAppStep(target: any, source: 'vision' | 'manual'): Step {
  const label = safeLabel(target?.label, source === 'manual' ? 'Manual target' : 'Selected target')
  const action = realAppAction(target?.action)

  return {
    id: source === 'manual' ? 'manual-real-app-target' : safeLabel(target?.id, 'real-app-target'),
    title: source === 'manual' ? 'Manual target' : label,
    instruction: instructionForTarget(label, action),
    targetLabel: label,
    action,
    x: clampPercent(target?.x),
    y: clampPercent(target?.y)
  }
}

function realAppNodeId(input: any, label: string): string {
  const microTask = safeLabel(input?.microTask, '')
  const intent = safeLabel(input?.intent, '')
  const title = microTask || intent || `Click ${label}`
  return `Real App Test: ${title}`.slice(0, 120)
}

function isLearningGraph(value: any): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'userId' in value &&
      'app' in value &&
      'nodes' in value &&
      'sessions' in value &&
      'bandtState' in value
  )
}

function toggleOverlay(): void {
  console.log('[TOGGLE] toggleOverlay called, isVisible:', overlayWindow?.isVisible())
  if (!overlayWindow) return
  if (hasActiveReplay()) {
    console.warn('[TOGGLE] double-shift pressed during active replay; stopping replay instead of hiding the overlay')
    stopReplay()
    return
  }
  if (overlayWindow.isVisible()) {
    console.log('[OVERLAY_INTERACTION] hiding overlay, enabled click-through')
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.hide()
  } else {
    console.log('[OVERLAY_INTERACTION] showing overlay, enabled click-through (ignore mouse: true)')
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.show()
  }
  overlayWindow.webContents.send('overlay:toggle')
}

let lastShiftTime = 0
let lastToggleTime = 0
const DOUBLE_TAP_MS = 300
const TOGGLE_COOLDOWN_MS = 300

uIOhook.on('keydown', (e) => {
  if (e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight) {
    const now = Date.now()
    if (now - lastShiftTime < DOUBLE_TAP_MS) {
      if (now - lastToggleTime >= TOGGLE_COOLDOWN_MS) {
        toggleOverlay()
        lastToggleTime = now
      }
      lastShiftTime = 0
    } else {
      lastShiftTime = now
    }
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: CONTROLLED_DEMO_WIDTH,
    height: CONTROLLED_DEMO_HEIGHT,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow(): void {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds

  overlayWindow = new BrowserWindow({
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
    backgroundColor: '#00000000',
    // 'panel' is the macOS-native overlay type: always-on-top across all
    // Spaces without entering fullscreen mode, which would break transparency
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.hide()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  const granted = await checkPermissions()
  if (!granted) return

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createOverlayWindow()

  if (!app.isPackaged) {
    mainWindow?.webContents.openDevTools({ mode: 'detach' })
    overlayWindow?.webContents.openDevTools({ mode: 'detach' })

    globalShortcut.register('CommandOrControl+Shift+D', () => {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
      }
    })
  }

  uIOhook.start()

  // IPC Handlers
  ipcMain.on('overlay:hide', () => {
    if (!overlayWindow) return
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.hide()
  })

  ipcMain.handle('cursor:move', async (_event, x, y, durationMs) => {
    console.log('[IPC] cursor:move', { x, y, durationMs })
    return moveRealMouse(x, y, durationMs)
  })

  ipcMain.handle('cursor:click', async (_event, x, y) => clickRealMouse(x, y))
  ipcMain.handle('cursor:replay', async (_event, steps) => {
    console.warn('[AUTO_REAL_MOUSE] LOUD WARNING: REAL OS automation steps triggered from IPC', { count: steps?.length })
    return executeRealMouseSteps(steps)
  })
  ipcMain.handle('cursor:getPosition', async () => getPhysicalMousePosition())
  ipcMain.handle('cursor:diagnostics', async () => getCoordinateCalibrationDiagnostics())
  ipcMain.handle('cursor:moveCenter', async () => {
    console.log('[COORD_CALIBRATION] explicit center move requested')
    return moveRealMouse(50, 50)
  })
  ipcMain.handle('cursor:waitForTarget', async (_event, x, y, tolerancePx = 50, timeoutMs = 12000) => {
    console.log('[IPC] cursor:waitForTarget', { x, y, tolerancePx, timeoutMs })
    return waitForMouseAtTarget(x, y, tolerancePx, timeoutMs)
  })

  ipcMain.handle('overlay:setClickThrough', async (_event, clickThrough) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    console.log(`[OVERLAY_INTERACTION] ${clickThrough ? 'enabled click-through' : 'enabled interactive zone'}`)
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  })

  ipcMain.handle('screen:capture', async (event) => {
    console.log('[IPC] screen:capture')
    try {
      return await captureScreenBase64()
    } catch (err: any) {
      if (isPermissionError(err) || err.code === 'SCREEN_PERMISSION_DENIED') {
        event.sender.send('permissions:screen-denied')
      }
      throw err
    }
  })

  ipcMain.handle('screen:analyze', async (event, base64PNG, options) => {
    console.log('[IPC] screen:analyze', { hasBase64: !!base64PNG, captureUnderlying: !!options?.captureUnderlying })
    const captureUnderlying = options?.captureUnderlying
    const wasOverlayVisible = captureUnderlying && Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
    try {
      if (wasOverlayVisible && overlayWindow) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
        overlayWindow.hide()
        await delay(160)
      }
      const screenshot = base64PNG || (await captureScreenBase64())
      return analyzeScreen(screenshot)
    } catch (err: any) {
      if (isPermissionError(err) || err.code === 'SCREEN_PERMISSION_DENIED') {
        event.sender.send('permissions:screen-denied')
      }
      console.error('[Specter] Screen analysis failed; using fallback screen state:', err)
      return fallbackScreenState()
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    }
  })

  ipcMain.handle('realApp:detectTargets', async (event, userIntent = '') => {
    const prompt = typeof userIntent === 'string' && userIntent.trim() ? userIntent.trim() : 'Teach one visible action'
    console.log('[REAL_APP_TEST] capture requested', { prompt })

    const wasOverlayVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())

    try {
      if (wasOverlayVisible && overlayWindow) {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
        overlayWindow.hide()
        await delay(160)
      }

      const screenshot = await captureScreenBase64()
      console.log('[SCREEN_TARGETS] captured real app screen', {
        prompt,
        bytesBase64: screenshot.length
      })

      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      }

      const result = await detectScreenTargets(screenshot, prompt)
      console.log('[SCREEN_TARGETS] targets returned', {
        prompt,
        app: result.app,
        count: result.targets.length,
        threshold: REAL_APP_CONFIDENCE_THRESHOLD,
        topConfidence: result.targets[0]?.confidence ?? null
      })
      return {
        ...result,
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD
      }
    } catch (err: any) {
      if (isPermissionError(err) || err.code === 'SCREEN_PERMISSION_DENIED') {
        event.sender.send('permissions:screen-denied')
      }
      console.error('[REAL_APP_TEST] target detection failed:', err)
      return {
        ...fallbackScreenTargets(prompt),
        confidenceThreshold: REAL_APP_CONFIDENCE_THRESHOLD
      }
    } finally {
      if (wasOverlayVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
        overlayWindow.setIgnoreMouseEvents(true, { forward: true })
      }
    }
  })

  ipcMain.handle('realApp:createWorkflow', async (_event, input) => {
    const target = input && typeof input === 'object' ? input.target : null
    const source: 'vision' | 'manual' = target?.source === 'manual' || input?.source === 'manual' ? 'manual' : 'vision'
    const step = createRealAppStep(target, source)
    const nodeId = realAppNodeId(input, step.targetLabel || step.title || 'Selected target')
    const targetConfidence = confidenceValue(target?.confidence, source === 'manual' ? 1 : 0)

    if (source === 'manual') {
      console.log('[MANUAL_TARGET] saving manual real-app target', {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y
      })
    } else {
      console.log('[TARGET_CONFIRM] saving confirmed real-app target', {
        nodeId,
        label: step.targetLabel,
        x: step.x,
        y: step.y,
        confidence: targetConfidence
      })
    }

    const graph = saveToNode(loadGraph(DEFAULT_APP_NAME), nodeId, [step])
    saveGraph(graph)
    console.log('[REAL_APP_WALKTHROUGH] workflow ready', {
      nodeId,
      totalSteps: 1,
      label: step.targetLabel,
      source,
      confidence: targetConfidence
    })

    return {
      nodeId,
      steps: [step],
      intent: safeLabel(input?.intent, step.targetLabel || 'Real App Test'),
      source,
      confidence: targetConfidence
    }
  })

  ipcMain.handle('planner:plan', async (_event, userIntent, screenState, sessionHistory, mode) => {
    console.log('[IPC] planner:plan', { userIntent, mode })
    return planSteps(userIntent, screenState, sessionHistory, mode)
  })

  ipcMain.handle('planner:converse', async (_event, userMessage, screenState, conversationHistory) =>
    converse(userMessage, screenState, conversationHistory)
  )

  ipcMain.handle('session:save', async (_event, graph) => {
    if (isLearningGraph(graph)) {
      saveGraph(graph)
      return graph
    }
    return loadGraph(DEFAULT_APP_NAME)
  })

  ipcMain.handle('session:load', async (_event, appName = DEFAULT_APP_NAME) => loadGraph(appName))

  ipcMain.handle('session:resume-prompt', async (_event, appName = DEFAULT_APP_NAME) =>
    getResumePrompt(loadGraph(appName))
  )

  ipcMain.handle('session:record-start', async () => startRecording())
  ipcMain.handle('session:record-step', async (_event, step) => recordStep(step))
  ipcMain.handle('session:record-stop', async () => stopRecording())

  ipcMain.handle('session:save-node', async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
    const graph = saveToNode(loadGraph(appName), nodeId, steps)
    saveGraph(graph)
    return graph
  })

  ipcMain.handle('demo:controlledWorkflow', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setContentSize(CONTROLLED_DEMO_WIDTH, CONTROLLED_DEMO_HEIGHT)
      mainWindow.center()
      mainWindow.show()
      mainWindow.focus()
    }
    const workflow = createControlledDemoWorkflow(mainWindow)
    const graph = saveToNode(loadGraph(DEFAULT_APP_NAME), workflow.nodeId, workflow.steps)
    saveGraph(graph)
    console.log('[DEMO] controlled workflow prepared', {
      nodeId: workflow.nodeId,
      totalSteps: workflow.steps.length,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        action: step.action,
        x: step.x,
        y: step.y
      }))
    })
    return workflow
  })

  ipcMain.handle('session:mark-complete', async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = markNodeComplete(loadGraph(appName), nodeId)
    saveGraph(graph)
    return graph
  })

  ipcMain.handle('session:create-branch', async (_event, fromNodeId, fromStep, appName = DEFAULT_APP_NAME) => {
    const result = createBranch(loadGraph(appName), fromNodeId, fromStep)
    saveGraph(result.graph)
    return result
  })

  ipcMain.handle('session:next-node', async (_event, appName = DEFAULT_APP_NAME) =>
    getNextRecommendedNode(loadGraph(appName))
  )

  ipcMain.handle('session:available-nodes', async (_event, appName = DEFAULT_APP_NAME) =>
    getAvailableNodes(loadGraph(appName))
  )

  ipcMain.handle('bandit:select', async (_event, appName = DEFAULT_APP_NAME) =>
    selectArm(loadGraph(appName).bandtState)
  )

  ipcMain.handle('bandit:reward', async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName)
    graph.bandtState = recordReward(graph.bandtState, arm, reward)
    saveGraph(graph)
    return { bandtState: graph.bandtState, style: getCurrentStyle(graph.bandtState) }
  })

  ipcMain.handle('bandit:style', async (_event, appName = DEFAULT_APP_NAME) =>
    getCurrentStyle(loadGraph(appName).bandtState)
  )

  ipcMain.handle('bandit:selectStyle', async (_event, appName = DEFAULT_APP_NAME) =>
    selectArm(loadGraph(appName).bandtState)
  )

  ipcMain.handle('bandit:recordReward', async (_event, arm, reward, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName)
    graph.bandtState = recordReward(graph.bandtState, arm, reward)
    saveGraph(graph)
    return { bandtState: graph.bandtState, style: getCurrentStyle(graph.bandtState) }
  })

  ipcMain.handle('session:markComplete', async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = markNodeComplete(loadGraph(appName), nodeId)
    saveGraph(graph)
    return graph
  })

  ipcMain.handle('session:saveNode', async (_event, nodeId, steps, appName = DEFAULT_APP_NAME) => {
    const graph = saveToNode(loadGraph(appName), nodeId, steps)
    saveGraph(graph)
    return graph
  })

  ipcMain.handle('session:walkthrough', async (_event, nodeId, appName = DEFAULT_APP_NAME) => {
    const graph = loadGraph(appName)
    const sessions = nodeId
      ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId))
      : graph.sessions.filter((s) => s.steps.length > 0)
    const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null
    const steps = latest?.steps || []
    await replayWalkthrough(steps, () => {})
  })

  ipcMain.handle('tts:speak', async (_event, text) => {
    console.log('[IPC] tts:speak', { text: text?.slice(0, 50) })
    return speak(text)
  })

  ipcMain.handle('tts:stop', async () => stopSpeaking())

  ipcMain.handle('whisper:transcribe', async (_event, audioData) => {
    console.log('[IPC] whisper:transcribe', { size: audioData?.byteLength })
    const buffer = Buffer.from(audioData)
    return transcribe(buffer)
  })

  registerReplayIpc(ipcMain, () => overlayWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      createOverlayWindow()
      if (!app.isPackaged) {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
        overlayWindow?.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })
})

app.on('will-quit', () => {
  uIOhook.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
