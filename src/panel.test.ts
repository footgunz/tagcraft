import { describe, expect, it } from 'vitest'
import { PRESETS, normalizeDesign } from './design'
import { settleDesign } from './hole'
import { isUnchangedPreset, presetEntries, sheetSummary, switchKind, versionLink } from './panel'
import { DEFAULT_SHEET } from './sheet'
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

describe('sheetSummary', () => {
  it('counts what fits, by orientation', () => {
    expect(sheetSummary(PRESETS[0], DEFAULT_SHEET)).toEqual({ text: '15 tags fit · 15 turned', fits: true })
  })
  it('says how many of the max a count cuts', () => {
    expect(sheetSummary(PRESETS[0], { ...DEFAULT_SHEET, count: 4 }).text).toBe('Cutting 4 of 15 · 4 turned')
  })
  it('names both orientations in a mixed layout', () => {
    const narrow = { ...DEFAULT_SHEET, size: 'custom' as const, customWidth: 80, customHeight: 279.4, margin: 0 }
    expect(sheetSummary(PRESETS[0], narrow).text).toBe('7 tags fit · 1 upright, 6 turned')
  })
  it('reports when nothing fits', () => {
    const tiny = { ...DEFAULT_SHEET, size: 'custom' as const, customWidth: 50, customHeight: 50 }
    expect(sheetSummary(PRESETS[0], tiny).fits).toBe(false)
  })
})

describe('isUnchangedPreset', () => {
  it('is true for every built-in preset as it loads', () => {
    for (const p of PRESETS) expect(isUnchangedPreset(settleDesign(p).design)).toBe(true)
  })
  it('is false once anything changes', () => {
    const gift = settleDesign(PRESETS[0]).design
    expect(isUnchangedPreset({ ...gift, width: gift.width + 1 })).toBe(false)
    expect(isUnchangedPreset({ ...gift, hole: { ...gift.hole, diameter: 5 } })).toBe(false)
    expect(isUnchangedPreset(settleDesign(switchKind(gift, 'oval')).design)).toBe(false)
  })
  it('is false for a saved copy under another name', () => {
    expect(isUnchangedPreset({ ...settleDesign(PRESETS[0]).design, name: 'Bag tag' })).toBe(false)
  })
})

describe('versionLink', () => {
  it('links a release tag to its release', () => {
    expect(versionLink('v0.0.4')).toEqual({ text: 'v0.0.4', href: 'https://github.com/footgunz/tagcraft/releases/tag/v0.0.4' })
  })
  it('shows other builds as plain text', () => {
    for (const v of ['v0.0.3-3-gbdac605', 'bdac605', 'dev']) expect(versionLink(v).href).toBeNull()
  })
})

describe('isUnchangedPreset with a border', () => {
  it('counts turning the border on as a change', () => {
    const gift = settleDesign(PRESETS[0]).design
    expect(isUnchangedPreset({ ...gift, border: { inset: 3.175, style: 'solid', weight: 1 } })).toBe(false)
  })
})

describe('isUnchangedPreset with text', () => {
  it('counts turning text on as a change', () => {
    const gift = settleDesign(PRESETS[0]).design
    expect(isUnchangedPreset({ ...gift, text: { content: 'Hi', font: 'Relief SingleLine', size: 5, lineSpacing: 1, align: 'center', box: { x: 20, y: 5, w: 40, h: 20 } } })).toBe(false)
  })
})
