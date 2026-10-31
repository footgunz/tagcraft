import { describe, expect, it } from 'vitest'
import { DASH, DOT, borderPathData, borderPaths, passInsets, type BorderPath, type BorderSettings } from '../src/border'
import { flatten, normalizeContour, type Pt } from '../src/contour'
import { MIN_WALL_MM, normalizeDesign, PRESETS, type Design } from '../src/design'
import { bezierPoint } from '../src/fit'
import { holeCenter } from '../src/hole'
import { buildOutline } from '../src/shapes'

const solid: BorderSettings = { inset: 3.175, style: 'solid', weight: 1 }
const gift = PRESETS[0]
const circle = PRESETS.find((p) => p.name === 'Circle')!
const hexagon = PRESETS.find((p) => p.name === 'Hexagon')!

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function edgeDist(p: Pt, poly: Pt[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) best = Math.min(best, segDist(p, poly[i], poly[(i + 1) % poly.length]))
  return best
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

/** Points along each stroke. */
const samples = (path: BorderPath, n = 8) => path.segs.flatMap((c) => Array.from({ length: n + 1 }, (_, i) => bezierPoint(c, i / n)))

function strokeLength(path: BorderPath): number {
  const pts = samples(path, 16)
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

const outlineOf = (d: Design) => flatten(buildOutline(d), 64)

describe('borderPaths', () => {
  it('insets every preset by the chosen distance, inside the outline', () => {
    for (const d of PRESETS) {
      const { paths, collapsed } = borderPaths(d, solid)
      expect(collapsed).toBe(false)
      expect(paths.length).toBeGreaterThan(0)
      const outline = outlineOf(d)
      for (const p of paths.flatMap((x) => samples(x))) {
        expect(inside(p, outline)).toBe(true)
        expect(Math.abs(edgeDist(p, outline) - solid.inset)).toBeLessThan(0.06)
      }
    }
  })

  it('works on a point-edited outline', () => {
    const outline = buildOutline(gift)
    const moved = outline.map((n, i) => (i === 3 ? { p: { x: n.p.x + 6, y: n.p.y }, hIn: { x: n.hIn.x + 6, y: n.hIn.y }, hOut: { x: n.hOut.x + 6, y: n.hOut.y } } : n))
    const d = normalizeDesign({ ...gift, points: normalizeContour(moved, gift.width, gift.height) })
    const { paths } = borderPaths(d, solid)
    const poly = outlineOf(d)
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths.flatMap((x) => samples(x))) expect(Math.abs(edgeDist(p, poly) - solid.inset)).toBeLessThan(0.06)
  })

  it('breaks around the hole, keeping the minimum wall clear', () => {
    for (const d of PRESETS) {
      const c = holeCenter(d)
      const clear = d.hole.diameter / 2 + MIN_WALL_MM
      for (const p of borderPaths(d, solid).paths.flatMap((x) => samples(x))) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThan(clear - 0.03)
    }
    // On the gift tag the border passes close to the hole, so it's broken into an open stroke.
    const { paths } = borderPaths(gift, solid)
    expect(paths.some((p) => !p.closed)).toBe(true)
  })

  it('stays a closed loop when it never reaches the hole', () => {
    const { paths } = borderPaths(gift, { ...solid, inset: 1 })
    // With a small inset the border still meets the hole's clearance near the tip...
    expect(paths.length).toBeGreaterThan(0)
    // ...but moving the hole well inside keeps the loop whole.
    const far = normalizeDesign({ ...gift, hole: { diameter: 3, offset: 38 } })
    const whole = borderPaths(far, { ...solid, inset: 1 }).paths
    expect(whole).toHaveLength(1)
    expect(whole[0].closed).toBe(true)
  })

  it('adds closely spaced passes for weight, and a second line for double', () => {
    const close = (got: number[], want: number[]) => {
      expect(got).toHaveLength(want.length)
      got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9))
    }
    close(passInsets({ ...solid, weight: 3 }), [3.175, 3.675, 4.175])
    // The second line starts 1.5 mm after the first line's last pass.
    close(passInsets({ ...solid, style: 'double', weight: 2 }), [3.175, 3.675, 5.175, 5.675])
    for (const b of [
      { ...solid, weight: 3 as const },
      { ...solid, style: 'double' as const, weight: 2 as const },
    ]) {
      const insets = passInsets(b)
      const outline = outlineOf(gift)
      const { paths } = borderPaths(gift, b)
      // The gift tag's hole breaks each pass into one open stroke.
      expect(paths).toHaveLength(insets.length)
      const seen = new Set<number>()
      for (const path of paths) {
        const ds = samples(path).map((p) => edgeDist(p, outline))
        const match = insets.findIndex((i) => ds.every((d) => Math.abs(d - i) < 0.06))
        expect(match).toBeGreaterThanOrEqual(0)
        seen.add(match)
      }
      expect(seen.size).toBe(insets.length)
    }
  })

  it('cuts dashes and dots evenly, as separate strokes', () => {
    const solidLen = borderPaths(circle, solid).paths.reduce((s, p) => s + strokeLength(p), 0)
    for (const [style, pattern] of [
      ['dashed', DASH],
      ['dotted', DOT],
    ] as const) {
      const { paths } = borderPaths(circle, { ...solid, style })
      expect(paths.every((p) => !p.closed)).toBe(true)
      expect(paths.length).toBeGreaterThanOrEqual(Math.floor(solidLen / (pattern.on + pattern.off)) - 1)
      for (const p of paths) {
        const l = strokeLength(p)
        expect(l).toBeGreaterThan(pattern.on * 0.75)
        expect(l).toBeLessThan(pattern.on * 1.3)
      }
    }
  })

  it('reports a collapse when the inset leaves no room, and drops passes that run out', () => {
    expect(borderPaths(gift, { ...solid, inset: 25 })).toEqual({ paths: [], collapsed: true })
    // Half the gift tag's height is 19.05 mm: the first pass fits, the next ones don't.
    const { paths, collapsed } = borderPaths(gift, { ...solid, inset: 18.6, weight: 3 })
    expect(collapsed).toBe(false)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.length).toBeLessThan(3)
  })

  it('is smooth where the outline is curved, with few curves', () => {
    const far = normalizeDesign({ ...circle, hole: { diameter: 3, offset: 20 } })
    const [path] = borderPaths(far, solid).paths
    expect(path.closed).toBe(true)
    expect(path.segs.length).toBeLessThanOrEqual(16)
    const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x)
    for (let i = 0; i < path.segs.length; i++) {
      const a = path.segs[i]
      const b = path.segs[(i + 1) % path.segs.length]
      const diff = Math.abs(Math.atan2(Math.sin(angle(a[2], a[3]) - angle(b[0], b[1])), Math.cos(angle(a[2], a[3]) - angle(b[0], b[1]))))
      expect(diff).toBeLessThan((2 * Math.PI) / 180)
    }
  })

  it('keeps corners sharp where the inset makes them', () => {
    // The hexagon's corner rounding is smaller than the inset, so the inset's corners are sharp.
    const far = normalizeDesign({ ...hexagon, hole: { diameter: 3, offset: 25 } })
    const [path] = borderPaths(far, solid).paths
    const angle = (a: Pt, b: Pt) => Math.atan2(b.y - a.y, b.x - a.x)
    let sharp = 0
    for (let i = 0; i < path.segs.length; i++) {
      const a = path.segs[i]
      const b = path.segs[(i + 1) % path.segs.length]
      const diff = Math.abs(Math.atan2(Math.sin(angle(a[2], a[3]) - angle(b[0], b[1])), Math.cos(angle(a[2], a[3]) - angle(b[0], b[1]))))
      if (diff > (30 * Math.PI) / 180) sharp++
    }
    expect(sharp).toBe(6)
  })
})

describe('borderPathData', () => {
  it('writes one subpath per stroke, closing loops', () => {
    const far = normalizeDesign({ ...circle, hole: { diameter: 3, offset: 20 } })
    const closed = borderPathData(borderPaths(far, solid).paths)
    expect(closed.startsWith('M')).toBe(true)
    expect(closed).toContain('C')
    expect(closed.trim().endsWith('Z')).toBe(true)
    const dashed = borderPathData(borderPaths(circle, { ...solid, style: 'dashed' }).paths)
    expect(dashed).not.toContain('Z')
    expect(dashed.match(/M/g)!.length).toBeGreaterThan(10)
  })
})
