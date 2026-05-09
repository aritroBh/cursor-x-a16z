import { safeWarn, safeError } from "../logger";
import { analyzeVision, VisionAnalyzeResult, VisionErrorCode } from "../vision";

export interface ScreenCoordinate {
  label: string;
  x: number;
  y: number;
  confidence?: number;
}

export interface ScreenState {
  app: string;
  coordinates: ScreenCoordinate[];
  error?: string;
  fallbackAvailable?: boolean;
}

export interface ScreenTarget {
  id?: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  confidence: number;
  action: "click" | "type" | "scroll" | "wait";
  source: "vision" | "manual";
}

export interface ScreenTargetsResult {
  app: string;
  prompt: string;
  microTask: string;
  targets: ScreenTarget[];
  needsConfirmation: boolean;
  reason?: string;
  capturedAt: string;
  error?: string;
  fallbackAvailable?: boolean;
}

export function fallbackScreenState(error?: string): ScreenState {
  return {
    app: "Unknown",
    coordinates: [],
    error,
    fallbackAvailable: true,
  };
}

function percent(value: any, fallback = 50): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : fallback;
}

export function fallbackScreenTargets(
  prompt = "",
  error?: string,
): ScreenTargetsResult {
  return {
    app: "Unknown",
    prompt,
    microTask: "First, I will teach one visible action.",
    targets: [],
    needsConfirmation: true,
    reason: "No visible targets were detected.",
    capturedAt: new Date().toISOString(),
    error,
    fallbackAvailable: true,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function pixelToPercentX(x: number, width?: number): number {
  if (!width || width <= 0) return percent(x);
  return clamp((x / width) * 100, 0, 100);
}

function pixelToPercentY(y: number, height?: number): number {
  if (!height || height <= 0) return percent(y);
  return clamp((y / height) * 100, 0, 100);
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenTargetsResult
 */
function adaptToScreenTargets(
  result: VisionAnalyzeResult,
  prompt: string,
  width?: number,
  height?: number,
): ScreenTargetsResult {
  return {
    app: result.summary.split(" ")[0] || "Unknown",
    prompt,
    microTask:
      result.recommendedAction || "First, I will teach one visible action.",
    targets: result.elements.map((el, index) => ({
      id: `target-${index + 1}`,
      label: el.label,
      description: el.reasoning,
      x: pixelToPercentX(el.center?.x ?? el.bbox?.x ?? 0, width),
      y: pixelToPercentY(el.center?.y ?? el.bbox?.y ?? 0, height),
      confidence: el.confidence ?? 0.5,
      action: "click",
      source: "vision",
    })),
    needsConfirmation: true,
    reason: result.warnings.join(". "),
    capturedAt: result.generatedAt,
  };
}

/**
 * Adapter to convert new VisionAnalyzeResult to legacy ScreenState
 */
function adaptToScreenState(
  result: VisionAnalyzeResult,
  width?: number,
  height?: number,
): ScreenState {
  return {
    app: result.summary.split(" ")[0] || "Unknown",
    coordinates: result.elements.map((el) => ({
      label: el.label,
      x: pixelToPercentX(el.center?.x ?? el.bbox?.x ?? 0, width),
      y: pixelToPercentY(el.center?.y ?? el.bbox?.y ?? 0, height),
      confidence: el.confidence,
    })),
  };
}

export async function detectScreenTargets(
  base64PNG?: string,
  prompt = "",
  width?: number,
  height?: number,
): Promise<ScreenTargetsResult> {
  const normalizedPrompt =
    typeof prompt === "string" && prompt.trim()
      ? prompt.trim()
      : "Teach one visible action";

  if (!base64PNG) {
    safeWarn(
      "[SCREEN_TARGETS] no screenshot provided; returning empty target set",
    );
    return fallbackScreenTargets(normalizedPrompt);
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: "image/png",
      task: "target_detection",
      userPrompt: normalizedPrompt,
      screenshotWidth: width,
      screenshotHeight: height,
    });

    return adaptToScreenTargets(result, normalizedPrompt, width, height);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(
      `[AI_BACKEND] Vision provider failed (${code}): ${error.message}`,
    );
    return fallbackScreenTargets(
      normalizedPrompt,
      code || "UNKNOWN_VISION_ERROR",
    );
  }
}

export async function analyzeScreen(
  base64PNG?: string,
  width?: number,
  height?: number,
): Promise<ScreenState> {
  if (!base64PNG) {
    safeWarn("[Specter] No screenshot provided; skipping screen analysis.");
    return fallbackScreenState();
  }

  try {
    const result = await analyzeVision({
      imageBase64: base64PNG,
      mimeType: "image/png",
      task: "screen_understanding",
      screenshotWidth: width,
      screenshotHeight: height,
    });

    return adaptToScreenState(result, width, height);
  } catch (error: any) {
    const code = error.code as VisionErrorCode;
    safeError(
      `[AI_BACKEND] Vision provider failed (${code}): ${error.message}`,
    );
    return fallbackScreenState(code || "UNKNOWN_VISION_ERROR");
  }
}
