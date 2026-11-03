// A short square-wave fanfare for a finished crate.
export function playJingle(): void {
  const audio = new AudioContext()
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5]
  notes.forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.09
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.05, start)
    gain.gain.setValueAtTime(0, start + 0.08)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.09)
  })
  setTimeout(() => void audio.close(), 1000)
}
