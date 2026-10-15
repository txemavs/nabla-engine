import { test, expect } from '@playwright/test'

test('online is opt-in, creates and lists games, and presents remote tracking', async ({ page }) => {
  const messages: Record<string, unknown>[] = []
  const place = { kind: 'room', label: 'Habitación', origin: [0, 0, 0], geography: null }
  const game = { id: 'room', host: 'local', name: 'Mi partida', count: 1, place }
  await page.route('**/online-test', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><body></body>',
  }))
  await page.routeWebSocket('**/online/ws', (socket) => {
    socket.send(JSON.stringify({ type: 'lobby', games: [game] }))
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      messages.push(message)
      if (message.type === 'create') {
        socket.send(JSON.stringify({ type: 'joined', game, playerId: 'local', spawn: [0, 0, 0] }))
        socket.send(JSON.stringify({ type: 'snapshot', gameId: 'room', tick: 1, members: [
          { id: 'remote', name: 'Quest', tracking: true,
            head: { position: [0, 1.7, -2], rotation: [0, 0, 0, 1] },
            left: null, right: null },
        ] }))
      } else if (message.type === 'leave') {
        socket.send(JSON.stringify({ type: 'left' }))
      }
    })
  })
  await page.goto('/online-test')
  await page.evaluate(async (root) => {
    const THREE = await import('/@fs/' + root + '/node_modules/three/build/three.module.js')
    const { OnlinePresence } = await import('/@fs/' + root + '/src/runtime/online-presence.ts')
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 1.7, 0)
    const xr = { active: false, visible: false, grabHands: [], calibrationScreen: null }
    const presence = new OnlinePresence({ scene, camera, xr })
    presence.update(performance.now())
    Object.assign(window, { onlineTest: { presence, scene } })
  }, process.cwd())
  expect(messages).toEqual([])
  await page.getByText('Online · partidas', { exact: true }).click()
  await expect(page.getByRole('button', { name: /Mi partida.*Unirse/ })).toBeVisible()
  await page.getByLabel('Tu nombre', { exact: true }).fill('PC')
  await page.getByLabel('Nombre de partida').fill('Mi partida')
  await page.getByRole('button', { name: 'Iniciar sesión online aquí', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('En partida: Mi partida')
  await expect.poll(() => messages.some((message) => message.type === 'create')).toBe(true)
  const result = await page.evaluate(() => {
    const { presence, scene } = (window as unknown as {
      onlineTest: { presence: { update(t: number): void }, scene: { children: { visible: boolean }[] } }
    }).onlineTest
    presence.update(performance.now())
    return { avatars: scene.children.length, visible: scene.children[0]?.visible }
  })
  expect(result).toEqual({ avatars: 1, visible: true })
  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Online')
  const remaining = await page.evaluate(() => {
    const { presence, scene } = (window as unknown as {
      onlineTest: { presence: { dispose(): void }, scene: { children: unknown[] } }
    }).onlineTest
    const count = scene.children.length
    presence.dispose()
    return count
  })
  expect(remaining).toBe(0)
  await expect(page.locator('[data-nabla-online]')).toHaveCount(0)
})
