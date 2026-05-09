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

const TARGET_DETECTION_GUIDANCE = `Target selection policy for real-app teaching:
- For broad software-learning prompts, decompose the request into one visible micro-step.
- Prefer visible controls that directly match the user's intent.
- If the user asks about tabs in Google Chrome, Chrome tabs, browser tabs, or how to use tabs, the likely first micro-step is "Open a new tab".
- For Chrome tab prompts, prioritize "New tab button", "Tab strip", "Current tab", and "Address bar" candidates near the top browser UI.
- Do not choose page content when the prompt asks about browser UI.
- If multiple visible controls are plausible, return multiple candidates and make the recommendedAction describe the first micro-step.
- Label targets clearly, for example "New tab button", "Current tab", "Address bar", or "Tab strip".`;

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

function isChromeTabsPrompt(prompt: string): boolean {
  return (
    /\bchrome\b/i.test(prompt) &&
    /\b(tab|tabs|new tab|tab strip|tab bar)\b/i.test(prompt)
  );
}

function chromeTabTargetScore(target: ScreenTarget): number {
  const label = `${target.label} ${target.description || ""}`.toLowerCase();
  let score = 0;

  if (/\bnew tab\b|\bplus\b|\+\s*button/.test(label)) score += 60;
  if (/\btab strip\b|\btab bar\b/.test(label)) score += 50;
  if (/\bcurrent tab\b|\btab\b/.test(label)) score += 30;
  if (/\baddress bar\b|\bomnibox\b/.test(label)) score += 20;
  if (target.y <= 18) score += 25;
  if (/\bpage content\b|\bweb page\b|\bsearch result\b|\bai mode\b/.test(label))
    score -= 45;

  return score;
}

function rankTargetsForPrompt(
  targets: ScreenTarget[],
  prompt: string,
): ScreenTarget[] {
  if (!isChromeTabsPrompt(prompt)) return targets;

  return [...targets].sort((a, b) => {
    const scoreDiff = chromeTabTargetScore(b) - chromeTabTargetScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.confidence || 0) - (a.confidence || 0);
  });
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
    targets: rankTargetsForPrompt(
      result.elements.map((el, index) => ({
        id: `target-${index + 1}`,
        label: el.label,
        description: el.reasoning,
        x: pixelToPercentX(el.center?.x ?? el.bbox?.x ?? 0, width),
        y: pixelToPercentY(el.center?.y ?? el.bbox?.y ?? 0, height),
        confidence: el.confidence ?? 0.5,
        action: "click" as const,
        source: "vision" as const,
      })),
      prompt,
    ),
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
      appContext: TARGET_DETECTION_GUIDANCE,
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
