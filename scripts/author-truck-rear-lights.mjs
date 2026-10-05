/** Author emissive rear lenses and remove rear flood lighting from stock truck assets. */
import fs from 'node:fs'
import { readGlbDocument } from './lib/vehicle-rig.mjs'

for (const name of ['tractor.modern', 'trailer.anchored']) {
  const file = `assets/library/trucks/white-truck/assets/${name}.glb`
  const bytes = fs.readFileSync(file)
  const doc = readGlbDocument(bytes)
  // The trailer instances share one mesh/material set. Give each rear cluster its
  // own bindings so a left indicator never changes the right-hand lens.
  if (name === 'trailer.anchored') {
    for (const [nodeName, side] of [
      ['Freno I', 'L'],
      ['Freno I.001', 'R'],
    ]) {
      const node = doc.nodes.find((entry) => entry.name === nodeName)
      if (!node || node.extras?.vehicleLightSide) continue
      const mesh = structuredClone(doc.meshes[node.mesh])
      for (const primitive of mesh.primitives) {
        const material = structuredClone(doc.materials[primitive.material])
        material.name += `_${side}`
        material.extras = { ...material.extras, vehicleLightSide: side }
        primitive.material = doc.materials.length
        doc.materials.push(material)
      }
      node.mesh = doc.meshes.length
      doc.meshes.push(mesh)
      node.extras = { ...node.extras, vehicleLightSide: side }
    }
  }
  for (const node of doc.nodes) {
    if (/Rear_Light/.test(node.name)) node.extras.onIntensity = 0
    if (node.extras?.channel === 'Indicator') node.extras.onIntensity = 0
    if (node.extras?.channel === 'LowBeam') {
      node.extras.onIntensity = 1800
      node.extras.beamPattern = 'low-beam'
      const light =
        doc.extensions.KHR_lights_punctual.lights[node.extensions.KHR_lights_punctual.light]
      light.range = 55
      light.spot = { innerConeAngle: 0.35, outerConeAngle: 0.65 }
    }
  }
  for (const material of doc.materials) {
    const side = /_(L|R)$/.exec(material.name)?.[1]
    const beam = /^(LowBeam|HighBeam|Fog)_/.exec(material.name)?.[1]
    if (beam) material.extras = { ...material.extras, vehicleLightChannel: beam }
    const channel = /^Tail_stop/i.test(material.name)
      ? 'Tail_Stop'
      : /^Reverse|^Headlamp/.test(material.name)
        ? 'Reverse'
        : /^Indicator/.test(material.name)
          ? side
            ? 'Indicator'
            : 'Marker'
          : undefined
    if (!channel) continue
    material.extras = {
      ...material.extras,
      vehicleLightChannel: channel,
      ...(side ? { vehicleLightSide: side } : {}),
      ...(channel === 'Tail_Stop' ? { vehicleLightPreserveHue: true } : {}),
    }
    material.emissiveFactor =
      channel === 'Tail_Stop'
        ? [1, 0.001, 0.0005]
        : channel === 'Reverse'
          ? [1, 0.95, 0.87]
          : [1, 0.19, 0.005]
    material.extensions = {
      ...material.extensions,
      KHR_materials_emissive_strength: { emissiveStrength: channel === 'Tail_Stop' ? 0.3 : 1 },
    }
    if (channel === 'Tail_Stop') {
      material.pbrMetallicRoughness = {
        ...material.pbrMetallicRoughness,
        baseColorFactor: [0.22, 0.0002, 0.0001, 1],
        metallicFactor: 0,
        roughnessFactor: 0.8,
      }
    }
  }
  doc.extensionsUsed = [
    ...new Set([...(doc.extensionsUsed ?? []), 'KHR_materials_emissive_strength']),
  ]
  const json = Buffer.from(JSON.stringify(doc))
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)])
  const tail = bytes.subarray(20 + bytes.readUInt32LE(12))
  const header = Buffer.from(bytes.subarray(0, 20))
  header.writeUInt32LE(20 + padded.length + tail.length, 8)
  header.writeUInt32LE(padded.length, 12)
  fs.writeFileSync(file, Buffer.concat([header, padded, tail]))
}
