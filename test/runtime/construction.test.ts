import { expect, it } from 'vitest'
import { RuntimeConstruction } from '../../src/runtime/construction.js'

it('rolls back completed acquisitions in reverse order exactly once', () => {
  const scope = new RuntimeConstruction(),
    released: number[] = []
  scope.defer(() => released.push(1))
  scope.defer(() => released.push(2))
  scope.rollback()
  scope.rollback()
  expect(released).toEqual([2, 1])
})

it('continues releasing after a disposer fails', () => {
  const scope = new RuntimeConstruction(),
    released: number[] = []
  scope.defer(() => released.push(1))
  scope.defer(() => {
    throw new Error('cleanup')
  })
  scope.defer(() => released.push(3))
  expect(() => scope.rollback()).not.toThrow()
  expect(released).toEqual([3, 1])
})

it('commits ownership without releasing or affecting another construction', () => {
  const committed = new RuntimeConstruction(),
    failed = new RuntimeConstruction()
  const released: string[] = []
  committed.defer(() => released.push('committed'))
  failed.defer(() => released.push('failed'))
  committed.commit()
  failed.rollback()
  committed.rollback()
  expect(released).toEqual(['failed'])
})
