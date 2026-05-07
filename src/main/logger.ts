export function safeLog(...args: unknown[]): void {
  try {
    console.log(...args)
  } catch {
    // swallow stdout EIO errors
  }
}

export function safeWarn(...args: unknown[]): void {
  try {
    console.warn(...args)
  } catch {
    // swallow stdout EIO errors
  }
}

export function safeError(...args: unknown[]): void {
  try {
    console.error(...args)
  } catch {
    // swallow stdout EIO errors
  }
}
