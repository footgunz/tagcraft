import { describe, expect, it } from 'vitest'
import { flatten, type Pt } from '../src/contour'
import { normalizeDesign, PRESETS, type Design } from '../src/design'
import { nestedLayout, orientPoint, type Rotation } from '../src/nest'
import { buildOutline } from '../src/shapes'
import { DEFAULT_SHEET, layoutSheet, sheetDimensions, type Placement, type Sheet } from '../src/sheet'
import { sheetTagPathData } from '../src/svg'

const preset = (name: string, more: Partial<Design> = {}) => normalizeDesign({ ...PRESETS.find((p) => p.name === name)!, ...more })
const triangle = normalizeDesign({ ...PRESETS[4], width: 25.4, shape: { kind: 'polygon', sides: 3, rounding: 1 } })
const usable = (s: Sheet) => {
  const { width, height } = sheetDimensions(s)
  return { W: width - 2 * s.margin, H: height - 2 * s.margin }
}

/** Outline of a placed tag on the sheet, as a closed polygon. */
function placed(d: Design, p: Placement): Pt[] {
  return flatten(buildOutline(d), 16).map((q) => orientPoint(d.width, d.height, p.rotation, p.x, p.y, q))
}

function segDist(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  const ptSeg = (p: Pt, s: Pt, e: Pt) => {
    const dx = e.x - s.x
    const dy = e.y - s.y
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(p.x - (s.x + t * dx), p.y - (s.y + t * dy))
  }
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b))
}

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Smallest distance between two outlines, or 0 if they overlap. */
function outlineDist(A: Pt[], B: Pt[], limit: number): number {
  if (inside(A[0], B) || inside(B[0], A)) return 0
  let best = Infinity
  for (let i = 0; i < A.length; i++) {
    const a = A[i]
    const b = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) {
      const c = B[j]
      const e = B[(j + 1) % B.length]
      if (Math.max(c.x, e.x) < Math.min(a.x, b.x) - limit || Math.min(c.x, e.x) > Math.max(a.x, b.x) + limit) continue
      if (Math.max(c.y, e.y) < Math.min(a.y, b.y) - limit || Math.min(c.y, e.y) > Math.max(a.y, b.y) + limit) continue
      best = Math.min(best, segDist(a, b, c, e))
    }
  }
  return best
}

const box = (poly: Pt[]) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  x1: Math.max(...poly.map((p) => p.x)),
  y1: Math.max(...poly.map((p) => p.y)),
})

/** Every tag inside the margin, and every pair of outlines at least `gap` apart. */
function expectClear(d: Design, s: Sheet, layout: Placement[]) {
  const { width, height } = sheetDimensions(s)
  const polys = layout.map((p) => placed(d, p))
  const boxes = polys.map(box)
  for (const b of boxes) {
    expect(b.x0).toBeGreaterThanOrEqual(s.margin - 1e-3)
    expect(b.y0).toBeGreaterThanOrEqual(s.margin - 1e-3)
    expect(b.x1).toBeLessThanOrEqual(width - s.margin + 1e-3)
    expect(b.y1).toBeLessThanOrEqual(height - s.margin + 1e-3)
  }
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (b.x0 > a.x1 + s.gap || a.x0 > b.x1 + s.gap || b.y0 > a.y1 + s.gap || a.y0 > b.y1 + s.gap) continue
      expect(outlineDist(polys[i], polys[j], s.gap)).toBeGreaterThanOrEqual(s.gap - 0.02)
    }
}

describe('orientPoint', () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 10 },
    { x: 0, y: 10 },
  ]
  it('keeps a w × h tag inside its slot in every rotation', () => {
    for (const r of [0, 90, 180, 270] as Rotation[]) {
      const [w, h] = r === 90 || r === 270 ? [10, 30] : [30, 10]
      const b = box(corners.map((q) => orientPoint(30, 10, r, 5, 7, q)))
      expect(b).toEqual({ x0: 5, y0: 7, x1: 5 + w, y1: 7 + h })
    }
  })
  it('turns clockwise', () => {
    // The top-left corner goes top-right, bottom-right, then bottom-left.
    expect(orientPoint(30, 10, 90, 0, 0, corners[0])).toEqual({ x: 10, y: 0 })
    expect(orientPoint(30, 10, 180, 0, 0, corners[0])).toEqual({ x: 30, y: 10 })
    expect(orientPoint(30, 10, 270, 0, 0, corners[0])).toEqual({ x: 0, y: 30 })
  })
})

