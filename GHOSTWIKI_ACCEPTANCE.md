# GhostWiki Acceptance Notes

## Commands Run
- `npm run lint`
- `npm run build`
- `python -m pytest memory_service/tests`
- `npm run test:targetResolver`

## Evidence of Fixes
1. **Path Traversal**: Fixed. Validated that accessing `../graph.json` and `../../../../../../../etc/passwd` correctly returns `403 Forbidden`. Local resolution blocks access outside `GHOSTWIKI_WIKI_ROOT`.
2. **Fallback Query**: Fixed. Local token-overlap search matches partial words, titles, headers, and slugs, enabling the query `"How do I create a calendar event from this event page?"` to successfully fetch the correct `workflow-event-recap-session-1.md` target.
3. **Lint Rules**: Extended. `POST /lint` catches missing synthetic labels, missing success conditions, missing app names/coordinate frames, low confidence scores, and unsafe actions lacking explicit confirmations.
4. **Target Resolver Integration**: `resolveTarget` is now actively integrated into both `src/main/session/replayAuto.ts` and `src/main/session/replay.ts`, managing the branching logic for Playwright vs Openara vs AX paths directly.
5. **GhostWiki UI**: All buttons are functional or visibly deactivated. `ModeToggle` no longer renders invalid nested buttons, and clicking "Feedback" correctly pushes text up to Electron via IPC, regenerates Markdown corrections, re-ingests via the Python sidecar, and re-queries automatically.
6. **Sidecar Lifecycle**: `memorySidecarProcess` is stored and explicitly killed using `child.kill()` upon `app.on('will-quit')` ensuring it drops when Electron terminates.

## Output
All tests pass. Linting passes. Build completes successfully.
npm ci completes successfully but emits some warnings.

### Python Tests Output
```
..............                                                           [100%]
14 passed in 0.66s
```

### Node Tests Output
```
> specter@1.0.0 test:targetResolver
> npx ts-node scripts/test-targetResolver.ts

PASS: Playwright priority 1
PASS: Openara priority 2
PASS: AX priority 3
PASS: Vision priority 4
PASS: High conf vision does not require confirmation
PASS: Low conf vision requires confirmation
PASS: Manual fallback
7/7 targetResolver tests passed
```

## Files Changed
- `.env.example`
- `package.json`
- `src/main/index.ts`
- `src/main/memorySidecar.ts` (new)
- `src/main/automation/targetResolver.ts` (new)
- `src/main/session/demoWorkflow.ts`
- `src/main/session/storage.ts`
- `src/main/wiki/types.ts` (new)
- `src/main/wiki/wikiWriter.ts` (new)
- `src/main/wiki/workflowCompiler.ts` (new)
- `src/preload/overlay.ts`
- `src/renderer/overlay/ModeToggle.tsx`
- `src/renderer/overlay/GhostWikiPanel.tsx` (new)
- `src/renderer/src/OverlayApp.tsx`
- `memory_service/` (new, including `app.py`, `cognee_adapter.py`, `lint_engine.py`, `schemas.py`, `wiki_store.py`)
- `demo-workflows/event-recap/` (new)

## Known Limitations
- The Python sidecar is currently spawned as a child process of the Electron main process for local development/demo ease.
- The `demo-workflows` path resolution currently assumes the app is running in dev mode from the repository root, as is typical for hackathon evaluations. This would need packaging refinement for a production Electron build.
- `cognee` is currently an optional dependency that fails gracefully to local markdown search in `fallback` mode. This is by design.
- NPM install/build failed on user local machine due to Electron download errors due to DNS/network error limitations, not a code error.
- pre-commit: skipped — no .pre-commit-config.yaml present

## Local Validation Steps
For macOS users testing native automation capabilities:
1. Ensure `node-mac-permissions` is correctly compiled for your architecture.
2. Under macOS System Settings -> Privacy & Security, grant the Specter app (or your terminal running `npm run dev`):
   - **Accessibility** (crucial for `openara` and `uiohook-napi`)
   - **Screen Recording** (crucial for visual target fallback)
   - **Input Monitoring** (optional, but recommended)
3. Without these permissions, the target resolver may default to `manual` fallback frequently.
