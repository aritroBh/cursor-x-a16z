import 'dotenv/config'
import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { uIOhook, UiohookKey } from 'uiohook-napi'

import { checkPermissions, isPermissionError } from './permissions'
import { captureScreenBase64 } from './capture'
import { ghostMove, ghostClick, executeSteps, getPhysicalMousePosition, waitForMouseAtTarget } from './cursor'
import { analyzeScreen } from './ai/screener'
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

const icon = join(__dirname, '../../resources/icon.png')
const DEFAULT_APP_NAME = 'Specter'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

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
  if (overlayWindow.isVisible()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.hide()
  } else {
    overlayWindow.setIgnoreMouseEvents(false)
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
    width: 400,
    height: 600,
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
  overlayWindow = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setVisibleOnAllWorkspaces(true)

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
    return ghostMove(x, y, durationMs)
  })

  ipcMain.handle('cursor:click', async (_event, x, y) => ghostClick(x, y))
  ipcMain.handle('cursor:replay', async (_event, steps) => executeSteps(steps))
  ipcMain.handle('cursor:getPosition', async () => getPhysicalMousePosition())
  ipcMain.handle('cursor:waitForTarget', async (_event, x, y, tolerancePx = 50, timeoutMs = 45000) => {
    console.log('[IPC] cursor:waitForTarget', { x, y, tolerancePx, timeoutMs })
    return waitForMouseAtTarget(x, y, tolerancePx, timeoutMs)
  })

  ipcMain.handle('overlay:setClickThrough', async (_event, clickThrough) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
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

  ipcMain.handle('screen:analyze', async (event, base64PNG) => {
    console.log('[IPC] screen:analyze', { hasBase64: !!base64PNG })
    try {
      const screenshot = base64PNG || (await captureScreenBase64())
      return analyzeScreen(screenshot)
    } catch (err: any) {
      if (isPermissionError(err) || err.code === 'SCREEN_PERMISSION_DENIED') {
        event.sender.send('permissions:screen-denied')
      }
      throw err
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
