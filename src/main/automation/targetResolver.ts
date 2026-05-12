export interface ResolvedTarget {
  source: "playwright" | "openara" | "ax" | "vision" | "manual";
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
  selector?: string;
  appName?: string;
  rationale: string;
  requiresConfirmation: boolean;
}

export function resolveTarget(
  step: any,
  context: {
    hasDOM?: boolean;
    domSelector?: string;
    axTarget?: any;
    vlmTarget?: any;
    currentApp?: string;
  },
): ResolvedTarget {
  // 1. Playwright / DOM Locator
  if (context.hasDOM && context.domSelector) {
    return {
      source: "playwright",
      confidence: 1.0,
      selector: context.domSelector,
      appName: context.currentApp,
      rationale:
        "Playwright DOM locator preferred for browser contexts due to auto-waiting actionability.",
      requiresConfirmation: false,
    };
  }

  // 2. OpenAra accessibility target
  if (context.axTarget && context.axTarget.isOpenAra) {
    return {
      source: "openara",
      confidence: 0.95,
      bbox: context.axTarget.bbox,
      appName: context.currentApp,
      rationale: "openara accessibility target available.",
      requiresConfirmation: false,
    };
  }

  // 3. AX bounds center
  if (context.axTarget && context.axTarget.bbox) {
    return {
      source: "ax",
      confidence: 0.9,
      bbox: context.axTarget.bbox,
      appName: context.currentApp,
      rationale: "Accessibility bounds center used.",
      requiresConfirmation: false,
    };
  }

  // 4. VLM / Vision fallback
  if (context.vlmTarget) {
    const conf = context.vlmTarget.confidence || 0.8;
    return {
      source: "vision",
      confidence: conf,
      bbox: context.vlmTarget.bbox,
      appName: context.currentApp,
      rationale: "Vision/VLM coordinate fallback used.",
      requiresConfirmation: conf < 0.65,
    };
  }

  // 5. Manual Confirmation
  return {
    source: "manual",
    confidence: 0.0,
    appName: context.currentApp,
    rationale: "No automated target found. Requires manual confirmation.",
    requiresConfirmation: true,
  };
}
