/** Check installed public exports without creating a browser or renderer. */
import assert from 'node:assert/strict'
import { GameplayCoordinator, GameRuntime as LegacyCoordinator } from '@nabla/engine/runtime/core'
import {
  GameplayCoordinator as FullCoordinator,
  GameRuntime as FullLegacy,
} from '@nabla/engine/runtime'
import { BrowserGameRuntime, GameRuntime as LegacyBrowser } from '@nabla/engine/runtime/browser'
assert.equal(GameplayCoordinator, LegacyCoordinator)
assert.equal(GameplayCoordinator, FullCoordinator)
assert.equal(GameplayCoordinator, FullLegacy)
assert.equal(BrowserGameRuntime, LegacyBrowser)
assert.notEqual(GameplayCoordinator, BrowserGameRuntime)
const coordinator = new GameplayCoordinator()
assert(coordinator instanceof LegacyCoordinator)
coordinator.dispose()
assert.equal(typeof globalThis.document, 'undefined')
console.log(
  'Named runtimes retain exact constructor identities through public compatibility aliases',
)
