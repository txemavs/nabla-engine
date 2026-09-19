import { describe, expect, it } from 'vitest'
import {
  PHI,
  SKIN_H,
  SKIN_W,
  SKIN_D,
  roomSkinRects,
  roomSkinSize,
  roomSkinFaceCss,
  roomSkinTurn,
} from './roomSkin.js'

describe('roomSkin', () => {
  it('PHI is the golden ratio', () => {
    expect(PHI).toBeCloseTo((1 + Math.sqrt(5)) / 2, 10)
    expect(PHI).toBeCloseTo(1.618, 2)
  })

  it('SKIN dimensions follow φ progression', () => {
    expect(SKIN_W).toBeCloseTo(SKIN_H * PHI, 0)
    expect(SKIN_D).toBeCloseTo(SKIN_W * PHI, 0)
  })

  it('roomSkinRects covers 6 faces', () => {
    const rects = roomSkinRects()
    expect(Object.keys(rects)).toEqual(['left', 'back', 'floor', 'front', 'top', 'right'])
  })

  it('floor and top have depth × width', () => {
    const rects = roomSkinRects()
    expect(rects.floor.w).toBe(SKIN_D)
    expect(rects.floor.h).toBe(SKIN_W)
    expect(rects.top.w).toBe(SKIN_D)
    expect(rects.top.h).toBe(SKIN_W)
  })

  it('front and back have height × width', () => {
    const rects = roomSkinRects()
    expect(rects.front.w).toBe(SKIN_H)
    expect(rects.front.h).toBe(SKIN_W)
    expect(rects.back.w).toBe(SKIN_H)
    expect(rects.back.h).toBe(SKIN_W)
  })

  it('left and right have depth × height', () => {
    const rects = roomSkinRects()
    expect(rects.left.w).toBe(SKIN_D)
    expect(rects.left.h).toBe(SKIN_H)
    expect(rects.right.w).toBe(SKIN_D)
    expect(rects.right.h).toBe(SKIN_H)
  })

  it('roomSkinSize matches layout', () => {
    const size = roomSkinSize()
    expect(size.width).toBe(2 * SKIN_H + 2 * SKIN_D)
    expect(size.height).toBe(SKIN_W + 2 * SKIN_H)
  })

  it('roomSkinFaceCss returns valid CSS', () => {
    const css = roomSkinFaceCss('floor')
    expect(css.backgroundRepeat).toBe('no-repeat')
    expect(css.backgroundSize).toMatch(/%/)
    expect(css.backgroundPosition).toMatch(/%/)
  })

  it('roomSkinTurn returns rotation for floor/back/top', () => {
    expect(roomSkinTurn('floor')).toBe(90)
    expect(roomSkinTurn('back')).toBe(90)
    expect(roomSkinTurn('top')).toBe(90)
    expect(roomSkinTurn('front')).toBe(0)
    expect(roomSkinTurn('left')).toBe(0)
    expect(roomSkinTurn('right')).toBe(0)
  })
})
