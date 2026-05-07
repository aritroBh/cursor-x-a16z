import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const { default: chalk } = await import('chalk')
  const root = process.cwd()

  let passed = 0
  let failed = 0

  function printHeader(title: string) {
    console.log('\n' + chalk.cyan.bold('─── ' + title + ' ───'))
  }

  function pass(msg: string) {
    passed++
    console.log(chalk.green.bold('PASS') + ' ' + msg)
  }

  function fail(msg: string) {
    failed++
    console.log(chalk.red.bold('FAIL') + ' ' + msg)
  }

  function fileExists(p: string): boolean {
    return fs.existsSync(path.join(root, p))
  }

  function readFile(p: string): string {
    return fs.readFileSync(path.join(root, p), 'utf-8')
  }

  // ─── CATEGORY 1: ENV + CONFIG ───
  printHeader('CATEGORY 1: ENV + CONFIG')

  const envPath = path.join(root, '.env')
  if (fs.existsSync(envPath)) {
    pass('.env exists at project root')
  } else {
    fail('.env exists at project root')
  }

  let envContent = ''
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8')
  }

  const requiredKeys = ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'OPENAI_API_KEY']
  for (const key of requiredKeys) {
    const match = envContent.match(new RegExp('^' + key + '=(.+)$', 'm'))
    if (match && match[1].trim().length > 0) {
      pass(`${key} is present and non-empty in .env`)
    } else {
      fail(`${key} is present and non-empty in .env`)
    }
  }

  const overlayCssPath = 'src/renderer/src/assets/overlay.css'
  const overlayCss = fileExists(overlayCssPath) ? readFile(overlayCssPath) : ''

  if (overlayCss.includes('@property --angle')) {
    pass('overlay.css contains "@property --angle"')
  } else {
    fail('overlay.css contains "@property --angle"')
  }

  if (!overlayCss.includes('siri-glow-thin')) {
    pass('overlay.css does NOT contain "siri-glow-thin"')
  } else {
    fail('overlay.css does NOT contain "siri-glow-thin"')
  }

  if (overlayCss.includes('siri-spin 5s')) {
    pass('overlay.css contains "siri-spin 5s"')
  } else {
    fail('overlay.css contains "siri-spin 5s"')
  }

  // ─── CATEGORY 2: FILE EXISTENCE ───
  printHeader('CATEGORY 2: FILE EXISTENCE')

  const requiredFiles = [
    'src/main/index.ts',
    'src/main/ai/planner.ts',
    'src/main/ai/screener.ts',
    'src/main/ai/tts.ts',
    'src/main/ai/whisper.ts',
    'src/main/ai/bandit.ts',
    'src/main/cursor.ts',
    'src/main/capture.ts',
    'src/main/permissions.ts',
    'src/main/session/types.ts',
    'src/main/session/graph.ts',
    'src/main/session/storage.ts',
    'src/main/session/recorder.ts',
    'src/main/session/replay.ts',
    'src/preload/index.ts',
    'src/renderer/overlay/InputBar.tsx',
    'src/renderer/overlay/GhostCursor.tsx',
    'src/renderer/overlay/ModeToggle.tsx',
    'src/renderer/overlay/MicRecorder.ts',
    'src/renderer/overlay/SessionPanel.tsx',
    'src/renderer/src/OverlayApp.tsx',
    'src/renderer/src/assets/overlay.css'
  ]

  for (const f of requiredFiles) {
    if (fileExists(f)) {
      pass(`${f} exists`)
    } else {
      fail(`${f} exists`)
    }
  }

  // ─── CATEGORY 3: CODE SMELL CHECKS ───
  printHeader('CATEGORY 3: CODE SMELL CHECKS')

  const plannerText = readFile('src/main/ai/planner.ts')
  if (!/targetX\s*:/.test(plannerText)) {
    pass('planner.ts does NOT set targetX as an object key')
  } else {
    fail('planner.ts does NOT set targetX as an object key')
  }

  const ghostCursorText = readFile('src/renderer/overlay/GhostCursor.tsx')
  if (!ghostCursorText.includes('targetX')) {
    pass('GhostCursor.tsx does NOT contain "targetX"')
  } else {
    fail('GhostCursor.tsx does NOT contain "targetX"')
  }

  const preloadText = readFile('src/preload/index.ts')
  if (preloadText.includes('planSteps')) {
    pass('preload/index.ts exposes "planSteps"')
  } else {
    fail('preload/index.ts exposes "planSteps"')
  }

  const overlayAppText = readFile('src/renderer/src/OverlayApp.tsx')
  if (overlayAppText.includes('planSteps(text, screenState, [], mode)')) {
    pass('OverlayApp.tsx passes mode to api.planSteps')
  } else {
    fail('OverlayApp.tsx passes mode to api.planSteps')
  }

  if (overlayAppText.includes('useState(false)')) {
    pass('OverlayApp.tsx contains "useState(false)"')
  } else {
    fail('OverlayApp.tsx contains "useState(false)"')
  }

  if (!overlayAppText.includes('useState(true)')) {
    pass('OverlayApp.tsx does NOT contain "useState(true)"')
  } else {
    fail('OverlayApp.tsx does NOT contain "useState(true)"')
  }

  if (ghostCursorText.includes('step.x')) {
    pass('GhostCursor.tsx uses "step.x"')
  } else {
    fail('GhostCursor.tsx uses "step.x"')
  }

  const micRecorderText = readFile('src/renderer/overlay/MicRecorder.ts')
  if (micRecorderText.includes('export')) {
    pass('MicRecorder.ts exports a class or function')
  } else {
    fail('MicRecorder.ts exports a class or function')
  }

  // ─── CATEGORY 4: IPC SURFACE CHECK ───
  printHeader('CATEGORY 4: IPC SURFACE CHECK')

  const mainIndexText = readFile('src/main/index.ts')
  const replayText = readFile('src/main/session/replay.ts')
  const mainSource = mainIndexText + '\n' + replayText

  const ipcChannels = [
    'cursor:move',
    'cursor:click',
    'cursor:replay',
    'screen:capture',
    'screen:analyze',
    'planner:plan',
    'planner:converse',
    'session:save',
    'session:load',
    'session:save-node',
    'bandit:select',
    'bandit:reward',
    'tts:speak',
    'whisper:transcribe',
    'replay:walkthrough',
    'replay:auto',
    'replay:stop'
  ]

  for (const channel of ipcChannels) {
    const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`ipcMain\\.handle\\(['"\`]${escaped}['"\`]`)
    if (regex.test(mainSource)) {
      pass(`ipcMain.handle registered for '${channel}'`)
    } else {
      fail(`ipcMain.handle registered for '${channel}'`)
    }
  }

  // ─── CATEGORY 5: MANUAL CHECKLIST ───
  printHeader('CATEGORY 5: MANUAL CHECKLIST')

  const manualItems = [
    '1. Run `npm run dev` — app launches without terminal errors',
    '2. Main window renders dark background (#0d0f14)',
    '3. Overlay window background is transparent (not black)',
    '4. .siri-glow-input border shows rotating rainbow conic gradient around InputBar',
    '5. Glow rotation speed feels slow (~5s per cycle)',
    '6. Double-shift triggers overlay to appear',
    '7. Double-shift again hides overlay',
    '8. ModeToggle Silent button highlights white when selected',
    '9. ModeToggle Ultra button highlights white when selected',
    '10. Clicking Ultra then submitting intent — planner receives mode=\'ultra\' (check terminal log "[PLANNER] Intent:")',
    '11. Type an intent, press Enter — "[PLANNER] Calling Claude..." appears in terminal',
    '12. Ghost cursor appears and moves to first step coordinates',
    '13. In Ultra mode — ElevenLabs TTS speaks the level title',
    '14. In Silent mode — no speech plays',
    '15. Session JSON written to ~/Library/Application Support/Specter/ after walkthrough',
    '16. Screen Recording permission granted (check System Settings > Privacy)',
    '17. Accessibility permission granted (check System Settings > Privacy)',
    '18. Mic button visible in InputBar (if wired)',
    '19. Hold mic button — recording starts; release — transcription fires',
    '20. Replay walkthrough re-runs steps from saved session JSON'
  ]

  for (const item of manualItems) {
    const parts = item.split(' — ')
    const desc = parts[0]
    const expected = parts[1] || ''
    if (expected) {
      console.log(chalk.yellow('[ ]') + ' ' + desc + chalk.gray('  →  ') + chalk.gray(expected))
    } else {
      console.log(chalk.yellow('[ ]') + ' ' + desc)
    }
  }

  // ─── SUMMARY ───
  const total = passed + failed
  console.log('\n' + chalk.bold('─'.repeat(40)))
  console.log(chalk.bold(`${passed}/${total} automated checks passed`))
  if (failed > 0) {
    console.log(chalk.red.bold(`${failed} automated check(s) failed`))
    process.exit(1)
  } else {
    console.log(chalk.green.bold('All automated checks passed'))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
