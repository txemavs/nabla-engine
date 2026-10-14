/** Short, quiet feedback shared by the panel and HUD. */
export class XRUiClick {
  private clickAudio?: AudioContext
  play(): void {
    try {
      const audio = (this.clickAudio ??= new AudioContext())
      void audio.resume().catch(() => {})
      const oscillator = audio.createOscillator(),
        gain = audio.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(950, audio.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(350, audio.currentTime + 0.035)
      gain.gain.setValueAtTime(0.06, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.04)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + 0.045)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
      }
    } catch {
      /* Audio may be unavailable until the browser grants user activation. */
    }
  }

  dispose(): void {
    void this.clickAudio?.close().catch(() => {})
  }
}
