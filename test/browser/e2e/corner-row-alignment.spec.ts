import { expect, test } from '@playwright/test'

// The top-right row (+ CAM FOV QLTY casco clock) must stay one straight row: equal heights,
// one shared top, one constant gap, whatever mix of text, icon, popover and large buttons it has.
test('corner row buttons share height, top and gap', async ({ page }) => {
  await page.goto('/')
  const boxes = await page.evaluate(async (root) => {
    const style = await import(`/@fs${root}/src/runtime/interface-style.ts`)
    const corner = await import(`/@fs${root}/src/runtime/corner-buttons.ts`)
    document.body.replaceChildren()
    const tag = document.createElement('style')
    tag.textContent = style.defaultInterfaceStyles
    document.head.append(tag)
    const button = (text: string, extra = '') => {
      const el = document.createElement('button')
      el.innerHTML = text
      if (extra) el.classList.add(extra)
      return el
    }
    const popover = (text: string) => {
      const wrap = document.createElement('div')
      wrap.className = 'nabla-btn-popover'
      const b = button(text)
      b.classList.add('nabla-btn')
      const panel = document.createElement('div')
      panel.className = 'nabla-slider-panel'
      panel.hidden = true
      wrap.append(b, panel)
      return wrap
    }
    // Inserted out of order on purpose: the API must sort by explicit order.
    corner.addCornerButton('tr', button('12:34', 'nabla-btn--lg'), 60)
    corner.addCornerButton('tr', popover('FOV'), 30)
    corner.addCornerButton('tr', button('+'), 10)
    corner.addCornerButton('tr', button('casco'), 50)
    corner.addCornerButton(
      'tr',
      button('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'),
      20,
    )
    corner.addCornerButton('tr', popover('QLTY'), 40)
    const row = document.getElementById('nabla-corner-tr')!
    return [...row.children].map((child) => {
      const el = child.classList.contains('nabla-btn') ? child : child.querySelector('.nabla-btn')!
      const r = el.getBoundingClientRect()
      return { text: el.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    })
  }, process.cwd())
  expect(boxes.map((b) => b.text)).toEqual(['+', '', 'FOV', 'QLTY', 'casco', '12:34'])
  const height = boxes[0].bottom - boxes[0].top
  expect(height).toBeGreaterThan(10)
  const gap = boxes[1].left - boxes[0].right
  expect(gap).toBeGreaterThan(0)
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].top, `top of #${i}`).toBeCloseTo(boxes[0].top, 1)
    expect(boxes[i].bottom - boxes[i].top, `height of #${i}`).toBeCloseTo(height, 1)
    if (i > 0) expect(boxes[i].left - boxes[i - 1].right, `gap before #${i}`).toBeCloseTo(gap, 1)
  }
})
