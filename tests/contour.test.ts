import { describe, expect, it } from 'vitest'
import {
  circle,
  contourBounds,
  contourToPathData,
  denormalizeContour,
  flatten,
  moveNode,
  normalizeContour,
  roundedPolygon,
} from '../src/contour'

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]

describe('contour primitives', () => {
  it('sharp polygon keeps one node per corner', () => {
    const c = roundedPolygon(square, 0)
    expect(c).toHaveLength(4)
    expect(c[1].hIn).toEqual(c[1].p)
  })

  it('rounded corner splits into two tangent nodes', () => {
    const c = roundedPolygon(square, 2)
    expect(c).toHaveLength(8)
    const b = contourBounds(c)
    expect(b.minX).toBeCloseTo(0)
    expect(b.minY).toBeCloseTo(0)
    expect(b.maxX).toBeCloseTo(10)
    expect(b.maxY).toBeCloseTo(10)
  })

  it('oversized radius clamps to half the edge and merges meeting nodes', () => {
    // two left corners each take half of the 10 mm edge -> semicircle end
    const c = roundedPolygon(square, [5, 0, 0, 5])
    expect(c.every((n) => Number.isFinite(n.p.x) && Number.isFinite(n.p.y))).toBe(true)
    const ys = c.filter((n) => Math.abs(n.p.x) < 1e-6).map((n) => n.p.y)
    expect(ys).toHaveLength(1) // single merged node at the tip
    expect(ys[0]).toBeCloseTo(5)
  })

  it('radius 50 on a 10 mm square stays inside its bounds', () => {
    const b = contourBounds(roundedPolygon(square, 50))
    expect(b.minX).toBeGreaterThanOrEqual(-1e-9)
    expect(b.maxX).toBeLessThanOrEqual(10 + 1e-9)
  })

  it('circle flattens to points on the radius', () => {
    for (const p of flatten(circle(5, 5, 3, true))) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(3, 1)
  })

  it('path data is closed cubic', () => {
    expect(contourToPathData(roundedPolygon(square, 0))).toMatch(/^M0 0 C.*Z$/)
  })

  it('normalize/denormalize round-trip', () => {
    const c = roundedPolygon(square, 2)
    expect(denormalizeContour(normalizeContour(c, 10, 10), 10, 10)[3].p.x).toBeCloseTo(c[3].p.x)
  })

  it('moving an anchor carries its handles', () => {
    const c = moveNode(roundedPolygon(square, 2), 0, 'p', { x: 1, y: 1 })
    const orig = roundedPolygon(square, 2)[0]
    expect(c[0].hOut.x - c[0].p.x).toBeCloseTo(orig.hOut.x - orig.p.x)
  })
})
