import ClipperLib from 'clipper-lib'
import { flatten, type Pt } from './contour'
import { MIN_WALL_MM, type Design } from './design'
import { fitCurve, type Cubic } from './fit'
import { holeCenter } from './hole'
import { buildOutline } from './shapes'

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double'

/** mm. `weight` is the number of closely spaced passes, since a deboss tip has one width. */
export interface BorderSettings {
  inset: number
  style: BorderStyle
  weight: 1 | 2 | 3
}

/** One stroke of the border: smooth cubics, closed when it goes all the way round. */
export interface BorderPath {
  segs: Cubic[]
  closed: boolean
}

/** Distance between passes of one line (mm). */
export const PASS_SPACING = 0.5
/** Space between the two lines of a double border, from the last pass of one to the first of the other (mm). */
export const DOUBLE_GAP = 1.5
/** Dash and dot lengths (mm), stretched a little so each run ends on a full dash. */
export const DASH = { on: 3, off: 2 }
export const DOT = { on: 0.3, off: 1.7 }

// Clipper works in integers: micrometres.
const SCALE = 1000
// How far the smoothed border may stray from the exact inset (mm).
const FIT_TOL = 0.02
// A turn sharper than this is kept as a corner rather than smoothed (radians).
const CORNER = (25 * Math.PI) / 180
// Points closer than this are merged before smoothing (mm), so rounding noise doesn't read as corners.
const MIN_STEP = 0.02

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** The outline (a closed polyline) moved inward by `inset`; empty if that leaves nothing. */
function insetLoops(outline: Pt[], inset: number): Pt[][] {
  const co = new ClipperLib.ClipperOffset(2, 0.005 * SCALE)
  co.AddPaths([outline.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))], ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const out: { X: number; Y: number }[][] = []
  co.Execute(out, -inset * SCALE)
  return out.map((path) => path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE })))
}

/** Where segment a→b crosses the circle, as parameters strictly inside (0, 1). */
function crossings(a: Pt, b: Pt, c: Pt, r: number): number[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const fx = a.x - c.x
  const fy = a.y - c.y
  const A = dx * dx + dy * dy
  const B = 2 * (fx * dx + fy * dy)
  const C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C
  if (A === 0 || disc <= 0) return []
  const s = Math.sqrt(disc)
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter((t) => t > 1e-9 && t < 1 - 1e-9)
}

/** The parts of a closed loop outside the circle: the whole loop if it never enters it. */
function outsideCircle(loop: Pt[], c: Pt, r: number): { pts: Pt[]; closed: boolean }[] {
  const inside = (p: Pt) => dist(p, c) < r
  const runs: Pt[][] = []
  let cur: Pt[] | null = null
  let touched = false
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    const ts = [0, ...crossings(a, b, c, r), 1]
    if (ts.length > 2) touched = true
    for (let k = 0; k + 1 < ts.length; k++) {
      const mid = lerp(a, b, (ts[k] + ts[k + 1]) / 2)
      if (inside(mid)) {
        touched = true
        if (cur) runs.push(cur)
        cur = null
      } else {
        if (!cur) cur = [lerp(a, b, ts[k])]
        cur.push(lerp(a, b, ts[k + 1]))
      }
    }
  }
  if (!touched) return [{ pts: loop, closed: true }]
  if (cur) {
    // The last run carries on round the seam into the first one.
    if (runs.length && !inside(loop[0])) runs[0] = [...cur, ...runs[0].slice(1)]
    else runs.push(cur)
  }
  return runs.map((pts) => ({ pts, closed: false }))
}

function lengths(pts: Pt[], closed: boolean): number[] {
  const acc = [0]
  const n = closed ? pts.length + 1 : pts.length
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i % pts.length]))
  return acc
}

/** The stretch of a polyline between two distances along it. */
function between(pts: Pt[], acc: number[], s0: number, s1: number): Pt[] {
  const at = (s: number): { p: Pt; i: number } => {
    let i = 1
    while (i < acc.length - 1 && acc[i] < s) i++
    const seg = acc[i] - acc[i - 1] || 1
    return { p: lerp(pts[i - 1], pts[i % pts.length], (s - acc[i - 1]) / seg), i }
  }
  const a = at(s0)
  const b = at(s1)
  const out = [a.p]
  for (let i = a.i; i < b.i; i++) out.push(pts[i % pts.length])
  out.push(b.p)
  return out
}

/** Cut a run into dashes, spaced evenly so it starts and ends on a full dash. */
function dashes(run: { pts: Pt[]; closed: boolean }, pattern: { on: number; off: number }): Pt[][] {
  const acc = lengths(run.pts, run.closed)
  const L = acc[acc.length - 1]
  const { on, off } = pattern
  const count = Math.max(1, Math.round(run.closed ? L / (on + off) : (L + off) / (on + off)))
  const s = run.closed ? L / (count * (on + off)) : L / (count * on + (count - 1) * off)
  const out: Pt[][] = []
  for (let k = 0; k < count; k++) {
    const start = k * (on + off) * s
    out.push(between(run.pts, acc, start, Math.min(L, start + on * s)))
  }
  return out
}

