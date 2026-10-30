import { flatten, type Pt } from './contour'
import type { Design } from './design'
import { buildOutline } from './shapes'

/** Clockwise turns. 90 and 270 take up height × width; 180 is the tag upside down. */
export type Rotation = 0 | 90 | 180 | 270

/**
 * Where tag-space point `q` lands when a w × h tag is turned by `rot` and its
 * bounding box's top-left is put at (x, y).
 */
export function orientPoint(w: number, h: number, rot: Rotation, x: number, y: number, q: Pt): Pt {
  switch (rot) {
    case 90:
      return { x: x + h - q.y, y: y + q.x }
    case 180:
      return { x: x + w - q.x, y: y + h - q.y }
    case 270:
      return { x: x + q.y, y: y + w - q.x }
    default:
      return { x: x + q.x, y: y + q.y }
  }
}

/** A nested placement, relative to the top-left of the usable area. */
export interface Nested {
  x: number
  y: number
  rotation: Rotation
}

// Profiles are measured in strips this wide (mm).
const RES = 0.25
// Extra clearance on top of the gap, for curves flattened to straight segments.
const SAFETY = 0.05
const EPS = 1e-6

/**
 * One orientation of the tag, measured in strips. `left`/`right` hold the
 * outline's extent in each horizontal strip (row-local y), `top`/`bottom` in
 * each vertical strip (x). The `*Pad` versions are pushed out by the gap, as a
 * true distance, so tags that are diagonal neighbours stay clear too; they
 * reach `off` strips past the tag on both sides, so index i + off of a padded
 * profile lines up with strip i.
 */
interface Profile {
  rot: Rotation
  w: number
  h: number
  left: Float64Array
  rightPad: Float64Array
  top: Float64Array
  bottomPad: Float64Array
  off: number
}

/**
 * Min and max of `v` over the outline in each strip of `u`. Each edge is clipped
 * to the strip, so every point of the outline in a strip is inside its range.
 */
function extents(pts: Pt[], u: 'x' | 'y', size: number): { lo: Float64Array; hi: Float64Array } {
  const v = u === 'x' ? 'y' : 'x'
  const n = Math.ceil(size / RES) + 1
  const lo = new Float64Array(n).fill(Infinity)
  const hi = new Float64Array(n).fill(-Infinity)
  const put = (bin: number, val: number) => {
    const b = Math.min(n - 1, Math.max(0, bin))
    if (val < lo[b]) lo[b] = val
    if (val > hi[b]) hi[b] = val
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const [a, b] = p[u] <= q[u] ? [p, q] : [q, p]
    const first = Math.floor(a[u] / RES)
    const last = Math.floor(b[u] / RES)
    if (first === last || b[u] - a[u] < EPS) {
      put(first, a[v])
      put(first, b[v])
      continue
    }
    const at = (t: number) => a[v] + ((b[v] - a[v]) * (t - a[u])) / (b[u] - a[u])
    for (let bin = first; bin <= last; bin++) {
      const t0 = Math.max(a[u], bin * RES)
      const t1 = Math.min(b[u], (bin + 1) * RES)
      put(bin, at(t0))
      put(bin, at(t1))
    }
  }
  return { lo, hi }
}

/** Strips a gap reaches past the tag on each side. */
const reachOf = (g: number) => Math.ceil(g / RES) + 1

/**
 * Push a max-profile out by `g`: the furthest a point within `g` of the outline
 * reaches, per strip, including strips up to a gap beyond the tag. Index
 * i + reachOf(g) of the result lines up with strip i of `hi`.
 */
function pad(hi: Float64Array, g: number): Float64Array {
  const off = reachOf(g)
  const out = new Float64Array(hi.length + 2 * off).fill(-Infinity)
  for (let i = 0; i < hi.length; i++) {
    if (hi[i] === -Infinity) continue
    for (let k = -off; k <= off; k++) {
      // Points in strips k apart can be as close as (|k| - 1) strips.
      const du = Math.max(0, Math.abs(k) - 1) * RES
      if (du > g) continue
      const val = hi[i] + Math.sqrt(Math.max(0, g * g - du * du))
      if (val > out[i + k + off]) out[i + k + off] = val
    }
  }
  return out
}

function profile(d: Design, rot: Rotation, g: number): Profile {
  const turned = rot === 90 || rot === 270
  const w = turned ? d.height : d.width
  const h = turned ? d.width : d.height
  const pts = flatten(buildOutline(d), 24).map((q) => orientPoint(d.width, d.height, rot, 0, 0, q))
  const rows = extents(pts, 'y', h)
  const cols = extents(pts, 'x', w)
  return { rot, w, h, left: rows.lo, rightPad: pad(rows.hi, g), top: cols.lo, bottomPad: pad(cols.hi, g), off: reachOf(g) }
}

