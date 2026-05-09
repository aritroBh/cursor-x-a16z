import { VisionElement } from './types';
import { VisionProviderError } from './errors';

export interface ParsedVisionOutput {
  summary: string;
  elements: VisionElement[];
  recommendedAction?: string;
  warnings: string[];
}

export function extractJsonObject(text: string): unknown {
  try {
    // 1. First try direct JSON.parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Try to extract the first top-level JSON object
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      throw new Error("No JSON object found in text");
    }
    
    const jsonStr = text.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonStr);
    } catch (e2) {
      throw new Error("Failed to parse extracted JSON object");
    }
  }
}

export function validateVisionOutput(value: unknown): ParsedVisionOutput {
  if (!value || typeof value !== 'object') {
    throw new Error("Value is not an object");
  }

  const obj = value as any;

  const result: ParsedVisionOutput = {
    summary: typeof obj.summary === 'string' ? obj.summary : "No summary provided",
    elements: [],
    recommendedAction: typeof obj.recommendedAction === 'string' ? obj.recommendedAction : undefined,
    warnings: Array.isArray(obj.warnings) ? obj.warnings.filter((w: any) => typeof w === 'string') : []
  };

  if (Array.isArray(obj.elements)) {
    result.elements = obj.elements
      .map((el: any) => {
        if (!el || typeof el !== 'object' || typeof el.label !== 'string') {
          return null;
        }

        const validatedElement: VisionElement = {
          label: el.label,
          type: el.type, // Should ideally validate against allowed types
          text: typeof el.text === 'string' ? el.text : undefined,
          reasoning: typeof el.reasoning === 'string' ? el.reasoning : undefined,
        };

        if (typeof el.confidence === 'number') {
          validatedElement.confidence = Math.min(1, Math.max(0, el.confidence));
        }

        if (el.bbox && typeof el.bbox === 'object') {
          const { x, y, width, height } = el.bbox;
          if (
            typeof x === 'number' && Number.isFinite(x) && x >= 0 &&
            typeof y === 'number' && Number.isFinite(y) && y >= 0 &&
            typeof width === 'number' && Number.isFinite(width) && width >= 0 &&
            typeof height === 'number' && Number.isFinite(height) && height >= 0
          ) {
            validatedElement.bbox = { x, y, width, height };
          }
        }

        if (el.center && typeof el.center === 'object') {
          const { x, y } = el.center;
          if (
            typeof x === 'number' && Number.isFinite(x) && x >= 0 &&
            typeof y === 'number' && Number.isFinite(y) && y >= 0
          ) {
            validatedElement.center = { x, y };
          }
        }

        return validatedElement;
      })
      .filter((el): el is VisionElement => el !== null);
  }

  return result;
}

export function parseVisionJson(text: string, provider: any): ParsedVisionOutput {
  try {
    const raw = extractJsonObject(text);
    return validateVisionOutput(raw);
  } catch (error: any) {
    throw new VisionProviderError(
      "PROVIDER_PARSE_ERROR",
      provider,
      `Failed to parse vision JSON: ${error.message}`,
      undefined,
      error
    );
  }
}
