import { BrowserWindow, IpcMain } from 'electron'
import { Step } from './types'
import { ghostMove, ghostClick, executeSteps, waitForMouseAtTarget } from '../cursor'
import { loadGraph } from './storage'

let getOverlayWindow: () => BrowserWindow | null = () => null
let activeReplay: ReplayController | null = null

interface ReplayController {
  cancelled: boolean
  cancelHandlers: Set<() => void>
}

function createReplayController(): ReplayController {
  stopReplay()
  const controller: ReplayController = {
    cancelled: false,
    cancelHandlers: new Set()
  }
  activeReplay = controller
  return controller
}

function cancelReplay(controller: ReplayController): void {
  if (controller.cancelled) return
  controller.cancelled = true
  for (const handler of controller.cancelHandlers) {
    handler()
  }
  controller.cancelHandlers.clear()
}

function isActive(controller: ReplayController): boolean {
  return activeReplay === controller && !controller.cancelled
}

function sleep(ms: number, controller: ReplayController): Promise<boolean> {
  if (controller.cancelled) return Promise.resolve(false)
  if (ms <= 0) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => settle(true), ms)
    const settle = (completed: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      controller.cancelHandlers.delete(cancel)
      resolve(completed && !controller.cancelled)
    }
    const cancel = () => settle(false)
    controller.cancelHandlers.add(cancel)
  })
}

function sendOverlay(channel: string, payload: any): void {
  const overlayWindow = getOverlayWindow()
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.webContents.send(channel, payload)
}

function setOverlayForReplay(): void {
  const overlayWindow = getOverlayWindow()
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (!overlayWindow.isVisible()) overlayWindow.show()
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
}

function waitForUserAtTarget(step: Step, controller: ReplayController, timeoutMs = 45000): Promise<'correct' | 'timeout' | 'cancelled'> {
  if (controller.cancelled) return Promise.resolve('cancelled')

  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => settle(controller.cancelled ? 'cancelled' : 'timeout'), timeoutMs)
    const settle = (result: 'correct' | 'timeout' | 'cancelled') => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      controller.cancelHandlers.delete(cancel)
      resolve(result)
    }
    const cancel = () => settle('cancelled')
    controller.cancelHandlers.add(cancel)

    waitForMouseAtTarget(step.x, step.y, 50, timeoutMs).then((result) => {
      settle(result === 'correct' ? 'correct' : 'timeout')
    })
  })
}

function stepsForNode(nodeId: string | undefined, appName: string): Step[] {
  const graph = loadGraph(appName)
  const sessions = nodeId
    ? graph.sessions.filter((s) => s.nodesVisited.includes(nodeId))
    : graph.sessions.filter((s) => s.steps.length > 0)

  const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null
  return latest?.steps || []
}

export function stopReplay(): void {
  if (activeReplay) {
    cancelReplay(activeReplay)
  }
  activeReplay = null
  sendOverlay('replay:stopped', {})
}

export async function replayWalkthrough(steps: Step[], onStep: (step: Step, index: number) => void): Promise<void> {
  const controller = createReplayController()
  setOverlayForReplay()

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break
      const step = steps[index]
      let result: 'correct' | 'timeout' | 'cancelled' = 'timeout'
      let attempts = 0

      while (result !== 'correct' && isActive(controller)) {
        const channel = attempts === 0 ? 'replay:step' : 'replay:retry'
        sendOverlay(channel, { step, index, total: steps.length, reason: result })

        if (attempts === 0) onStep(step, index)

        if (step.action !== 'wait') {
          await ghostMove(step.x, step.y, 600)
        }

        result = await waitForUserAtTarget(step, controller)
        if (result === 'timeout') attempts++
      }
    }

    if (!controller.cancelled) {
      sendOverlay('replay:complete', {})
    }
  } finally {
    if (activeReplay === controller) activeReplay = null
  }
}

export async function replayAutoExecute(steps: Step[]): Promise<void> {
  const controller = createReplayController()
  setOverlayForReplay()

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break
      const step = steps[index]

      if (step.action === 'click') {
        if (!(await sleep(step.delayMs || 0, controller))) break
        await ghostClick(step.x, step.y)
      } else if (step.action === 'wait') {
        if (!(await sleep(step.delayMs || 500, controller))) break
      } else {
        if (!(await sleep(step.delayMs || 0, controller))) break
        await executeSteps([{ ...step, delayMs: 0 }])
      }
      sendOverlay('replay:progress', { index, total: steps.length })
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay('replay:complete', {})
    }
    if (activeReplay === controller) activeReplay = null
  }
}

export function registerReplayIpc(ipcMain: IpcMain, windowProvider: () => BrowserWindow | null, appName = 'Specter'): void {
  getOverlayWindow = windowProvider

  ipcMain.handle('replay:walkthrough', async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName)
    await replayWalkthrough(steps, () => {})
  })

  ipcMain.handle('replay:auto', async (_event, nodeId) => {
    const steps = stepsForNode(nodeId, appName)
    await replayAutoExecute(steps)
  })

  ipcMain.handle('replay:stop', async () => {
    stopReplay()
  })
}
