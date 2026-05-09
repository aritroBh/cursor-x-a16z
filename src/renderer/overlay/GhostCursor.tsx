import React from 'react'

interface GhostCursorProps {
  isVisible: boolean
  mood?: string
}

export const GhostCursor: React.FC<GhostCursorProps> = () => {
  // Parked / hidden by default. Only visible in an explicit teaching mode.
  return null
}
