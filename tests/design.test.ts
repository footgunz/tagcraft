import { describe, expect, it } from 'vitest'
import { normalizeDesign, PRESETS } from '../src/design'
import { naturalAspect } from '../src/shapes'

describe('design', () => {
  it('gift tag preset values', () => {
    expect(PRESETS[0]).toMatchObject({
      name: 'Gift tag',
      width: 76.2,
      height: 38.1,
      shape: { kind: 'rectangle', end: 'clipped', clip: 12.7, rounding: 1.27 },
      hole: { diameter: 6.35, offset: 8.89 },
      points: null,
    })
  })
  it('repairs garbage', () => {
    const d = normalizeDesign({ width: 'abc', height: -5, shape: { kind: 'blob' }, hole: { diameter: NaN }, points: [1] })
    expect(Number.isFinite(d.width)).toBe(true)
    expect(d.height).toBeGreaterThanOrEqual(12.7)
    expect(d.shape.kind).toBe('rectangle')
    expect(d.points).toBeNull()
  })
  it('clamps huge values and rounds integers', () => {
    const d = normalizeDesign({ ...PRESETS[4], width: 1e9, shape: { kind: 'polygon', sides: 7.6, rounding: 1 } })
    expect(d.width).toBe(304.8)
    expect(d.shape).toMatchObject({ sides: 8 })
  })
  it('locked polygon height follows its natural aspect', () => {
    const d = normalizeDesign({ ...PRESETS[4], width: 50, height: 10 })
    expect(d.height).toBeCloseTo(50 * naturalAspect(d.shape))
  })
  it('has nine presets in order', () => {
    expect(PRESETS.map((p) => p.name)).toEqual(['Gift tag', 'Rectangle', 'Star', 'Wavy', 'Hexagon', 'Circle', 'Ellipse', 'Oval', 'Seal'])
  })
  it('normalizeDesign(undefined) is the gift tag', () => expect(normalizeDesign(undefined).name).toBe('Gift tag'))
})
