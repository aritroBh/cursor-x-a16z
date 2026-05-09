# Vision Providers in Specter

Specter uses a flexible vision layer to understand desktop applications and identify UI elements. This document explains how to configure and use the available vision providers.

## Available Providers

- **NVIDIA (Default)**: Uses NVIDIA NIM (specifically `meta/llama-4-maverick-17b-128e-instruct`). This is the primary provider for production-grade UI understanding.
- **Anthropic**: Uses Claude Vision as a fallback or alternative.
- **Mock**: Used for development and testing without making real API calls.

## Configuration

All configuration is handled via environment variables in your local `.env` file.

### NVIDIA NIM (Llama 4 Maverick)

To use NVIDIA as your provider:

1. Obtain an API key from [NVIDIA Build](https://build.nvidia.com/).
2. Add it to your `.env`:
   ```env
   NVIDIA_API_KEY=<your_key_here>
   VISION_PROVIDER=nvidia
   ```
3. (Optional) Adjust the timeout:
   ```env
   NVIDIA_VISION_TIMEOUT_MS=20000
   ```

### Anthropic Claude

To use Anthropic:

1. Add your key to `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   VISION_PROVIDER=anthropic
   ```

### Fallback Configuration

You can enable automatic fallback from NVIDIA to Anthropic if the NVIDIA API fails:

```env
VISION_FALLBACK_ENABLED=true
```

## Security

- **API Keys**: Never commit your `.env` file or hardcode API keys. The `scripts/security-check.ts` runs during build/test to prevent accidental leaks.
- **Renderer Safety**: API keys are only accessible in the Electron main process. They are never exposed to the renderer window, preload scripts, or IPC responses.
- **Data Privacy**: When using NVIDIA or Anthropic providers, screenshots are sent to their respective APIs for analysis.

## Development and Testing

### Mock Provider

To work offline or avoid API costs during UI development:

```env
VISION_PROVIDER=mock
```
*Note: The mock provider is blocked in production unless `DEMO_MODE=true` is set.*

### Manual Test Script

You can test the NVIDIA provider connectivity directly:

```bash
npm run test:vision
```

Place a screenshot at `test/fixtures/screenshot.png` to run a real analysis.

## Troubleshooting

- **PROVIDER_NOT_CONFIGURED**: Check if `NVIDIA_API_KEY` is set in `.env`.
- **PROVIDER_PARSE_ERROR**: The model returned invalid JSON. Check logs for the raw response if in development.
- **Coordinate Precision**: Llama 4 Maverick is excellent at understanding structure, but coordinate precision may vary. Always validate coordinates before performing destructive automation.
