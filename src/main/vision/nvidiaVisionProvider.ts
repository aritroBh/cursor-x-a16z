import { VisionProvider, VisionAnalyzeInput, VisionAnalyzeResult } from './types';
import { VisionProviderError } from './errors';
import { buildVisionPrompt } from './prompts';
import { parseVisionJson } from './json';
import { safeLog, safeWarn, safeError } from '../logger';

export class NvidiaVisionProvider implements VisionProvider {
  public name = "nvidia" as const;
  private readonly model = "meta/llama-4-maverick-17b-128e-instruct";
  private readonly endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";

  async analyze(input: VisionAnalyzeInput): Promise<VisionAnalyzeResult> {
    const startTime = Date.now();
    const apiKey = process.env.NVIDIA_API_KEY;

    if (!apiKey || apiKey === 'your_nvidia_api_key_here') {
      throw new VisionProviderError(
        "PROVIDER_NOT_CONFIGURED",
        this.name,
        "NVIDIA API key is missing or not configured."
      );
    }

    const timeoutMs = parseInt(process.env.NVIDIA_VISION_TIMEOUT_MS || "20000", 10);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const prompt = buildVisionPrompt(input.task, input.userPrompt, input.appContext);

    try {
      safeLog(`[VISION][NVIDIA] Calling ${this.model}...`, { task: input.task });

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBase64}`
                  }
                }
              ]
            }
          ],
          max_tokens: 1200,
          temperature: 0.1,
          top_p: 1,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        throw new VisionProviderError(
          "PROVIDER_NOT_CONFIGURED",
          this.name,
          "NVIDIA API authentication failed. Please check your API key."
        );
      }

      if (response.status === 429) {
        throw new VisionProviderError(
          "PROVIDER_RATE_LIMITED",
          this.name,
          "NVIDIA API rate limit exceeded."
        );
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new VisionProviderError(
          "PROVIDER_HTTP_ERROR",
          this.name,
          `NVIDIA API returned status ${response.status}`,
          errorText.substring(0, 500)
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (typeof content !== 'string') {
        throw new VisionProviderError(
          "PROVIDER_INVALID_RESPONSE",
          this.name,
          "NVIDIA API returned an invalid response structure."
        );
      }

      const parsed = parseVisionJson(content, this.name);
      const latencyMs = Date.now() - startTime;

      safeLog(`[VISION][NVIDIA] Success`, { latencyMs, elementCount: parsed.elements.length });

      return {
        provider: this.name,
        model: this.model,
        generatedAt: new Date().toISOString(),
        latencyMs,
        summary: parsed.summary,
        elements: parsed.elements,
        recommendedAction: parsed.recommendedAction,
        warnings: parsed.warnings,
        rawText: process.env.NODE_ENV !== 'production' ? content : undefined
      };

    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new VisionProviderError(
          "PROVIDER_TIMEOUT",
          this.name,
          `NVIDIA API request timed out after ${timeoutMs}ms.`
        );
      }

      if (error instanceof VisionProviderError) {
        throw error;
      }

      throw new VisionProviderError(
        "UNKNOWN_VISION_ERROR",
        this.name,
        error.message || "An unexpected error occurred during NVIDIA vision analysis.",
        undefined,
        error
      );
    }
  }
}
