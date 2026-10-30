import { circle, flatten, type Contour, type Pt } from './contour'
import { MIN_WALL_MM, type Design } from './design'
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

export function clampHole(d: Design): { design: Design; adjusted: boolean } {
  if (d.points) return { design: d, adjusted: false }
  const outline = flatten(buildOutline(d))
  if (clearance(outline, holeCenter(d)) >= needed(d.hole.diameter)) return { design: d, adjusted: false }

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

  for (let diameter = d.hole.diameter; diameter >= MIN_DIAMETER - TOL; diameter = Math.round((diameter - STEP) * 1000) / 1000) {
    const d0 = Math.max(diameter, MIN_DIAMETER)
    let best = -1
    for (let i = 0; i < offsets.length; i++) {
      if (clear[i] >= needed(d0) && (best < 0 || Math.abs(offsets[i] - d.hole.offset) < Math.abs(offsets[best] - d.hole.offset))) best = i
    }
    if (best >= 0) return withHole(d0, offsets[best])
  }

  let bestI = 0
  for (let i = 1; i < clear.length; i++) if (clear[i] > clear[bestI]) bestI = i
  return withHole(MIN_DIAMETER, offsets[bestI])
}

export function holeContour(d: Design): Contour {
  const c = holeCenter(d)
  return circle(c.x, c.y, d.hole.diameter / 2, false)
}
