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

  const inBox = (d: { width: number; height: number }, c: ReturnType<typeof buildOutline>) => {
    const b = contourBounds(c)
    for (const v of [b.minX, b.minY, b.maxX, b.maxY]) expect(Number.isFinite(v)).toBe(true)
    expect(b.minX).toBeCloseTo(0, 6)
    expect(b.minY).toBeCloseTo(0, 6)
    expect(b.maxX).toBeCloseTo(d.width, 6)
    expect(b.maxY).toBeCloseTo(d.height, 6)
  }
  it('clip is capped at the width so a tall narrow rectangle stays in its box', () => {
    const d = normalizeDesign({ ...gift, width: 12.7, height: 200, shape: { kind: 'rectangle', end: 'clipped', clip: 90, rounding: 0 } })
    expect(d.shape).toMatchObject({ clip: 12.7 })
    inBox(d, buildOutline(d))
  })
  it.each(['square', 'clipped', 'rounded'] as const)('tall narrow wavy (%s end) with a huge clip stays in its box', (end) => {
    const d = normalizeDesign({ ...gift, width: 12.7, height: 200, shape: { kind: 'wavy', end, clip: 90, waves: 4, waveHeight: 3 } })
    const c = buildOutline(d)
    for (const n of c) for (const q of [n.p, n.hIn, n.hOut]) expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true)
    inBox(d, c)
    // Wave nodes march left to right along the top edge: never backwards.
    const top = c.filter((n) => n.p.y < d.height / 4 && n.p.y > 1e-6)
    for (const n of top) expect(n.hOut.x).toBeGreaterThanOrEqual(n.hIn.x)
  })
  describe('wavy', () => {
    const wavy = PRESETS.find((p) => p.shape.kind === 'wavy')!
    const make = (shape: object) => normalizeDesign({ ...wavy, shape: { ...wavy.shape, ...shape } })
    const topPts = (d: typeof wavy) => flatten(buildOutline(d)).filter((p) => p.y < d.height / 2)
    it('clipped end has a tip and waves start after the clip', () => {
      const d = make({ end: 'clipped', clip: 12.7 })
      inBox(d, buildOutline(d))
      const pts = flatten(buildOutline(d))
      expect(pts.some((p) => Math.abs(p.x) < 1e-6 && Math.abs(p.y - 12.7) < 1e-6)).toBe(true)
      expect(Math.max(...topPts(d).filter((p) => p.x > 12.7 + 1 && p.x < d.width - 1).map((p) => p.y))).toBeCloseTo(3, 1)
    })
    it('rounded end is a semicircle', () => {
      const d = make({ end: 'rounded' })
      inBox(d, buildOutline(d))
      for (const p of flatten(buildOutline(d)).filter((p) => p.x < 19.05 - 0.01))
        expect(Math.hypot(p.x - 19.05, p.y - 19.05)).toBeCloseTo(19.05, 1)
    })
    it('waves = 3 puts three dips on each long edge', () => {
      const d = make({ waves: 3 })
      const c = buildOutline(d)
      expect(c).toHaveLength(4 + 2 * (2 * 3 - 1))
      const dips = c.filter((n) => Math.abs(n.p.y - 3) < 1e-6).map((n) => +n.p.x.toFixed(3))
      const half = d.width / 6
      expect(dips).toEqual([1, 3, 5].map((k) => +(k * half).toFixed(3)))
    })
    it('bottom edge mirrors the top', () => {
      const d = make({})
      const bottom = flatten(buildOutline(d)).filter((p) => p.y > d.height / 2 && p.x > 1 && p.x < d.width - 1)
      expect(Math.min(...bottom.map((p) => p.y))).toBeCloseTo(d.height - 3, 1)
    })
  })
  it.each(['Star', 'Seal', 'Hexagon'])('rounded %s preset fills its box', (name) => {
    const d = PRESETS.find((p) => p.name === name)!
    const b = contourBounds(buildOutline(d))
    expect(Math.abs(b.minX)).toBeLessThan(0.01)
    expect(Math.abs(b.minY)).toBeLessThan(0.01)
    expect(Math.abs(b.maxX - d.width)).toBeLessThan(0.01)
    expect(Math.abs(b.maxY - d.height)).toBeLessThan(0.01)
  })
  it('a point edit past the size limit scales the outline to the declared size', () => {
    const base = { ...PRESETS[1], shape: { ...PRESETS[1].shape, rounding: 0 } as any }
    const d = { ...base, points: normalizeContour(buildOutline(base), base.width, base.height) }
    const next = applyPointEdit(d, moveNode(buildOutline(d), 1, 'p', { x: 381, y: 0 }))
    expect(next.width).toBe(304.8)
    const b = contourBounds(buildOutline(next))
    expect(b.minX).toBeCloseTo(0)
    expect(b.maxX).toBeCloseTo(304.8)
    expect(b.maxY).toBeCloseTo(next.height)
  })
})
