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
    'src/main/ai/planner.ts',
    'src/main/ai/screener.ts',
    'src/main/ai/tts.ts',
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
    'src/renderer/overlay/ModeToggle.tsx',
    'src/renderer/overlay/SessionPanel.tsx',
    'src/renderer/src/assets/overlay.css'
  ]

  for (const file of requiredFiles) {
    check(fileExists(file), `${file} exists`)
  }

  printHeader('Environment')

  const envPath = filePath('.env')
  const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''
  warnIf(fs.existsSync(envPath), '.env exists at project root')

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
  check(overlayCss.includes('siri-spin 5s'), 'overlay.css keeps 5s Siri-style conic rotation')
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
  check(overlayApp.includes('api.planSteps(trimmed, screenState, [], mode)'), 'OverlayApp passes current mode to planSteps')
  check(/try\s*{[\s\S]*api\.analyzeScreen\(\)[\s\S]*catch\s*\(/.test(overlayApp), 'intent submission is wrapped in try/catch')
  check(/finally\s*{[\s\S]*setIsLoading\(false\)/.test(overlayApp), 'intent submission clears loading in finally')
  check(overlayApp.includes('setErrorMessage('), 'OverlayApp can show a visible error message')
  check(overlayApp.includes('Walk me through') || overlayApp.includes('onWalkthrough'), 'renderer exposes walkthrough replay UI')
  check(overlayApp.includes('Do it for me') || overlayApp.includes('onAutoExecute'), 'renderer exposes auto-execute replay UI')
  check(overlayApp.includes("mode === 'ultra'") && overlayApp.includes('api.speak'), 'Ultra mode is the only submit path that starts TTS')
  check(overlayApp.includes('api.stopSpeaking'), 'Silent mode stops/avoids speech')
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
    'walkthrough',
    'autoExecute',
    'stopReplay',
    'onReplayStep',
    'onReplayProgress'
  ]) {
    check(preload.includes(exposed), `preload exposes ${exposed}`)
  }

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

  printHeader('Walkthrough vs Auto')

  const cursor = readFile('src/main/cursor.ts')
  const replay = readFile('src/main/session/replay.ts')
  const replayAuto = readFile('src/main/session/replayAuto.ts')
  const replayController = readFile('src/main/session/replayController.ts')
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
