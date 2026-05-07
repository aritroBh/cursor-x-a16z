import { desktopCapturer, screen } from 'electron'

export async function captureScreenBase64(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  let sources
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })
  } catch (err) {
    const wrapped = new Error('Screen Recording permission denied. Grant access in System Settings, then retry.') as any
    wrapped.code = 'SCREEN_PERMISSION_DENIED'
    wrapped.cause = err
    throw wrapped
  }

  const source = sources.find((s) => s.display_id === String(primaryDisplay.id)) ?? sources[0]

  if (!source || source.thumbnail.isEmpty()) {
    const err = new Error('Screen Recording permission denied. Grant access in System Settings, then retry.') as any
    err.code = 'SCREEN_PERMISSION_DENIED'
    throw err
  }

  return source.thumbnail.toPNG().toString('base64')
}
