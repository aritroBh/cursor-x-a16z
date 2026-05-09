import { shell, desktopCapturer, dialog, app } from 'electron'
import { safeLog, safeWarn } from './logger'

let getAuthStatus: (type: string) => string = () => 'not determined'
let askForAccessibilityAccess: () => void = () => {}

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('node-mac-permissions')
  getAuthStatus = pkg.getAuthStatus
  askForAccessibilityAccess = pkg.askForAccessibilityAccess
} catch (e) {
  safeWarn('[PERMISSIONS] node-mac-permissions not available. Mocking permissions check.', e)
}

const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function triggerScreenRecordingPrompt(): Promise<void> {
  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    })
  } catch {
    // Expected to fail if permission not granted
  }
}

function showPermissionDialog(missing: string[]): 'retry' | 'quit' {
  const screenLine = missing.includes('screen')
    ? '• Screen Recording — required to capture your desktop\n'
    : ''
  const accessibilityLine = missing.includes('accessibility')
    ? '• Accessibility — required for mouse control automation\n'
    : ''
  const inputMonitoringLine =
    '• Input Monitoring — enable this if global clicks, Space/Enter fallback, or double-shift detection do not fire\n'

  const detail =
    `Specter needs the following permissions to function:\n\n` +
    screenLine +
    accessibilityLine +
    inputMonitoringLine +
    `\nFor Screen Recording: if the system prompt did not appear, open System Settings → Privacy & Security → Screen Recording and enable Specter, then click Retry.\n` +
    `For Accessibility: grant access in System Settings, then click Retry.\n` +
    `For Input Monitoring: Specter does not block startup on this, but walkthrough click detection depends on macOS allowing global input hooks.`

  const result = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Retry', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    title: 'Permissions Required',
    message: 'Specter needs additional permissions',
    detail
  })

  return result === 0 ? 'retry' : 'quit'
}

export async function checkPermissions(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return true
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let screenStatus = getAuthStatus('screen')
    if (screenStatus !== 'authorized') {
      await triggerScreenRecordingPrompt()
      await sleep(500)
      screenStatus = getAuthStatus('screen')
    }

    const accessibilityStatus = getAuthStatus('accessibility')
    if (accessibilityStatus === 'not determined') {
      askForAccessibilityAccess()
    }

    const missing: string[] = []
    if (screenStatus !== 'authorized') missing.push('screen')
    if (accessibilityStatus !== 'authorized') missing.push('accessibility')

    safeLog('[PERMISSIONS] Status check:', {
      screen: screenStatus,
      accessibility: accessibilityStatus,
      missing
    })

    if (missing.length === 0) {
      safeLog('[PERMISSIONS] All required permissions granted.')
      return true
    }

    if (getAuthStatus.toString().includes('not determined')) {
      safeWarn('[PERMISSIONS] node-mac-permissions is mocked. Proceeding assuming permissions are granted.')
      return true
    }

    if (missing.includes('accessibility')) {
      shell.openExternal(ACCESSIBILITY_SETTINGS_URL)
    }

    const action = showPermissionDialog(missing)
    if (action === 'quit') {
      app.quit()
      return false
    }
  }
}

const PERMISSION_ERROR_PATTERNS = [/permission/i, /access denied/i, /not authorized/i, /screen recording/i]

export function isPermissionError(err: unknown): boolean {
  if (err instanceof Error) {
    return PERMISSION_ERROR_PATTERNS.some((re) => re.test(err.message))
  }
  return false
}
