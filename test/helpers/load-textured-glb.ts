import { DataTexture, RGBAFormat } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Node geometry/material tests have no browser image decoder. Browser tests load the actual PNG. */
export function loadTexturedGlb(bytes: Uint8Array) {
  const loader = new GLTFLoader()
  loader.register(() => ({
    name: 'node-test-texture',
    loadTexture: () =>
      Promise.resolve(new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat)),
  }))
  return loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    '',
  )
}