describe('nestedLayout', () => {
  it('fits more stars, hexagons and triangles than any grid', () => {
    // Best bounding-box grids on Letter: 30, 56 and 70.
    expect(layoutSheet(preset('Star', { width: 38.1 }), DEFAULT_SHEET).length).toBeGreaterThanOrEqual(40)
    expect(layoutSheet(preset('Hexagon', { width: 25.4 }), DEFAULT_SHEET).length).toBeGreaterThanOrEqual(65)
    expect(layoutSheet(triangle, DEFAULT_SHEET).length).toBeGreaterThanOrEqual(112)
  })
  it('interlocks triangles by turning alternate ones the other way', () => {
    const rots = new Set(layoutSheet(triangle, DEFAULT_SHEET).map((p) => p.rotation))
    expect(rots).toEqual(new Set([90, 270]))
  })
  it('never beats a grid that fits exactly, so the grid is kept', () => {
    // 5 turned gift tags fill 8" exactly; nesting's safety margin loses one.
    const out = layoutSheet(PRESETS[0], DEFAULT_SHEET)
    expect(out).toHaveLength(15)
    expect(out.every((p) => p.rotation === 90)).toBe(true)
  })
  it('is empty when the tag is bigger than the area', () => {
    expect(nestedLayout(PRESETS[0], 50, 50, 3.175)).toEqual([])
  })
  // These check real outline distances across hundreds of tags: slow on CI runners.
  it('keeps every outline at least one gap apart and inside the margin', () => {
    const designs = [
      ...PRESETS,
      preset('Star', { width: 38.1 }),
      preset('Star', { width: 25.4 }),
      preset('Hexagon', { width: 25.4 }),
      preset('Circle', { width: 25.4 }),
      preset('Seal', { width: 25.4 }),
      triangle,
    ]
    for (const d of designs) {
      const { W, H } = usable(DEFAULT_SHEET)
      const nested = nestedLayout(d, W, H, DEFAULT_SHEET.gap).map((p) => ({ ...p, x: p.x + DEFAULT_SHEET.margin, y: p.y + DEFAULT_SHEET.margin }))
      expect(nested.length).toBeGreaterThan(0)
      expectClear(d, DEFAULT_SHEET, nested)
    }
  }, 30_000)
  it('every preset, nested or not, keeps a gap on Letter and A4', () => {
    for (const size of ['letter', 'a4'] as const) {
      const s = { ...DEFAULT_SHEET, size }
      for (const d of PRESETS) expectClear(d, s, layoutSheet(d, s))
    }
  }, 30_000)
  it('respects a wide gap and no gap', () => {
    for (const gap of [0, 12.7]) {
      const s = { ...DEFAULT_SHEET, gap }
      const d = preset('Star', { width: 38.1 })
      const { W, H } = usable(s)
      expectClear(d, s, nestedLayout(d, W, H, gap).map((p) => ({ ...p, x: p.x + s.margin, y: p.y + s.margin })))
    }
  }, 30_000)
})

describe('nested sheet export', () => {
  it('writes turned-both-ways tags into their slots', () => {
    const layout = layoutSheet(triangle, DEFAULT_SHEET)
    const paths = sheetTagPathData(triangle, DEFAULT_SHEET)
    expect(paths).toHaveLength(layout.length)
    layout.forEach((p, i) => {
      // On-curve points only: each subpath's start and each curve's end (control points can poke out).
      const pts = paths[i].split(/(?=[MC])/).map((seg) => seg.match(/-?\d+(\.\d+)?/g)!.map(Number).slice(-2))
      const xs = pts.map((q) => q[0])
      const ys = pts.map((q) => q[1])
      const [w, h] = p.rotation === 90 || p.rotation === 270 ? [triangle.height, triangle.width] : [triangle.width, triangle.height]
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(p.x - 0.01)
      expect(Math.max(...xs)).toBeLessThanOrEqual(p.x + w + 0.01)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(p.y - 0.01)
      expect(Math.max(...ys)).toBeLessThanOrEqual(p.y + h + 0.01)
    })
  })
})
