import { circle, flatten, type Contour, type Pt } from './contour'
import { MIN_WALL_MM, RANGES, normalizeDesign, type Design } from './design'
import { buildOutline, holeAxisOf } from './shapes'

const TOL = 1e-6
const STEP = 0.1
const MIN_DIAMETER = 1

function centerAt(d: Design, offset: number): Pt {
  return holeAxisOf(d.shape.kind) === 'horizontal'
    ? { x: offset, y: d.height / 2 }
    : { x: d.width / 2, y: offset }
}

export function holeCenter(d: Design): Pt {
  return centerAt(d, d.hole.offset)
}

function distToSegment(c: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2))
  return Math.hypot(c.x - (a.x + t * dx), c.y - (a.y + t * dy))
}

/** Signed distance from `c` to the polygon edges; negative when outside (even-odd). */
export function clearance(outline: Pt[], c: Pt): number {
  let min = Infinity
  let inside = false
  const n = outline.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = outline[j]
    const b = outline[i]
    min = Math.min(min, distToSegment(c, a, b))
    if (a.y > c.y !== b.y > c.y && c.x < ((b.x - a.x) * (c.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside ? min : -min
}

const needed = (diameter: number): number => diameter / 2 + MIN_WALL_MM - TOL

export function holeWallOk(d: Design): boolean {
  return clearance(flatten(buildOutline(d)), holeCenter(d)) >= needed(d.hole.diameter)
}

/** Keeps the hole inside the outline with the minimum wall, for both shape-built and edited outlines. */
export function clampHole(input: Design): { design: Design; adjusted: boolean } {
  // Bad numbers would never reach MIN_DIAMETER in the scan below.
  const h = input.hole
  const dia = Math.min(RANGES.diameter.max, Number.isFinite(h.diameter) ? h.diameter : MIN_DIAMETER)
  const off = Number.isFinite(h.offset) ? h.offset : 0
  const repaired = dia !== h.diameter || off !== h.offset
  const d = repaired ? { ...input, hole: { diameter: dia, offset: off } } : input
  const outline = flatten(buildOutline(d))
  if (clearance(outline, holeCenter(d)) >= needed(d.hole.diameter)) return { design: d, adjusted: repaired }

  const axisLen = holeAxisOf(d.shape.kind) === 'horizontal' ? d.width : d.height
  const steps = Math.floor(axisLen / STEP + 1e-9)
  // Clearance depends only on the offset, so compute it once for every candidate.
  const offsets: number[] = []
  const clear: number[] = []
  for (let i = 0; i <= steps; i++) {
    const o = Math.round(i * STEP * 10) / 10
    offsets.push(o)
    clear.push(clearance(outline, centerAt(d, o)))
  }

  const withHole = (diameter: number, offset: number): { design: Design; adjusted: boolean } => ({
    design: { ...d, hole: { diameter, offset } },
    adjusted: true,
  })

  // Scan from the requested diameter down to exactly MIN_DIAMETER (inclusive); a request below it is raised to it.
  for (let diameter = d.hole.diameter; ; diameter = Math.round((diameter - STEP) * 1000) / 1000) {
    const d0 = Math.max(diameter, MIN_DIAMETER)
    let best = -1
    for (let i = 0; i < offsets.length; i++) {
      if (clear[i] >= needed(d0) && (best < 0 || Math.abs(offsets[i] - d.hole.offset) < Math.abs(offsets[best] - d.hole.offset))) best = i
    }
    if (best >= 0) return withHole(d0, offsets[best])
    if (d0 === MIN_DIAMETER) break
  }

  // Nothing fits even at 1 mm: use the most open spot; the wall may still be violated here.
  let bestI = 0
  for (let i = 1; i < clear.length; i++) if (clear[i] > clear[bestI]) bestI = i
  return withHole(MIN_DIAMETER, offsets[bestI])
}

/**
 * Repairs a committed design and keeps the hole wall. `clamp: false` is for outline (node)
 * edits, which are never blocked: the hole stays put and the caller warns instead.
 */
export function settleDesign(next: unknown, { clamp = true }: { clamp?: boolean } = {}): { design: Design; adjusted: boolean } {
  const d = normalizeDesign(next)
  return clamp ? clampHole(d) : { design: d, adjusted: false }
}

export function holeContour(d: Design): Contour {
  const c = holeCenter(d)
  return circle(c.x, c.y, d.hole.diameter / 2, false)
}
