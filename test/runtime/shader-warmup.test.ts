import { expect, it, vi } from 'vitest'
import { Scene, PerspectiveCamera, MeshBasicMaterial, type WebGLRenderer } from 'three'
import { installShaderWarmup } from '../../src/render/shader-warmup.js'

function fixture(program: { program?: unknown; isReady: () => boolean }) {
  const properties = { currentProgram: program }
  const renderer = {
    compile: () => new Set([new MeshBasicMaterial()]),
    properties: { get: () => properties },
    getContext: () => ({ isContextLost: () => false }),
  } as unknown as WebGLRenderer
  installShaderWarmup(renderer)
  return { renderer, properties }
}

it('does not poll a destroyed GL program', async () => {
  const isReady = vi.fn(() => false)
  const { renderer } = fixture({ program: undefined, isReady })
  await renderer.compileAsync(new Scene(), new PerspectiveCamera())
  expect(isReady).not.toHaveBeenCalled()
})

it('waits for the requested program even when another render changes currentProgram', async () => {
  vi.useFakeTimers()
  try {
    const program = { program: {}, isReady: vi.fn(() => false) }
    const { renderer, properties } = fixture(program)
    const done = renderer.compileAsync(new Scene(), new PerspectiveCamera())
    properties.currentProgram = { program: {}, isReady: vi.fn(() => false) }
    program.isReady.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(10)
    await done
    expect(properties.currentProgram.isReady).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

it('waits beyond the former time limit until compilation actually finishes', async () => {
  vi.useFakeTimers()
  try {
    const program = { program: {}, isReady: vi.fn(() => false) }
    const { renderer } = fixture(program)
    let completed = false
    const done = renderer.compileAsync(new Scene(), new PerspectiveCamera()).then(() => {
      completed = true
    })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(completed).toBe(false)
    program.isReady.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(10)
    await done
    expect(completed).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})

it('stops querying a program destroyed during the wait', async () => {
  vi.useFakeTimers()
  try {
    const program: { program?: unknown; isReady: ReturnType<typeof vi.fn<() => boolean>> } = {
      program: {},
      isReady: vi.fn(() => false),
    }
    const { renderer } = fixture(program)
    const done = renderer.compileAsync(new Scene(), new PerspectiveCamera())
    program.program = undefined
    await vi.advanceTimersByTimeAsync(10)
    await done
    expect(program.isReady).toHaveBeenCalledTimes(1)
  } finally {
    vi.useRealTimers()
  }
})
