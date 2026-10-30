import { describe, expect, it } from 'vitest'
import { normalizeContour } from '../src/contour'
import { PRESETS, normalizeDesign } from '../src/design'
import { clampHole, clearance, holeWallOk, settleDesign } from '../src/hole'
import { buildOutline } from '../src/shapes'

describe('hole', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('%s preset hole is valid', (_, p) => {
    expect(holeWallOk(p)).toBe(true)
  })
  it('gift tag default hole is valid and untouched', () => {
    expect(holeWallOk(PRESETS[0])).toBe(true)
    expect(clampHole(PRESETS[0])).toEqual({ design: PRESETS[0], adjusted: false })
  })
  it('hole dragged past the tip moves back in', () => {
    const { design, adjusted } = clampHole({ ...PRESETS[0], hole: { diameter: 6.35, offset: 0 } })
    expect(adjusted).toBe(true)
    expect(design.hole.diameter).toBe(6.35)
    expect(holeWallOk(design)).toBe(true)
    expect(design.hole.offset).toBeLessThan(12) // nearest valid spot, not the far end
  })
  it('hole too big for the height shrinks', () => {
    const { design } = clampHole({ ...PRESETS[0], hole: { diameter: 40, offset: 30 } })
    expect(design.hole.diameter).toBeLessThanOrEqual(38.1 - 2 * 3.175 + 1e-6)
    expect(holeWallOk(design)).toBe(true)
  })
  it('tiny deep star terminates with a 1 mm hole', () => {
    const star = normalizeDesign({ ...PRESETS[2], width: 12.7, shape: { kind: 'star', points: 12, depth: 0.2, rounding: 0 } })
    const { design, adjusted } = clampHole(star)
    expect(adjusted).toBe(true)
    expect(design.hole.diameter).toBe(1)
  })
  it('finds a 1 mm hole nearest the request when 1.05 mm does not fit', () => {
    const slim = { ...PRESETS[1], height: 7.37, shape: { kind: 'rectangle' as const, end: 'square' as const, clip: 0, rounding: 0 }, hole: { diameter: 6.35, offset: 0 } }
    const { design, adjusted } = clampHole(slim)
    expect(adjusted).toBe(true)
    expect(design.hole.diameter).toBe(1)
    expect(holeWallOk(design)).toBe(true)
    expect(design.hole.offset).toBeCloseTo(3.7)
  })
  const edited = (hole: { diameter: number; offset: number }) => ({
    ...PRESETS[0],
    hole,
    points: normalizeContour(buildOutline(PRESETS[0]), 76.2, 38.1),
  })
  it('a hole edit on an edited outline is clamped', () => {
    const { design, adjusted } = settleDesign(edited({ diameter: 6.35, offset: 0 }))
    expect(adjusted).toBe(true)
    expect(holeWallOk(design)).toBe(true)
    expect(design.points).not.toBeNull()
  })
  it('a node-edit commit leaves the hole and warns', () => {
    const d = edited({ diameter: 6.35, offset: 0 })
    const { design, adjusted } = settleDesign(d, { clamp: false })
    expect(adjusted).toBe(false)
    expect(design.hole).toEqual(d.hole)
    expect(holeWallOk(design)).toBe(false)
  })
  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['1e9', 1e9],
  ])('a %s diameter returns promptly with a valid hole', (_, diameter) => {
    const t = performance.now()
    const { design } = clampHole({ ...PRESETS[0], hole: { diameter, offset: 8.89 } })
    expect(performance.now() - t).toBeLessThan(1000)
    expect(Number.isFinite(design.hole.diameter)).toBe(true)
    expect(design.hole.diameter).toBeLessThanOrEqual(25.4)
    expect(holeWallOk(design)).toBe(true)
  })
  it('a non-finite offset becomes 0 before clamping', () => {
    const { design } = clampHole({ ...PRESETS[0], hole: { diameter: 6.35, offset: NaN } })
    expect(Number.isFinite(design.hole.offset)).toBe(true)
    expect(holeWallOk(design)).toBe(true)
    expect(design.hole.offset).toBeLessThan(12)
  })
  it('clearance is negative outside', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(clearance(sq, { x: 5, y: 5 })).toBeCloseTo(5)
    expect(clearance(sq, { x: -1, y: 5 })).toBeCloseTo(-1)
  })
})
