# Specter

Specter is an Electron desktop automation demo with an overlay tutor, screenshot analysis, guided walkthroughs, and guarded real mouse automation.

## Setup

```bash
npm install
```

Create a local `.env` from `.env.example` only when you need live AI providers:

```bash
cp .env.example .env
```

Do not commit `.env` or local test output.

## Run

```bash
npm run dev
```

Build the Electron app:

```bash
npm run build
```

## Verification

Run the local health checks:

```bash
npm run security-check
npm run test:specter
npm run test:vision
npm run lint
npm run build
```

`npm run test:vision` is offline and does not require API keys. It verifies the NVIDIA request shape, parser behavior, provider errors, and production mock-provider gating.

Run the live NVIDIA smoke test only after setting `NVIDIA_API_KEY` in `.env`:

```bash
npm run test:vision:live
```

The live test uses `test/fixtures/screenshot.png` and prints provider, model, latency, summary, element count, and warnings without printing the key or base64 image.

## macOS Permissions

Specter needs macOS permissions for real desktop capture and automation:

- Screen Recording for screenshot analysis.
- Accessibility for cursor movement and click detection.
- Input Monitoring for richer behavior tracking and keyboard/mouse event capture.

After changing permissions in System Settings, restart the app.

## NVIDIA Setup

Set these values in `.env` for the live vision provider:

```bash
VISION_PROVIDER=nvidia
NVIDIA_API_KEY=your_nvidia_api_key_here
```

Optional overrides:

```bash
NVIDIA_VISION_MODEL=meta/llama-4-maverick-17b-128e-instruct
NVIDIA_CHAT_COMPLETIONS_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_VISION_TIMEOUT_MS=20000
```

Provider behavior and fallback details live in `docs/VISION_PROVIDERS.md`.
