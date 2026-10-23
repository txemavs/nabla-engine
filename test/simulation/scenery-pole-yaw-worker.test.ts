import { expect, it } from 'vitest'
import { createEntity } from '../../src/entity/schema.js'
import {
  serveSimulation,
  type SimulationReply,
  type SimulationRequest,
} from '../../src/simulation/simulation-worker-host.js'

// Sign posts are yawed to their plate. The worker body must carry that yaw, or SceneryLayer
// (which undoes the rest yaw) turns every sign near the player back to north and swings its plate
// around the post.
it('worker scenery pole keeps the yaw it was created with', async () => {
  let listener: ((event: MessageEvent) => void) | undefined
  const replies = new Map<number, (reply: SimulationReply) => void>()
  serveSimulation({
    postMessage: (m) => replies.get((m as SimulationReply).id)?.(m as SimulationReply),
    addEventListener: (_t, l) => void (listener = l),
  })
  const send = (message: SimulationRequest) =>
    new Promise<SimulationReply>((resolve) => {
      replies.set(message.id, resolve)
      listener!({ data: message } as MessageEvent)
    })
  await send({
    id: 1,
    type: 'create',
    scene: { version: 1, name: 'Yawed pole', entities: [createEntity('spawn', 'spawn', [20, 1, 20])] },
    options: { playerMode: 'walk' },
    mirror: true,
  })
  const yaw = 1.2
  const reply = await send({
    id: 2,
    type: 'pole',
    pole: 0,
    op: 'create',
    args: [[0, 1.5, 0], 3, true, { yaw }],
  })
  expect(reply.ok).toBe(true)
  const rotation = reply.ok ? reply.reads!.poles[0]!.rotation : [0, 0, 0, 1]
  expect(rotation[1]).toBeCloseTo(Math.sin(yaw / 2), 5)
  expect(rotation[3]).toBeCloseTo(Math.cos(yaw / 2), 5)
  await send({ id: 3, type: 'dispose' })
})
