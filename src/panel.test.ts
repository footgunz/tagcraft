import { describe, expect, it } from 'vitest'
import { PRESETS, normalizeDesign } from './design'
import { presetEntries, switchKind } from './panel'
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

describe('presetEntries', () => {
  const saved = { ...PRESETS[0], name: 'Bag tag' }
  it('lists built-ins then saved, marking the active one by trimmed case-insensitive name', () => {
    const list = presetEntries([saved], { ...PRESETS[0], name: ' bag TAG ' })
    expect(list.map((e) => e.design.name)).toEqual([...PRESETS.map((p) => p.name), 'Bag tag'])
    expect(list.filter((e) => e.active).map((e) => e.design.name)).toEqual(['Bag tag'])
    expect(list.slice(0, PRESETS.length).every((e) => !e.saved)).toBe(true)
    expect(list[list.length - 1].saved).toBe(true)
  })
  it('drops saved entries that collide with a built-in name', () => {
    expect(presetEntries([{ ...saved, name: PRESETS[0].name }], PRESETS[0])).toHaveLength(PRESETS.length)
  })
})
