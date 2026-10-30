import { describe, expect, it } from 'vitest'
import { PRESETS, normalizeDesign } from './design'
import { switchKind } from './panel'
import { naturalAspect } from './shapes'

describe('switchKind', () => {
  it('rectangle to polygon locks proportions and yields a regular shape', () => {
    const d = normalizeDesign(switchKind(PRESETS[0], 'polygon'))
    expect(d.lockProportions).toBe(true)
    expect(d.shape.kind).toBe('polygon')
    expect(d.width).toBe(PRESETS[0].width)
    expect(d.hole).toEqual(PRESETS[0].hole)
    expect(d.height).toBeCloseTo(d.width * naturalAspect(d.shape), 6)
  })
  it('rectangle to oval is not locked and keeps height', () => {
    const d = normalizeDesign(switchKind(PRESETS[0], 'oval'))
    expect(d.lockProportions).toBe(false)
    expect(d.height).toBe(PRESETS[0].height)
  })
})
