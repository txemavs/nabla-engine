import { test, expect } from '@playwright/test'
test('mobile weapon strip starts with equip and releases a captured trigger', async ({ page }) => {
  await page.route('**/mobile-weapon', r => r.fulfill({ contentType:'text/html', body:'<body></body>' }))
  await page.goto('/mobile-weapon')
  const result = await page.evaluate(async root => {
    const { mobileWeaponUI } = await import(`/@fs/${root}/game/ar-mobile-weapon.ts`)
    let equipped = 0
    const shots: boolean[] = []
    mobileWeaponUI(document.body, { equip: () => equipped++, reload() {}, fire: (down: boolean) => shots.push(down), move() {} })
    const buttons = [...document.querySelectorAll('button')]
    buttons[0].click()
    buttons[1].dispatchEvent(new PointerEvent('pointercancel'))
    return { first: buttons[0].title, equipped, shots, count: buttons.length }
  }, process.cwd())
  expect(result).toEqual({ first: 'Pistola', equipped: 1, shots: [false], count: 4 })
})
