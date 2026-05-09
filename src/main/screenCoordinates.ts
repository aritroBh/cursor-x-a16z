import { screen } from "electron";
import type { Display, Rectangle } from "electron";
import { Point } from "@nut-tree-fork/nut-js";
import { safeLog } from "./logger";

export const COORDINATE_MODE = "electron logical display bounds";

let activeCoordinateDisplayId: number | null = null;

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function rectSnapshot(rect: Rectangle): Rectangle {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function getDisplayById(displayId: number | null): Display | null {
  if (displayId === null) return null;
  return (
    screen.getAllDisplays().find((display) => display.id === displayId) || null
  );
}

function displayContainsScreenPoint(
  display: Display,
  x: number,
  y: number,
): boolean {
  const bounds = display.bounds;
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function displayForScreenPoint(x: number, y: number): Display {
  return (
    screen
      .getAllDisplays()
      .find((display) => displayContainsScreenPoint(display, x, y)) ||
    getActiveCoordinateDisplay()
  );
}

export function setActiveCoordinateDisplay(displayId: number): void {
  activeCoordinateDisplayId = displayId;
  safeLog("[WINDOW_ROUTING] active coordinate display set", { displayId });
}

export function getActiveCoordinateDisplay(): Display {
  const pinned = getDisplayById(activeCoordinateDisplayId);
  if (pinned) return pinned;

  return (
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) ||
    screen.getPrimaryDisplay()
  );
}

export function getActiveCoordinateDisplayId(): number {
  return getActiveCoordinateDisplay().id;
}

export async function mapPercentToScreen(x: number, y: number) {
  const display = getActiveCoordinateDisplay();
  const percentPoint = {
    x: clampPercent(x),
    y: clampPercent(y),
  };
  const screenPoint = {
    x: Math.round(
      display.bounds.x + (percentPoint.x / 100) * display.bounds.width,
    ),
    y: Math.round(
      display.bounds.y + (percentPoint.y / 100) * display.bounds.height,
    ),
  };

  return {
    percent: percentPoint,
    screenPoint,
    activeDisplay: {
      id: display.id,
      bounds: rectSnapshot(display.bounds),
      scaleFactor: display.scaleFactor,
    },
    coordinateMode: COORDINATE_MODE,
  };
}

export function getPrimaryDisplayMetrics() {
  const primary = screen.getPrimaryDisplay();
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
      workArea: rectSnapshot(active.workArea),
    },
    size: {
      width: primary.size.width,
      height: primary.size.height,
    },
  };

  safeLog("[COORD_CALIBRATION] Primary display metrics retrieved", {
    coordinateMode: COORDINATE_MODE,
    ...metrics,
  });
  return metrics;
}

export async function toScreenPoint(x: number, y: number): Promise<Point> {
  const display = getActiveCoordinateDisplay();
  const logicalX =
    display.bounds.x + (clampPercent(x) / 100) * display.bounds.width;
  const logicalY =
    display.bounds.y + (clampPercent(y) / 100) * display.bounds.height;

  const screenX = Math.round(logicalX);
  const screenY = Math.round(logicalY);
  const expectedCenter = {
    x: Math.round(display.bounds.x + display.bounds.width / 2),
    y: Math.round(display.bounds.y + display.bounds.height / 2),
  };

  safeLog("[COORD_CALIBRATION] Mapping percent to screen point", {
    coordinateMode: COORDINATE_MODE,
    input: { x, y },
    display: {
      id: display.id,
      bounds: rectSnapshot(display.bounds),
      scaleFactor: display.scaleFactor,
    },
    expectedCenter,
    output: { x: screenX, y: screenY },
  });

  return new Point(screenX, screenY);
}

export function screenPointToPercent(
  x: number,
  y: number,
): { x: number; y: number } {
  const display = displayForScreenPoint(x, y);
  const bounds = display.bounds;

  return {
    x: clampPercent(((x - bounds.x) / bounds.width) * 100),
    y: clampPercent(((y - bounds.y) / bounds.height) * 100),
  };
}

export function logicalPointToPercent(
  x: number,
  y: number,
): { x: number; y: number } {
  const display =
    getDisplayById(activeCoordinateDisplayId) ||
    screen.getDisplayNearestPoint({ x, y });

  return {
    x: clampPercent(((x - display.bounds.x) / display.bounds.width) * 100),
    y: clampPercent(((y - display.bounds.y) / display.bounds.height) * 100),
  };
}