/** Drop points too close to the one before (and, for a loop, to the first). */
function thin(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = []
  for (const p of pts) if (!out.length || dist(p, out[out.length - 1]) >= MIN_STEP) out.push(p)
  if (!closed && out.length && dist(out[out.length - 1], pts[pts.length - 1]) > 0) out[out.length - 1] = pts[pts.length - 1]
  while (closed && out.length > 2 && dist(out[out.length - 1], out[0]) < MIN_STEP) out.pop()
  return out
}

function turn(a: Pt, b: Pt, c: Pt): number {
  const t1 = Math.atan2(b.y - a.y, b.x - a.x)
  const t2 = Math.atan2(c.y - b.y, c.x - b.x)
  return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)))
}

/** Smooth a polyline into cubics, keeping sharp corners as corners. */
function smooth(raw: Pt[], closed: boolean): BorderPath | null {
  const pts = thin(raw, closed)
  if (pts.length < 2) return null
  const n = pts.length
  const corner = (i: number) => (closed || (i > 0 && i < n - 1)) && turn(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]) > CORNER
  const corners = pts.map((_, i) => i).filter(corner)
  if (!closed) {
    const cuts = [0, ...corners, n - 1]
    const segs: Cubic[] = []
    for (let k = 0; k + 1 < cuts.length; k++) segs.push(...fitCurve(pts.slice(cuts[k], cuts[k + 1] + 1), FIT_TOL))
    return { segs, closed: false }
  }
  if (!corners.length) {
    // A smooth loop: fit it from a point back to itself with the same tangent both ends.
    const t = { x: pts[1].x - pts[n - 1].x, y: pts[1].y - pts[n - 1].y }
    const l = Math.hypot(t.x, t.y) || 1
    const tan = { x: t.x / l, y: t.y / l }
    return { segs: fitCurve([...pts, pts[0]], FIT_TOL, tan, { x: -tan.x, y: -tan.y }), closed: true }
  }
  // Start at a corner and fit corner to corner, round to the start again.
  const start = corners[0]
  const loop = [...pts.slice(start), ...pts.slice(0, start), pts[start]]
  const cuts = [...corners.map((i) => (i - start + n) % n), n]
  const segs: Cubic[] = []
  for (let k = 0; k + 1 < cuts.length; k++) segs.push(...fitCurve(loop.slice(cuts[k], cuts[k + 1] + 1), FIT_TOL))
  return { segs, closed: true }
}

/** Distances from the edge of every pass of every line, outermost first. */
export function passInsets(b: BorderSettings): number[] {
  const lines = b.style === 'double' ? 2 : 1
  const out: number[] = []
  for (let l = 0; l < lines; l++)
    for (let k = 0; k < b.weight; k++) out.push(b.inset + l * ((b.weight - 1) * PASS_SPACING + DOUBLE_GAP) + k * PASS_SPACING)
  return out
}

/**
 * The deboss border for a design: the outline inset by `inset` (smooth where the
 * outline is curved), drawn in the chosen style and number of passes, and
 * broken around the hole so nothing comes within the minimum wall of it.
 * `collapsed` is true when the inset leaves no room for a border at all.
 */
export function borderPaths(d: Design, b: BorderSettings): { paths: BorderPath[]; collapsed: boolean } {
  const outline = flatten(buildOutline(d), 32)
  const hole = holeCenter(d)
  const clear = d.hole.diameter / 2 + MIN_WALL_MM
  const paths: BorderPath[] = []
  const insets = passInsets(b)
  for (const [i, inset] of insets.entries()) {
    const loops = insetLoops(outline, inset)
    if (!loops.length) {
      if (i === 0) return { paths: [], collapsed: true }
      continue
    }
    for (const loop of loops)
      for (const run of outsideCircle(loop, hole, clear)) {
        const pieces =
          b.style === 'dashed' || b.style === 'dotted'
            ? dashes(run, b.style === 'dashed' ? DASH : DOT).map((pts) => ({ pts, closed: false }))
            : [run]
        for (const piece of pieces) {
          const path = smooth(piece.pts, piece.closed)
          if (path && path.segs.length) paths.push(path)
        }
      }
  }
  return { paths, collapsed: false }
}

function num(v: number): string {
  const n = Number(v.toFixed(3))
  return String(Object.is(n, -0) ? 0 : n)
}

/** SVG path data for border strokes, one subpath each. */
export function borderPathData(paths: BorderPath[]): string {
  return paths
    .map((p) => {
      const pt = (q: Pt) => `${num(q.x)} ${num(q.y)}`
      let s = `M${pt(p.segs[0][0])}`
      for (const c of p.segs) s += ` C${pt(c[1])} ${pt(c[2])} ${pt(c[3])}`
      return p.closed ? `${s} Z` : s
    })
    .join(' ')
}
