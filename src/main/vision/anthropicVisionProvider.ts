import { VisionProvider, VisionAnalyzeInput, VisionAnalyzeResult, VisionElement } from './types';
import { VisionProviderError } from './errors';
import { createAnthropicClient, getAnthropicVisionModel } from '../ai/config';
import { safeLog } from '../logger';

export class AnthropicVisionProvider implements VisionProvider {
  public name = "anthropic" as const;
  private readonly model = getAnthropicVisionModel();

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const startTime = Date.now();
    const anthropic = createAnthropicClient();

    if (!anthropic) {
      throw new VisionProviderError(
        "PROVIDER_NOT_CONFIGURED",
        this.name,
        "Anthropic API key is missing."
      );
    }

    try {
      safeLog(`[VISION][ANTHROPIC] Calling ${this.model}...`, { task: input.task });

      const message = await anthropic.messages.create({
        model: this.model,
        max_tokens: 1200,
        system: "You are a UI state analyzer. Return ONLY valid JSON matching the requested schema.",
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: input.mimeType,
                  data: input.imageBase64
                }
              },
              {
                type: 'text',
                text: `Analyze this screenshot for the task: ${input.task}. User prompt: ${input.userPrompt || "none"}. Return JSON with summary, elements (label, type, text, confidence, bbox {x, y, width, height}, center {x, y}), recommendedAction, and warnings.`
              }
            ]
          }
        ]
      });

      const content = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n');
      
      // Simple parsing for now, ideally use same json.ts as Nvidia
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      
      const latencyMs = Date.now() - startTime;

      return {
        provider: this.name,
        model: this.model,
        generatedAt: new Date().toISOString(),
        latencyMs,
        summary: parsed.summary || "Analysis complete",
        elements: (parsed.elements || []).map((el: any) => ({
          label: el.label || "Element",
          type: el.type || "unknown",
          text: el.text,
          confidence: el.confidence,
          bbox: el.bbox,
          center: el.center
        })),
        recommendedAction: parsed.recommendedAction,
        warnings: parsed.warnings || [],
        rawText: content
      };
    } catch (error: any) {
      throw new VisionProviderError(
        "PROVIDER_HTTP_ERROR",
        this.name,
        error.message || "Anthropic API error",
        undefined,
        error
      );
    }
  }
}
