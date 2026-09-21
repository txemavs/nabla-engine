/** Rebuild the elevation fixture after download; see docs/real-world.md. */
import fs from 'node:fs'
import * as Lerc from 'lerc'
await Lerc.load()
for (const [input, output] of [
  ['/tmp/irun-terrain.lerc', '/tmp/irun-height.json'],
  ['/tmp/irun-terrain-south.lerc', '/tmp/irun-height-south.json'],
]) {
  const b = fs.readFileSync(input),
    d = Lerc.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  fs.writeFileSync(
    output,
    JSON.stringify({ width: d.width, height: d.height, pixels: Array.from(d.pixels[0]) }),
  )
}
