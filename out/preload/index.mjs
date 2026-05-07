import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
const api = {
  permissions: {
    onScreenDenied: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("permissions:screen-denied", listener);
      return () => ipcRenderer.off("permissions:screen-denied", listener);
    }
  },
  overlay: {
    onToggle: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("overlay:toggle", listener);
      return () => ipcRenderer.off("overlay:toggle", listener);
    },
    hide: () => ipcRenderer.send("overlay:hide"),
    setClickThrough: (clickThrough) => ipcRenderer.invoke("overlay:setClickThrough", clickThrough)
  },
  cursor: {
    move: (x, y, duration) => ipcRenderer.invoke("cursor:move", x, y, duration),
    click: (x, y) => ipcRenderer.invoke("cursor:click", x, y),
    replay: (steps) => ipcRenderer.invoke("cursor:replay", steps),
    getPosition: () => ipcRenderer.invoke("cursor:getPosition"),
    waitForTarget: (x, y, tolerance, timeout) => ipcRenderer.invoke("cursor:waitForTarget", x, y, tolerance, timeout)
  },
  screen: {
    capture: () => ipcRenderer.invoke("screen:capture"),
    analyze: (base64PNG) => ipcRenderer.invoke("screen:analyze", base64PNG)
  },
  planner: {
    plan: (userIntent, screenState, sessionHistory, mode) => ipcRenderer.invoke("planner:plan", userIntent, screenState, sessionHistory, mode),
    converse: (userMessage, screenState, conversationHistory) => ipcRenderer.invoke("planner:converse", userMessage, screenState, conversationHistory)
  },
  session: {
    save: (graph) => ipcRenderer.invoke("session:save", graph),
    load: (app) => ipcRenderer.invoke("session:load", app),
    resumePrompt: (app) => ipcRenderer.invoke("session:resume-prompt", app),
    recordStart: () => ipcRenderer.invoke("session:record-start"),
    recordStep: (step) => ipcRenderer.invoke("session:record-step", step),
    recordStop: () => ipcRenderer.invoke("session:record-stop"),
    saveNode: (nodeId, steps, app) => ipcRenderer.invoke("session:save-node", nodeId, steps, app),
    markComplete: (nodeId, app) => ipcRenderer.invoke("session:mark-complete", nodeId, app),
    createBranch: (fromNodeId, fromStep, app) => ipcRenderer.invoke("session:create-branch", fromNodeId, fromStep, app),
    nextNode: (app) => ipcRenderer.invoke("session:next-node", app),
    availableNodes: (app) => ipcRenderer.invoke("session:available-nodes", app)
  },
  bandit: {
    select: (app) => ipcRenderer.invoke("bandit:select", app),
    reward: (arm, reward, app) => ipcRenderer.invoke("bandit:reward", arm, reward, app),
    style: (app) => ipcRenderer.invoke("bandit:style", app)
  },
  replay: {
    walkthrough: (nodeId) => ipcRenderer.invoke("replay:walkthrough", nodeId),
    auto: (nodeId) => ipcRenderer.invoke("replay:auto", nodeId),
    stop: () => ipcRenderer.invoke("replay:stop"),
    userClick: (x, y) => ipcRenderer.send("replay:user-click", { x, y }),
    onStep: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("replay:step", listener);
      return () => ipcRenderer.off("replay:step", listener);
    },
    onRetry: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("replay:retry", listener);
      return () => ipcRenderer.off("replay:retry", listener);
    },
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("replay:progress", listener);
      return () => ipcRenderer.off("replay:progress", listener);
    },
    onComplete: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("replay:complete", listener);
      return () => ipcRenderer.off("replay:complete", listener);
    }
  },
  tts: {
    speak: (text) => ipcRenderer.invoke("tts:speak", text),
    stop: () => ipcRenderer.invoke("tts:stop")
  },
  whisper: {
    transcribe: (audioData) => ipcRenderer.invoke("whisper:transcribe", audioData)
  }
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
