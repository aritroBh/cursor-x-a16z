import { BrowserWindow, screen } from "electron";
import { normalizePracticeWindowTargetToViewportPercent } from "../screenCoordinates";
import type { Step } from "./types";

export const CONTROLLED_DEMO_NODE_ID = "Specter Controlled Demo";
export const CONTROLLED_DEMO_INTENT = "Controlled Specter demo";
export const CONTROLLED_DEMO_WIDTH = 900;
export const CONTROLLED_DEMO_HEIGHT = 650;

const DEMO_TARGETS = {
  buttonOne: { x: 0.28, y: 0.32 },
  buttonTwo: { x: 0.72, y: 0.32 },
  textInput: { x: 0.5, y: 0.54 },
  finalConfirm: { x: 0.5, y: 0.74 },
};

function contentTargetPercent(
  window: BrowserWindow | null,
  target: { x: number; y: number },
): {
  x: number;
  y: number;
  viewportX: number;
  viewportY: number;
  coordinateFrame: "viewport";
  sourceFrame: "practice-window";
  rawTarget: {
    x: number;
    y: number;
    coordinateFrame: "practice-window";
  };
  captureMeta: Step["captureMeta"];
} {
  const contentBounds =
    window && !window.isDestroyed() ? window.getContentBounds() : null;
  const fallbackBounds = screen.getPrimaryDisplay().bounds;
  const bounds = contentBounds || fallbackBounds;
  return normalizePracticeWindowTargetToViewportPercent(target, bounds);
}

export function createControlledDemoWorkflow(window: BrowserWindow | null): {
  nodeId: string;
  intent: string;
  steps: Step[];
} {
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
        viewportX: buttonOne.viewportX,
        viewportY: buttonOne.viewportY,
        coordinateFrame: buttonOne.coordinateFrame,
        sourceFrame: buttonOne.sourceFrame,
        rawTarget: buttonOne.rawTarget,
        captureMeta: buttonOne.captureMeta,
        action: "click",
      },
      {
        id: "demo-button-2",
        instruction: "Choose template.",
        targetLabel: "Choose Template",
        x: buttonTwo.x,
        y: buttonTwo.y,
        viewportX: buttonTwo.viewportX,
        viewportY: buttonTwo.viewportY,
        coordinateFrame: buttonTwo.coordinateFrame,
        sourceFrame: buttonTwo.sourceFrame,
        rawTarget: buttonTwo.rawTarget,
        captureMeta: buttonTwo.captureMeta,
        action: "click",
      },
      {
        id: "demo-type-text",
        instruction: "Name the project.",
        targetLabel: "Project name",
        x: textInput.x,
        y: textInput.y,
        viewportX: textInput.viewportX,
        viewportY: textInput.viewportY,
        coordinateFrame: textInput.coordinateFrame,
        sourceFrame: textInput.sourceFrame,
        rawTarget: textInput.rawTarget,
        captureMeta: textInput.captureMeta,
        action: "type",
        typeText: "Specter Launch",
      },
      {
        id: "demo-final-confirm",
        instruction: "Create project.",
        targetLabel: "Create",
        x: finalConfirm.x,
        y: finalConfirm.y,
        viewportX: finalConfirm.viewportX,
        viewportY: finalConfirm.viewportY,
        coordinateFrame: finalConfirm.coordinateFrame,
        sourceFrame: finalConfirm.sourceFrame,
        rawTarget: finalConfirm.rawTarget,
        captureMeta: finalConfirm.captureMeta,
        action: "click",
      },
    ],
  };
}