const flip = (r: Rotation): Rotation => ((r + 180) % 360) as Rotation

/**
 * Lay out one pattern: rows of tags packed left to right, each tag slid left
 * until it's one gap from everything already in its row, then each row dropped
 * until it's one gap below everything placed so far.
 */
function pattern(
  shapes: Map<Rotation, Profile>,
  base: Rotation,
  altInRow: boolean,
  altRows: boolean,
  stagger: number,
  W: number,
  H: number,
): Nested[] {
  const out: Nested[] = []
  const sheetBins = Math.ceil(W / RES) + 2
  // Lowest padded bottom so far, per vertical strip of the sheet.
  const floor = new Float64Array(sheetBins).fill(-Infinity)
  for (let r = 0; ; r++) {
    const first = altRows && r % 2 === 1 ? flip(base) : base
    const seq = altInRow ? [first, flip(first)] : [first]
    // Row: furthest padded right edge so far, per horizontal strip of the row
    // (offset like the padded profiles; every tag in a row has the same height).
    const { h, off } = shapes.get(first)!
    const reach = new Float64Array(shapes.get(first)!.rightPad.length).fill(-Infinity)
    const row: { x: number; shape: Profile }[] = []
    const start = r % 2 === 1 ? stagger : 0
    for (let k = 0; ; k++) {
      const shape = shapes.get(seq[k % seq.length])!
      let x = start
      for (let i = 0; i < shape.left.length; i++)
        if (reach[i + off] > -Infinity && shape.left[i] < Infinity) x = Math.max(x, reach[i + off] - shape.left[i])
      if (x + shape.w > W + EPS) break
      row.push({ x, shape })
      for (let i = 0; i < shape.rightPad.length; i++) reach[i] = Math.max(reach[i], x + shape.rightPad[i])
    }
    if (!row.length) break
    // Drop the row until it clears the floor.
    let y = 0
    for (const { x, shape } of row)
      for (let j = 0; j < shape.top.length; j++) {
        if (shape.top[j] === Infinity) continue
        const b0 = Math.floor((x + j * RES) / RES)
        const b1 = Math.min(sheetBins - 1, Math.floor((x + (j + 1) * RES) / RES))
        for (let b = b0; b <= b1; b++) if (floor[b] > -Infinity) y = Math.max(y, floor[b] - shape.top[j])
      }
    if (y + h > H + EPS) break
    for (const { x, shape } of row) {
      out.push({ x, y, rotation: shape.rot })
      for (let j = 0; j < shape.bottomPad.length; j++) {
        if (shape.bottomPad[j] === -Infinity) continue
        const at = x + (j - shape.off) * RES
        const b0 = Math.max(0, Math.floor(at / RES))
        const b1 = Math.min(sheetBins - 1, Math.floor((at + RES) / RES))
        for (let b = b0; b <= b1; b++) floor[b] = Math.max(floor[b], y + shape.bottomPad[j])
      }
    }
  }
  return out
}

const profiles = new Map<string, Map<Rotation, Profile>>()

function profilesFor(d: Design, g: number): Map<Rotation, Profile> {
  const key = JSON.stringify([d, g])
  let p = profiles.get(key)
  if (!p) {
    p = new Map(([0, 90, 180, 270] as Rotation[]).map((r) => [r, profile(d, r, g + SAFETY)]))
    if (profiles.size > 8) profiles.clear()
    profiles.set(key, p)
  }
  return p
}

/**
 * The best shape-aware layout of the design in a W × H area with `g` between
 * tags. Tries upright and turned tags, alternate tags flipped 180° within a
 * row, every other row flipped, and offset rows; returns the one with the most
 * tags (ties go to the simpler pattern, tried first).
 */
export function nestedLayout(d: Design, W: number, H: number, g: number): Nested[] {
  if (W <= 0 || H <= 0) return []
  const shapes = profilesFor(d, g)
  let best: Nested[] = []
  for (const base of [0, 90] as Rotation[]) {
    const w = shapes.get(base)!.w
    if (w > W + EPS || shapes.get(base)!.h > H + EPS) continue
    for (const altInRow of [false, true])
      for (const altRows of [false, true])
        // Offsets for every other row: none, then fractions of a tag width.
        for (const f of [0, 0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
          const layout = pattern(shapes, base, altInRow, altRows, f * (w + g), W, H)
          if (layout.length > best.length) best = layout
        }
  }
  return best
}
