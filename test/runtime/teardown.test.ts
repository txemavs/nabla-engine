import { expect, it } from 'vitest'
import { RuntimeTeardown } from '../../src/runtime/teardown.js'

it('releases in dependency order once, including reentrant disposal', () => {
  const events: string[] = []
  const owner = new RuntimeTeardown([
    () => {
      events.push('stop')
      owner.dispose()
    },
    () => events.push('abort'),
    () => events.push('scene'),
    () => events.push('renderer'),
    () => events.push('canvas'),
  ])
  owner.dispose()
  owner.dispose()
  expect(events).toEqual(['stop', 'abort', 'scene', 'renderer', 'canvas'])
})
it('finishes every release after failures and keeps the first error identity', () => {
  const first = new Error('scene'),
    events: string[] = []
  const owner = new RuntimeTeardown([
    () => {
      throw first
    },
    () => events.push('audio'),
    () => {
      throw new Error('renderer')
    },
    () => events.push('canvas'),
  ])
  expect(() => owner.dispose()).toThrow(first)
  expect(events).toEqual(['audio', 'canvas'])
  expect(() => owner.dispose()).not.toThrow()
})
it('does not close another runtime', () => {
  let a = 0,
    b = 0
  const first = new RuntimeTeardown([() => a++]),
    second = new RuntimeTeardown([() => b++])
  first.dispose()
  first.dispose()
  expect([a, b]).toEqual([1, 0])
  second.dispose()
  expect([a, b]).toEqual([1, 1])
})
