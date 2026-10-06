/**
 * Bake the driver's «Espejos» values into a vehicle preset as its default mirror aim.
 *
 *   node scripts/bake-mirror-aim.mjs <preset id | preset.json> '<values>'
 *
 * `<values>` is the «Valores para fijarlo» JSON from Ajustes → Vehículos → Espejos (also logged in
 * the console), degrees per side: {"left":{"yaw":-2,"tilt":0},"right":{"yaw":-1.5,"tilt":0.5}}.
 * They are ADDED to the preset's `vehicle.mirrorAim` (yaw + outward, tilt + up), so baking twice
 * moves the glass twice: after baking, press «Restablecer espejos» (or clear the saved choice) so
 * the sliders read 0 on top of the new aim. Works for any preset with cockpit mirrors (S3 `car`,
 * `a3`, `white-truck`, …). Only the preset JSON changes; GLBs are untouched.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as prettier from 'prettier'

const [target, raw] = process.argv.slice(2)
if (!target || !raw) {
  console.error("usage: node scripts/bake-mirror-aim.mjs <preset id | preset.json> '<values json>'")
  process.exit(2)
}

function presetFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return presetFiles(file)
    return entry.name.endsWith('.json') ? [file] : []
  })
}

const file = target.endsWith('.json')
  ? target
  : presetFiles('assets/library').find((candidate) => {
      try {
        const json = JSON.parse(fs.readFileSync(candidate, 'utf8'))
        return json.id === target && json.vehicle
      } catch {
        return false
      }
    })
if (!file) throw new Error(`No vehicle preset with id ${target} under assets/library`)

const values = JSON.parse(raw)
if (!values || typeof values !== 'object' || Array.isArray(values))
  throw new Error('Values must be a JSON object keyed by side')
const preset = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!preset.vehicle) throw new Error(`${file} is not a vehicle preset`)

const round = (n) => Math.round(n * 100) / 100
const aim = structuredClone(preset.vehicle.mirrorAim ?? {})
for (const [side, angle] of Object.entries(values)) {
  const yaw = Number(angle?.yaw ?? 0)
  const tilt = Number(angle?.tilt ?? 0)
  if (!Number.isFinite(yaw) || !Number.isFinite(tilt)) throw new Error(`Bad angle for ${side}`)
  const next = {
    yaw: round((aim[side]?.yaw ?? 0) + yaw),
    tilt: round((aim[side]?.tilt ?? 0) + tilt),
  }
  if (Math.abs(next.yaw) > 30 || Math.abs(next.tilt) > 20)
    throw new Error(`${side} aim out of range (yaw ±30°, tilt ±20°): ${JSON.stringify(next)}`)
  if (next.yaw === 0 && next.tilt === 0) delete aim[side]
  else aim[side] = next
}

// Keep the key next to mirrorTilt so the preset stays readable.
const vehicle = {}
for (const [key, value] of Object.entries(preset.vehicle)) {
  if (key === 'mirrorAim') continue
  vehicle[key] = value
  if (key === 'mirrorTilt' && Object.keys(aim).length) vehicle.mirrorAim = aim
}
if (!('mirrorAim' in vehicle) && Object.keys(aim).length) vehicle.mirrorAim = aim
preset.vehicle = vehicle

const options = (await prettier.resolveConfig(file)) ?? {}
const text = await prettier.format(JSON.stringify(preset, null, 2), { ...options, filepath: file })
fs.writeFileSync(file, text)
console.log(`${file}: vehicle.mirrorAim = ${JSON.stringify(aim)}`)
console.log('Press «Restablecer espejos» in the game so the sliders start from 0 on the new aim.')
