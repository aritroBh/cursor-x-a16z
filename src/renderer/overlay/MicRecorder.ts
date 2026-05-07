export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private mimeType = 'audio/webm'
  private startedAt = 0
  isRecording = false

  private chooseMimeType(): string | undefined {
    if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined

    for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm']) {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType
    }

    return undefined
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }

  async start(): Promise<void> {
    console.log('[MIC] start requested')

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not available in this browser context.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('[MIC] permission granted')

    const mimeType = this.chooseMimeType()
    const options = mimeType ? { mimeType } : undefined

    this.chunks = []
    this.stream = stream
    try {
      this.mediaRecorder = new MediaRecorder(stream, options)
    } catch (error) {
      this.stopTracks()
      throw error
    }
    this.mimeType = this.mediaRecorder.mimeType || mimeType || 'audio/webm'
    this.mediaRecorder.ondataavailable = (e) => {
      console.log('[MIC] data chunk received', { size: e.data.size })
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.onerror = (event) => {
      console.error('[MIC] recorder error', event)
    }
    this.mediaRecorder.start(250)
    this.startedAt = Date.now()
    this.isRecording = true
  }

  async stop(): Promise<ArrayBuffer> {
    console.log('[MIC] stop requested')

    const recorder = this.mediaRecorder
    if (!recorder) {
      this.isRecording = false
      this.stopTracks()
      return new ArrayBuffer(0)
    }

    const elapsedMs = Date.now() - this.startedAt
    if (elapsedMs < 300) {
      await new Promise((resolve) => window.setTimeout(resolve, 300 - elapsedMs))
    }

    return new Promise((resolve) => {
      const finish = async () => {
        const blob = new Blob(this.chunks, { type: this.mimeType })
        console.log('[MIC] final blob size', { size: blob.size })
        const buffer = await blob.arrayBuffer()
        this.isRecording = false
        this.mediaRecorder = null
        this.chunks = []
        this.stopTracks()
        resolve(buffer)
      }

      recorder.onstop = finish

      if (recorder.state === 'inactive') {
        void finish()
        return
      }

      try {
        recorder.requestData()
      } catch (error) {
        console.warn('[MIC] requestData failed before stop', error)
      }

      recorder.stop()
    })
  }
}
