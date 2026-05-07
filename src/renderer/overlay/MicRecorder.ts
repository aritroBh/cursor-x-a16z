export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: BlobPart[] = []
  isRecording = false

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start()
    this.isRecording = true
  }

  stop(): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) { resolve(new ArrayBuffer(0)); return }
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        const buffer = await blob.arrayBuffer()
        this.isRecording = false
        resolve(buffer)
      }
      this.mediaRecorder.stop()
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop())
    })
  }
}
