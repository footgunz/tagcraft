import { describe, expect, it } from 'vitest'
import { contourBounds, flatten, moveNode, normalizeContour } from '../src/contour'
import { normalizeDesign, PRESETS } from '../src/design'
import { applyPointEdit, buildOutline, holeAxisOf } from '../src/shapes'

const gift = PRESETS[0]

describe('shapes', () => {
  it('gift tag outline is 76.2 x 38.1 with a flat clipped tip', () => {
    const b = contourBounds(buildOutline(gift))
    expect([b.minX, b.minY, b.maxX, b.maxY].map((v) => +v.toFixed(2))).toEqual([0, 0, 76.2, 38.1])
    const flat = flatten(buildOutline({ ...gift, shape: { ...gift.shape, rounding: 0 } as any }))
    expect(flat.some((p) => p.x === 0 && Math.abs(p.y - 12.7) < 1e-6)).toBe(true)
  })
  it('clip >= h/2 makes a single tip node', () => {
    const d = normalizeDesign({ ...gift, shape: { kind: 'rectangle', end: 'clipped', clip: 50, rounding: 0 } })
    expect(buildOutline(d).filter((n) => Math.abs(n.p.x) < 1e-6)).toHaveLength(1)
  })
  it('rounded end is a semicircle', () => {
    const d = normalizeDesign({ ...gift, shape: { kind: 'rectangle', end: 'rounded', clip: 0, rounding: 0 } })
    for (const p of flatten(buildOutline(d)).filter((p) => p.x < 19.05 - 0.01))
      expect(Math.hypot(p.x - 19.05, p.y - 19.05)).toBeCloseTo(19.05, 1)
  })
  it.each(['polygon', 'star'] as const)('%s fills its box exactly, point up', (kind) => {
    const d = PRESETS.find((p) => p.shape.kind === kind)!
    const b = contourBounds(buildOutline({ ...d, shape: { ...d.shape, rounding: 0 } as any }))
    expect(b.minY).toBeCloseTo(0)
    expect(b.maxX).toBeCloseTo(d.width)
    expect(b.maxY).toBeCloseTo(d.height)
    expect(holeAxisOf(kind)).toBe('vertical')
  })
  it('wavy stays within its box and dips by waveHeight', () => {
    const d = PRESETS.find((p) => p.shape.kind === 'wavy')!
    const pts = flatten(buildOutline(d))
    expect(Math.max(...pts.filter((p) => p.y < d.height / 2 && p.x > 1 && p.x < d.width - 1).map((p) => p.y))).toBeCloseTo(3, 1)
    expect(contourBounds(buildOutline(d)).maxY).toBeCloseTo(38.1)
  })
  it('circle is round', () => {
    const d = PRESETS.find((p) => p.name === 'Circle')!
    for (const p of flatten(buildOutline(d))) expect(Math.hypot(p.x - 25.4, p.y - 25.4)).toBeCloseTo(25.4, 1)
  })
  it('oval has straight sides and semicircular ends', () => {
    const d = PRESETS.find((p) => p.name === 'Oval')!
    const pts = flatten(buildOutline(d))
    expect(pts.some((p) => Math.abs(p.y) < 1e-6 && p.x > 30 && p.x < 46)).toBe(true)
    for (const p of pts.filter((p) => p.x < 19.05 - 0.01)) expect(Math.hypot(p.x - 19.05, p.y - 19.05)).toBeCloseTo(19.05, 1)
  })
  it('seal has 72 corners filling its box', () => {
    const d = PRESETS.find((p) => p.name === 'Seal')!
    const sharp = buildOutline({ ...d, shape: { ...d.shape, rounding: 0 } as any })
    expect(sharp).toHaveLength(72)
    expect(contourBounds(sharp).maxX).toBeCloseTo(d.width)
  })
  it('edited points scale with width and height', () => {
    const pts = normalizeContour(buildOutline(gift), gift.width, gift.height)
    const b = contourBounds(buildOutline({ ...gift, width: 100, points: pts }))
    expect(b.maxX).toBeCloseTo(100)
  })
  it('dragging a node outside the box grows the tag', () => {
    const base = { ...PRESETS[1], shape: { ...PRESETS[1].shape, rounding: 0 } as any }
    const d = { ...base, points: normalizeContour(buildOutline(base), base.width, base.height) }
    const mm = moveNode(buildOutline(d), 1, 'p', { x: 90, y: 0 })
    const next = applyPointEdit(d, mm)
    expect(next.width).toBeCloseTo(90)
    expect(contourBounds(buildOutline(next)).maxX).toBeCloseTo(90)
    expect(contourBounds(buildOutline(next)).minX).toBeCloseTo(0)
  })
})
