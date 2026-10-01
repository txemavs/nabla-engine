/** Two seconds of looping white noise. One buffer can feed several voices. */
export function loopingNoise(context: AudioContext): AudioBufferSourceNode {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.start()
  return source
}

/** A gain that starts silent and feeds the speakers. */
export function silentOutput(context: AudioContext): GainNode {
  const output = context.createGain()
  output.gain.value = 0
  output.connect(context.destination)
  return output
}
