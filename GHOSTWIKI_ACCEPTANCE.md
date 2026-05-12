# GhostWiki Acceptance Notes

## Commands Run
- `npm run lint`
- `npm run build`
- `python -m pytest memory_service/tests`
- `npm run test:targetResolver`
- `npm run test:peekabooAdapter`
- `bash scripts/demo-ghostwiki-e2e.sh`

## Evidence of Fixes
1. **Path Traversal**: Fixed. Validated that accessing `../graph.json`, `../../../../../../../etc/passwd` correctly returns `403 Forbidden`. Local resolution blocks access outside `GHOSTWIKI_WIKI_ROOT`. No `startswith()` path validation is used in `get_wiki_page` (only `Path.resolve()` + `Path.relative_to(root)`). Sibling-prefix bypass (e.g. `../wiki_evil`) correctly returns `403`.
2. **Fallback Query**: Fixed. Local token-overlap search matches partial words, titles, headers, and slugs, enabling the query `"How do I create a calendar event from this event page?"` to successfully fetch the correct `workflow-event-recap-session-1.md` target. Answer is dynamically extracted via regex picking up `## Steps`. The e2e test script validates that "Create Event", "title", "date", "time", "location", "host", and sources are returned correctly.
3. **Peekaboo Adapter**: Safely calls `peekaboo` binary using `spawn` with array arguments to prevent shell injection, never using `exec` or `shell: true`. Handles edge cases including: disabled on non-macOS, `USE_PEEKABOO=false`, missing binary, valid JSON parsing, 10s timeout, nonzero exit. Provides IPC method returning `{ enabled, available, platform, warning }`.
4. **Target Resolver Integration**: `resolveTarget` is now actively integrated into both `src/main/session/replayAuto.ts` and `src/main/session/replay.ts`, managing the branching logic for Playwright vs Peekaboo vs Openara vs AX paths directly. If `requiresConfirmation` is `true`, unsafe execution halts or prompts manual confirmation.
5. **GhostWiki UI**: All buttons are functional or visibly deactivated. `ModeToggle` no longer renders invalid nested buttons, and clicking "Feedback" correctly pushes text up to Electron via IPC, regenerates Markdown corrections, re-ingests via the Python sidecar, and re-queries automatically. Replay button correctly disables with "Missing Peekaboo" if unavailable.
6. **Sidecar Lifecycle**: `memorySidecarProcess` is stored and explicitly killed using `child.kill()` upon `app.on('will-quit')` ensuring it drops when Electron terminates.

## Output
All tests pass. Linting passes. Build completes successfully.

### Python Tests Output
```
...............                                                          [100%]
15 passed in 0.77s
```

### Node targetResolver Tests Output
```
> specter@1.0.0 test:targetResolver
> npx ts-node scripts/test-targetResolver.ts

PASS: Playwright priority 1
PASS: Peekaboo priority 2
PASS: Openara priority 3
PASS: AX priority 4
PASS: Vision priority 5
PASS: High conf vision does not require confirmation
PASS: Low conf vision requires confirmation
PASS: Manual fallback
8/8 targetResolver tests passed
```

### Node peekabooAdapter Tests Output
```
> specter@1.0.0 test:peekabooAdapter
> npx ts-node --transpile-only scripts/test-peekabooAdapter.ts

PASS: Non-macOS disabled
PASS: Commands disabled on non-macOS
PASS: USE_PEEKABOO=false disabled
PASS: Commands disabled via env
PASS: Binary missing handled
PASS: Binary missing command handled
PASS: Valid JSON parsing
PASS: Invalid JSON handled
PASS: Timeout handled
PASS: Nonzero exit handled
PASS: Args are passed as an array to spawn
PASS: shell: false is used
PASS: Text is passed as a single argument without shell interpretation
13/13 peekabooAdapter tests passed
```

### demo-ghostwiki-e2e.sh Output
```
Starting memory service in background...
Waiting for service to be healthy...
PASS: Health check
Calling /ingest...
PASS: Ingest
Calling /query...
PASS: Query returned step-by-step procedural answer with sources
Calling /lint...
PASS: Lint identified missing success condition
All e2e tests PASSED!
```

## Known Limitations
- The Python sidecar is currently spawned as a child process of the Electron main process for local development/demo ease.
- `cognee` is currently an optional dependency that fails gracefully to local markdown search in `fallback` mode. This is by design.

## macOS Validation
**not run — requires macOS + Screen Recording + Accessibility permissions**

To validate locally on macOS:
```bash
brew install steipete/tap/peekaboo
peekaboo permissions status
```
