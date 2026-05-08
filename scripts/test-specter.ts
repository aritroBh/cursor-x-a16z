import * as fs from 'fs'
import * as path from 'path'

type CheckKind = 'pass' | 'fail' | 'warn'

async function main() {
  const { default: chalk } = await import('chalk')
  const root = process.cwd()

  let passed = 0
  let failed = 0
  let warned = 0

  function printHeader(title: string) {
    console.log('\n' + chalk.cyan.bold('== ' + title + ' =='))
  }

  function report(kind: CheckKind, msg: string) {
    if (kind === 'pass') {
      passed++
      console.log(chalk.green.bold('PASS') + ' ' + msg)
    } else if (kind === 'warn') {
      warned++
      console.log(chalk.yellow.bold('WARN') + ' ' + msg)
    } else {
      failed++
      console.log(chalk.red.bold('FAIL') + ' ' + msg)
    }
  }

  function check(condition: boolean, msg: string) {
    report(condition ? 'pass' : 'fail', msg)
  }

  function warnIf(condition: boolean, msg: string) {
    report(condition ? 'pass' : 'warn', msg)
  }

  function filePath(p: string): string {
    return path.join(root, p)
  }

  function fileExists(p: string): boolean {
    return fs.existsSync(filePath(p))
  }

  function readFile(p: string): string {
    return fs.readFileSync(filePath(p), 'utf-8')
  }

  function listFiles(dir: string): string[] {
    const absolute = filePath(dir)
    if (!fs.existsSync(absolute)) return []

    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
      const child = path.join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(child)
      return [child]
    })
  }

  function cssSelectorRuleContains(source: string, selector: string, declaration: RegExp): boolean {
    return Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g)).some((match) => {
      const selectors = match[1].split(',').map((entry) => entry.trim())
      return selectors.includes(selector) && declaration.test(match[2])
    })
  }

  function exportedFunctionBody(source: string, name: string, nextName?: string): string {
    const start = source.indexOf(`export async function ${name}`)
    if (start === -1) return ''
    const end = nextName ? source.indexOf(`export async function ${nextName}`, start + 1) : -1
    return source.slice(start, end === -1 ? undefined : end)
  }

  printHeader('Files')

  const requiredFiles = [
    'package.json',
    'package-lock.json',
    'src/main/index.ts',
    'src/main/cursor.ts',
    'src/main/capture.ts',
    'src/main/permissions.ts',
    'src/main/ai/config.ts',
    'src/main/ai/health.ts',
    'src/main/ai/planner.ts',
    'src/main/ai/screener.ts',
    'src/main/ai/tts.ts',
    'src/main/ai/whisper.ts',
    'src/main/session/types.ts',
    'src/main/session/graph.ts',
    'src/main/session/storage.ts',
    'src/main/session/recorder.ts',
    'src/main/session/replay.ts',
    'src/main/session/replayAuto.ts',
    'src/main/session/replayController.ts',
    'src/main/session/replaySafety.ts',
    'src/main/userCursor.ts',
    'src/main/screenCoordinates.ts',
    'src/preload/index.ts',
    'src/renderer/src/overlay.tsx',
    'src/renderer/src/OverlayApp.tsx',
    'src/renderer/overlay/GhostCursor.tsx',
    'src/renderer/overlay/InputBar.tsx',
    'src/renderer/overlay/MicRecorder.ts',
    'src/renderer/overlay/ModeToggle.tsx',
    'src/renderer/overlay/SessionPanel.tsx',
    'src/renderer/src/assets/overlay.css',
    'docs/manual-stress-test-checklist.md'
  ]

  for (const file of requiredFiles) {
    check(fileExists(file), `${file} exists`)
  }

  printHeader('Environment')

  const envPath = filePath('.env')
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  const gitignore = fileExists('.gitignore') ? readFile('.gitignore') : ''
  const sourceFiles = listFiles('src').filter((file) => /\.(ts|tsx)$/.test(file))
  const rendererFilesReadingOpenAIKey = sourceFiles.filter(
    (file) =>
      (file.includes('/renderer/') || file.includes('/preload/')) &&
      /process\.env\.OPENAI_API_KEY|import\.meta\.env\.[A-Z0-9_]*OPENAI_API_KEY/.test(readFile(file))
  )

  warnIf(fs.existsSync(envPath), '.env exists at project root')
  check(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes('.env'),
    '.env is listed in .gitignore'
  )
  check(rendererFilesReadingOpenAIKey.length === 0, 'OPENAI_API_KEY is not read from renderer/preload code')

  for (const key of ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_API_KEY']) {
    const match = envContent.match(new RegExp('^' + key + '=(.+)$', 'm'))
    warnIf(Boolean(match && match[1].trim()), `${key} is present and non-empty in .env`)
  }

  printHeader('Package Scripts')

  const pkg = JSON.parse(readFile('package.json'))
  check(Boolean(pkg.scripts?.dev), 'package.json has npm run dev')
  check(Boolean(pkg.scripts?.build), 'package.json has npm run build')
  check(Boolean(pkg.scripts?.['test:specter']), 'package.json has npm run test:specter')

  printHeader('Overlay Contract')

  const overlayCss = readFile('src/renderer/src/assets/overlay.css')
  check(overlayCss.includes('@property --angle'), 'overlay.css keeps @property --angle')
  check(/siri-spin\s+[5-8]s/.test(overlayCss), 'overlay.css keeps 5–8s Siri-style conic rotation')
  check(overlayCss.includes('--edge-band') && overlayCss.includes('--edge-bloom'), 'overlay.css defines a wider edge band and bloom')
  check(overlayCss.includes('mix-blend-mode: screen'), 'edge glow uses screen blending for varied backgrounds')
  check(/padding:\s*var\(--edge-band\)/.test(overlayCss), 'crisp edge ring uses the wider visible band')
  check(!overlayCss.includes('siri-glow-thin'), 'old siri-glow-thin animation name is absent')
  check(!overlayCss.includes('background: #000'), 'overlay.css does not force an opaque black background')

  const overlayEntry = readFile('src/renderer/src/overlay.tsx')
  check(!overlayEntry.includes('React.StrictMode'), 'overlay entry does not wrap OverlayApp in React.StrictMode')

  const ghostCursor = readFile('src/renderer/overlay/GhostCursor.tsx')
  check(ghostCursor.includes('step.x') && ghostCursor.includes('step.y'), 'GhostCursor uses normalized x/y')
  check(!ghostCursor.includes('targetX') && !ghostCursor.includes('targetY'), 'GhostCursor does not use targetX/targetY')
  check(ghostCursor.includes('fill="white"'), 'GhostCursor renders a white pointer shape')
  check(!ghostCursor.includes('cursor-dot') && !ghostCursor.includes('#7c3aed'), 'GhostCursor is not a purple dot/orb')

  printHeader('Renderer Stability')

  const overlayApp = readFile('src/renderer/src/OverlayApp.tsx')
  check(overlayApp.includes('api.planSteps(trimmed, res, [], mode)'), 'OverlayApp passes fresh analyze result to planSteps')
  check(/try\s*{[\s\S]*api\.(analyzeScreen|detectRealAppTargets)\([\s\S]*catch\s*\(/.test(overlayApp), 'intent submission is wrapped in try/catch')
  check(/finally\s*{[\s\S]*setIsLoading\(false\)/.test(overlayApp), 'intent submission clears loading in finally')
  check(overlayApp.includes('setErrorMessage('), 'OverlayApp can show a visible error message')
  check(overlayApp.includes('Walk me through') || overlayApp.includes('onWalkthrough'), 'renderer exposes walkthrough replay UI')
  check(overlayApp.includes('Do it for me') || overlayApp.includes('onAutoExecute'), 'renderer exposes auto-execute replay UI')
  check(overlayApp.includes('mode === "ultra"') && overlayApp.includes('speakIfUltra') && overlayApp.includes('api.speak'), 'Ultra mode conditionally starts TTS through speakIfUltra')
  check(overlayApp.includes('api.stopSpeaking'), 'Silent mode stops/avoids speech')
  check(overlayApp.includes('[ULTRA] skipped because silent mode'), 'Silent mode logs skipped TTS')
  check(overlayApp.includes('mode,') && overlayApp.includes('real-app'), 'real-app workflow preserves the current mode')
  check(
    overlayApp.includes('SHOW_WALKTHROUGH_DEBUG') && overlayApp.includes('walkthrough-debug-pill'),
    'OverlayApp has dev-only walkthrough step/coordinate debug pill'
  )

  printHeader('Preload IPC')

  const preload = readFile('src/preload/index.ts')
  check(preload.includes('return () => ipcRenderer.removeListener'), 'preload listener helpers return unsubscribe cleanup')

  for (const exposed of [
    'moveRealMouse',
    'clickRealMouse',
    'executeRealMouseSteps',
    'planSteps',
    'checkAIBackend',
    'walkthrough',
    'autoExecute',
    'stopReplay',
    'onReplayStep',
    'onReplayProgress'
  ]) {
    check(preload.includes(exposed), `preload exposes ${exposed}`)
  }

  printHeader('Whisper and Mic')

  const whisper = readFile('src/main/ai/whisper.ts')
  const micRecorder = readFile('src/renderer/overlay/MicRecorder.ts')
  const inputBar = readFile('src/renderer/overlay/InputBar.tsx')
  const mainIndexForWhisper = readFile('src/main/index.ts')
  const transcribeBody = exportedFunctionBody(whisper, 'transcribe')
  const openAICallIndex = transcribeBody.indexOf('openai.audio.transcriptions.create')
  const emptyBufferGuardIndex = transcribeBody.indexOf('audioBuffer.length === 0')

  check(!/new\s+File\s*\(/.test(whisper), 'whisper.ts does not use global File')
  check(whisper.includes("from 'openai/uploads'") && whisper.includes('toFile('), 'whisper.ts uses toFile from openai/uploads')
  check(whisper.includes("from 'node:buffer'") && whisper.includes('File as NodeFile'), 'whisper.ts imports File as NodeFile from node:buffer')
  check(whisper.includes('globalThis.File') && whisper.includes('undefined'), 'whisper.ts assigns globalThis.File when undefined')
  check(emptyBufferGuardIndex !== -1 && (openAICallIndex === -1 || emptyBufferGuardIndex < openAICallIndex), 'Whisper returns before OpenAI when buffer length is 0')
  check(whisper.includes('[WHISPER] installed Node File polyfill for OpenAI uploads'), 'whisper.ts logs File polyfill installation')
  check(whisper.includes('[WHISPER] created upload file'), 'whisper.ts logs upload file creation')
  check(whisper.includes('[WHISPER] transcription success') && whisper.includes('textLength'), 'whisper.ts logs transcription success with textLength')
  check(whisper.includes('[WHISPER] transcription failed') && whisper.includes('category') && whisper.includes('message'), 'whisper.ts logs transcription failures with category and message')
  check(mainIndexForWhisper.includes('bufferFromAudioData') && mainIndexForWhisper.includes('convertedBufferLength'), 'whisper IPC robustly converts ArrayBuffer and logs converted length')
  check(micRecorder.includes('MediaRecorder.isTypeSupported') && micRecorder.includes('audio/webm;codecs=opus'), 'MicRecorder chooses supported mime type with fallback')
  check(micRecorder.includes('start(250)') && micRecorder.includes('requestData()'), 'MicRecorder starts with timeslice and requests final data before stop')
  check(micRecorder.includes('[MIC] final blob size') && inputBar.includes('No audio captured. Speak a little longer.'), 'MicRecorder/InputBar handle zero-byte recordings without Whisper')
  check(inputBar.includes('handleCancel') && inputBar.includes('onCancel={handleCancel}') && inputBar.includes('Escape'), 'InputBar safely stops recording via cancel button or Escape')
  check(inputBar.includes('setValue(text.trim())') && !inputBar.includes('onSubmit(text)'), 'transcription populates input instead of submitting empty/implicit text')
  check(whisper.includes('WHISPER_TIMEOUT_MS') && whisper.includes('Promise.race'), 'whisper.ts implements transcription timeout via Promise.race')
  check(inputBar.includes('Transcription timed out'), 'InputBar displays timeout message on WHISPER_TIMEOUT')
  check(inputBar.includes('error?.userMessage || "Microphone unavailable'), 'InputBar displays friendly microphone unavailable errors')
  check(inputBar.includes('setMicState("idle")') && inputBar.includes('recordingStartRef.current = null'), 'InputBar guarantees mic state resets to idle after failure')
  check(inputBar.includes('Promise.race') && inputBar.includes('api.transcribe'), 'InputBar uses Promise.race for api.transcribe timeout')
  check(!/if\s*\(\s*micState\s*!==\s*["']idle["']\s*\)\s*setMicState\(\s*["']idle["']\s*\)/.test(inputBar), 'InputBar mic reset does not use stale micState condition')
  check(!/export\s+async\s+function\s+transcribe[\s\S]*?typeof\s+globalThis\.File/.test(whisper), 'whisper.ts installs globalThis.File at module load, not inside transcribe')

  printHeader('Planner and Screener Safety')

  const planner = readFile('src/main/ai/planner.ts')
  const screener = readFile('src/main/ai/screener.ts')
  const mainIndex = readFile('src/main/index.ts')
  const analyzeScreenBody = exportedFunctionBody(screener, 'analyzeScreen')

  check(planner.includes('safeScreenState') && planner.includes('coordinatesFrom'), 'planner guards nullable screen state')
  check(planner.includes('partial.x ?? partial.targetX') && planner.includes('partial.y ?? partial.targetY'), 'planner accepts legacy targetX/targetY input')
  check(!/targetX\s*:/.test(planner), 'planner does not emit targetX as an object key')
  check(planner.includes('x: clampCoordinate') && planner.includes('y: clampCoordinate'), 'planner normalizes output to x/y')
  check(screener.includes("app: 'Unknown'") && screener.includes('coordinates: []'), 'screener fallback is { app: Unknown, coordinates: [] }')
  check(!/return\s+null/.test(analyzeScreenBody), 'analyzeScreen does not return null on failures')
  check(mainIndex.includes('fallbackScreenState()'), 'main screen:analyze handler returns fallback on capture/analyze failure')

  const replayController = readFile('src/main/session/replayController.ts')

  printHeader('Click-Through Safety')

  const restoreOverlayBody = exportedFunctionBody(replayController, 'restoreOverlayAfterReplay')
  check(!restoreOverlayBody.includes('overlayWindow.setIgnoreMouseEvents(false)'), 'restoreOverlayAfterReplay does not force interactive by default')
  const detectTargetsBody = exportedFunctionBody(mainIndex, 'realApp:detectTargets')
  check(!detectTargetsBody.includes('setIgnoreMouseEvents(false)'), 'realApp:detectTargets restores click-through true after capture')
  check(mainIndex.includes("'screen:analyze'") && mainIndex.includes('captureUnderlying') && mainIndex.includes('overlayWindow.hide()'), 'screen:analyze hides overlay before capture when captureUnderlying is set')
  check(
    cssSelectorRuleContains(overlayCss, '.specter-hud-shell', /pointer-events:\s*none/),
    'HUD shell does not block clicks in invisible surrounding space'
  )
  for (const selector of [
    '.specter-hud-drag-handle',
    '.specter-workflow-card',
    '.mode-toggle',
    '.input-bar',
    '.session-panel',
    '.specter-debug-toggle',
    '.specter-debug-tools',
    '.specter-hud-shell button',
    '.specter-hud-shell input'
  ]) {
    check(
      cssSelectorRuleContains(overlayCss, selector, /pointer-events:\s*auto/),
      `${selector} remains clickable inside the inert HUD shell`
    )
  }

  printHeader('Walkthrough vs Auto')

  const cursor = readFile('src/main/cursor.ts')
  const replay = readFile('src/main/session/replay.ts')
  const replayAuto = readFile('src/main/session/replayAuto.ts')
  const replaySafety = readFile('src/main/session/replaySafety.ts')
  const userCursor = readFile('src/main/userCursor.ts')
  const walkthroughBody = exportedFunctionBody(replay, 'replayWalkthrough', 'registerReplayIpc')
  const autoBody = exportedFunctionBody(replayAuto, 'replayAutoExecute')
  const realCursorImportPattern = /from\s+['"]\.\.\/cursor['"]|from\s+['"]\.\/cursor['"]/
  const replayModulesWithCursorImport = [
    ['src/main/session/replay.ts', replay],
    ['src/main/session/replayAuto.ts', replayAuto],
    ['src/main/session/replayController.ts', replayController]
  ]
    .filter(([, source]) => realCursorImportPattern.test(source))
    .map(([file]) => file)

  check(cursor.includes('moveRealMouse') && cursor.includes('clickRealMouse'), 'real mouse automation has explicit real-mouse names')
  check(!cursor.includes('ghostMove') && !cursor.includes('ghostClick'), 'real cursor module no longer exports ghostMove/ghostClick names')
  check(!realCursorImportPattern.test(replay), 'walkthrough replay module does not import cursor.ts')
  check(
    replayModulesWithCursorImport.length === 1 && replayModulesWithCursorImport[0] === 'src/main/session/replayAuto.ts',
    'replayAuto.ts is the only replay module that imports cursor.ts'
  )
  check(!/moveRealMouse|clickRealMouse|executeRealMouseSteps|mouse\.move|mouse\.click/.test(walkthroughBody), 'replayWalkthrough body does not call real mouse automation')
  check(!/@nut-tree-fork\/nut-js/.test(replay), 'walkthrough replay module does not import nut-js')
  check(walkthroughBody.includes('emitGhostStep'), 'replayWalkthrough emits renderer replay step events')
  check(walkthroughBody.includes('waitForUserClickOnTarget'), 'click walkthrough steps require user click completion')
  check(
    walkthroughBody.includes("} else if (step.action === 'click') {") &&
      walkthroughBody.includes('result = await waitForUserClickOnTarget(step, controller)'),
    'click walkthrough steps arm click detection before hover-only waits'
  )
  check(walkthroughBody.includes("step.action === 'wait'") && walkthroughBody.includes('stepWaitMs'), 'wait steps sleep and continue')
  check(!walkthroughBody.includes('45000'), 'walkthrough no longer uses 45 second per-step waits')
  check(walkthroughBody.includes('MAX_WALKTHROUGH_ATTEMPTS'), 'walkthrough has max attempt protection')
  check(autoBody.includes('clickRealMouse') && autoBody.includes('executeRealMouseSteps'), 'replayAutoExecute calls real mouse automation')
  check(autoBody.includes('[AUTO_REAL_MOUSE]'), 'auto replay logs real OS automation loudly')
  check(replay.includes('[WALKTHROUGH]') && replay.includes('[GHOST]'), 'walkthrough replay has walkthrough and ghost logs')
  check(replay.includes('[USER_CURSOR]') && replay.includes('[CLICK_DETECT]'), 'walkthrough replay has user cursor and click detection logs')
  check(
    replaySafety.includes('assertWalkthroughReplaySafety') && replaySafety.includes('DEV SAFETY GUARD'),
    'development safety guard checks walkthrough real-mouse imports/calls'
  )
  check(userCursor.includes('waitForUserClickAtTarget') && userCursor.includes("uIOhook.on('click'"), 'user cursor module can wait for an actual user click at target')

  printHeader('AI Config Safety')

  const config = readFile('src/main/ai/config.ts')
  check(fileExists('src/main/ai/config.ts'), 'src/main/ai/config.ts exists')
  check(config.includes('export function createAnthropicClient'), 'config.ts exports createAnthropicClient')
  check(config.includes('getUseLocalModel'), 'config.ts reads USE_LOCAL_MODEL')
  check(
    config.includes('USE_LOCAL_MODEL === \'true\'') || config.includes('USE_LOCAL_MODEL === "true"'),
    'config.ts uses strict "true" check for USE_LOCAL_MODEL'
  )
  check(config.includes('isLocalhostUrl'), 'config.ts has localhost URL guard')
  check(
    config.includes("OFFICIAL_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'") ||
      config.includes('OFFICIAL_ANTHROPIC_BASE_URL = "https://api.anthropic.com"'),
    'config.ts explicitly forces official Anthropic baseURL in non-local mode'
  )
  check(
    /getLocalModelBaseUrl\(\)[\s\S]*?USE_LOCAL_MODEL (===|!==) ['"]true['"]/.test(config),
    'config.ts gates getLocalModelBaseUrl behind USE_LOCAL_MODEL === "true"'
  )
  check(
    !config.includes('console.log') && !config.includes('console.warn') && !config.includes('console.error'),
    'config.ts does not use raw console.log/console.warn/console.error'
  )
  check(config.includes('classifyAnthropicError'), 'config.ts classifies Anthropic failures into safe categories')

  printHeader('AI Backend Health')

  const health = readFile('src/main/ai/health.ts')
  check(mainIndex.includes("'ai:healthCheck'") || mainIndex.includes('"ai:healthCheck"'), 'index.ts registers ai:healthCheck IPC')
  check(preload.includes('checkAIBackend') && preload.includes('ai:healthCheck'), 'preload exposes checkAIBackend without exposing keys')
  check(overlayApp.includes('Check AI Backend'), 'Debug UI exposes Check AI Backend')
  check(health.includes('keyLength') && health.includes('placeholderDetected'), 'AI health reports key length and placeholder status')
  check(!/slice\s*\(/.test(health), 'AI health does not expose API key prefixes')
  check(!/console\.(log|warn|error)/.test(health), 'AI health uses safe logging only')
  check(health.includes('Return OK') && health.includes('max_tokens: 8'), 'AI health uses a tiny text-only Anthropic test request')
  check(health.includes('OPENAI_API_KEY') && health.includes('whisperConfigured'), 'AI health reports OpenAI Whisper configuration')

  printHeader('Logger Safety')

  check(fileExists('src/main/logger.ts'), 'src/main/logger.ts exists')
  const logger = readFile('src/main/logger.ts')
  check(logger.includes('export function safeLog'), 'logger.ts exports safeLog')
  check(logger.includes('export function safeWarn'), 'logger.ts exports safeWarn')
  check(logger.includes('export function safeError'), 'logger.ts exports safeError')
  check(logger.includes('REDACTED') && logger.includes('OPENAI_API_KEY'), 'logger redacts secret-shaped values before printing')
  check(mainIndex.includes("from './logger'") || mainIndex.includes("from '../logger'"), 'index.ts imports safe logger')
  check(mainIndex.includes('safeLog') && mainIndex.includes('safeWarn') && mainIndex.includes('safeError'), 'index.ts uses safeLog/safeWarn/safeError')
  const tts = readFile('src/main/ai/tts.ts')
  check(tts.includes('[TTS] speak called') && tts.includes('[TTS] error fallback'), 'TTS logs speak attempts and safe fallback errors')

  printHeader('Window Routing')

  const screenCoordinates = readFile('src/main/screenCoordinates.ts')
  const capture = readFile('src/main/capture.ts')
  const stressChecklist = readFile('docs/manual-stress-test-checklist.md')
  const toScreenPointBody = screenCoordinates.slice(
    screenCoordinates.indexOf('export async function toScreenPoint'),
    screenCoordinates.indexOf('export function screenPointToPercent')
  )
  const screenPointToPercentBody = screenCoordinates.slice(
    screenCoordinates.indexOf('export function screenPointToPercent'),
    screenCoordinates.indexOf('export function logicalPointToPercent')
  )

  check(mainIndex.includes('[WINDOW_ROUTING] overlay summon request'), 'double-shift summon logs window routing request')
  check(mainIndex.includes('screen.getCursorScreenPoint()'), 'double-shift routing samples the current cursor point')
  check(mainIndex.includes('screen.getDisplayNearestPoint'), 'double-shift routing selects the nearest active display')
  check(mainIndex.includes('setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })'), 'overlay is visible on all workspaces and fullscreen spaces')
  check(mainIndex.includes('setFullScreenable(false)'), 'overlay uses non-fullscreenable macOS auxiliary behavior')
  check(mainIndex.includes('showInactive()'), 'overlay summon can show without stealing active-app focus')
  check(mainIndex.includes('setContentBounds'), 'practice window is centered on the routed display')
  check(mainIndex.includes('[STRESS_TEST]'), 'main process has stress-test lifecycle logs')
  check(mainIndex.includes('SPECTER_OPEN_DEVTOOLS'), 'devtools are opt-in for cleaner demo flow')
  check(screenCoordinates.includes('setActiveCoordinateDisplay'), 'coordinate conversion tracks the routed active display')
  check(screenCoordinates.includes("COORDINATE_MODE = 'electron logical display bounds'"), 'coordinate mode says electron logical display bounds')
  check(toScreenPointBody.includes('display.bounds.width') && toScreenPointBody.includes('display.bounds.height'), 'toScreenPoint maps percent into active display bounds')
  check(!/logical[XY]\s*\*\s*(scale|display\.scaleFactor)|display\.bounds\.\w+\s*\*\s*display\.scaleFactor/.test(toScreenPointBody), 'toScreenPoint does not multiply percent coordinates by scaleFactor')
  check(!screenCoordinates.includes('physicalBoundsForDisplay'), 'screenCoordinates no longer uses physicalBoundsForDisplay for default percent mapping')
  check(screenPointToPercentBody.includes('display.bounds'), 'screenPointToPercent uses the same logical display bounds')
  check(capture.includes('getActiveCoordinateDisplay'), 'screen capture follows the routed active display')
  check(stressChecklist.includes('## A. Overlay Toggling') && stressChecklist.includes('## H. Window Lifecycle'), 'manual stress-test checklist covers A through H')

  printHeader('Capture Log Naming')

  const analyzeBody = exportedFunctionBody(mainIndex, "screen:analyze")
  check(mainIndex.includes("[CAPTURE_SCREEN]"), 'index.ts uses [CAPTURE_SCREEN] prefix when captureUnderlying is false')
  check(
    !/\[CAPTURE_UNDERLYING\][\s\S]*?starting screenshot capture/.test(analyzeBody) || analyzeBody.includes('logPrefix'),
    'screen:analyze does not unconditionally log [CAPTURE_UNDERLYING]'
  )

  printHeader('Passive Overlay Behavior')

  const overlayAppBody = readFile('src/renderer/src/OverlayApp.tsx')
  check(
    !overlayAppBody.includes('api.analyzeScreen()') || !/useEffect\(\s*\(\)\s*=>\s*{[\s\S]*?api\.analyzeScreen\(\)/.test(overlayAppBody),
    'OverlayApp does not unconditionally call api.analyzeScreen() inside a useEffect tied to isVisible'
  )
  check(!/api\.onReplayStep\s*\([\s\S]{1,200}?mode\s*===\s*["']ultra["']/.test(overlayAppBody), 'OverlayApp does not read mode === "ultra" directly inside useEffect() replay listeners')
  check(overlayAppBody.includes('modeRef = useRef(mode)'), 'OverlayApp contains modeRef')

  printHeader('Ultra Mode')

  check(overlayAppBody.includes('speakIfUltra') && overlayAppBody.includes('mode === "ultra"'), 'renderer gates speech on ultra mode')
  check(overlayAppBody.includes('[ULTRA] speaking...') && overlayAppBody.includes('[ULTRA] skipped because silent mode'), 'renderer logs ultra speech and silent skips')
  check(overlayAppBody.includes('mode,') && mainIndex.includes('[MODE] current mode'), 'real-app flow passes and logs current mode')
  check(readFile('src/main/ai/tts.ts').includes('[TTS] speak called'), 'TTS speak path logs speak calls')
  check(planner.includes('export async function ultraConverse'), 'planner exports ultraConverse')
  check(mainIndex.includes("ipcMain.handle('ultra:converse'"), 'index.ts registers ultra:converse IPC')
  check(preload.includes('ultraConverse:'), 'preload exposes ultraConverse')
  check(fileExists('src/renderer/overlay/UltraReplyBubble.tsx'), 'UltraReplyBubble component exists')
  check(overlayAppBody.includes('handleUltraSpokenInput') && overlayAppBody.includes('ultraState'), 'OverlayApp has handleUltraSpokenInput and ultraState')
  check(overlayAppBody.includes('[ULTRA] user said') && overlayAppBody.includes('[ULTRA] tutor reply'), 'OverlayApp logs user said and tutor reply')
  check(inputBar.includes('mode === "ultra" && onUltraSpokenInput'), 'InputBar auto-sends to tutor in Ultra mode')
  check(planner.includes('fallbackUltraReply'), 'ultraConverse provides fallback replies')

  printHeader('AI Backend Fallback Safety')

  const screenerBody = readFile('src/main/ai/screener.ts')
  const plannerBody = readFile('src/main/ai/planner.ts')
  check(screenerBody.includes('AI_BACKEND_UNAVAILABLE'), 'screener returns AI_BACKEND_UNAVAILABLE fallback')
  check(plannerBody.includes('AI_BACKEND_UNAVAILABLE'), 'planner handles AI_BACKEND_UNAVAILABLE')
  check(
    screenerBody.includes("'[AI_BACKEND] Anthropic unavailable; using fallback'") || screenerBody.includes('"[AI_BACKEND] Anthropic unavailable; using fallback"'),
    'screener logs AI_BACKEND fallback'
  )
  check(
    plannerBody.includes("'[AI_BACKEND] Anthropic unavailable; using fallback'") || plannerBody.includes('"[AI_BACKEND] Anthropic unavailable; using fallback"'),
    'planner logs AI_BACKEND fallback'
  )

  printHeader('Session Normalization')

  const storage = readFile('src/main/session/storage.ts')
  const recorder = readFile('src/main/session/recorder.ts')
  check(storage.includes('instruction') && storage.includes('targetLabel'), 'stored session steps preserve instructional labels')
  check(storage.includes('waitForMs'), 'stored session steps preserve waitForMs')
  check(recorder.includes('waitForMs'), 'recorded steps preserve waitForMs')

  const total = passed + failed
  console.log('\n' + chalk.bold('-'.repeat(48)))
  console.log(chalk.bold(`${passed}/${total} automated checks passed`))
  if (warned > 0) {
    console.log(chalk.yellow.bold(`${warned} warning(s); demo may need local secrets or permissions`))
  }
  if (failed > 0) {
    console.log(chalk.red.bold(`${failed} automated check(s) failed`))
    process.exit(1)
  }
  console.log(chalk.green.bold('All Specter health checks passed'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
