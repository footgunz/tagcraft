import {
  KAPPA,
  contourBounds,
  denormalizeContour,
  mapContour,
  normalizeContour,
  roundedPolygon,
  type BezierNode,
  type Contour,
  type Pt,
} from './contour'
import { RANGES, type Design, type ShapeSettings } from './design'

const EPS = 1e-6
/** Control-handle length of a cosine half-wave, as a fraction of its length. */
const WAVE_HANDLE = 0.3642

export function holeAxisOf(kind: ShapeSettings['kind']): 'horizontal' | 'vertical' {
  return kind === 'polygon' || kind === 'star' ? 'vertical' : 'horizontal'
}

/** Unit vertices (point up, y down), before scaling to the box. */
function unitVertices(shape: Extract<ShapeSettings, { kind: 'polygon' | 'star' }>): Pt[] {
  const count = shape.kind === 'polygon' ? shape.sides : shape.points * 2
  const pts: Pt[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
    const r = shape.kind === 'star' && i % 2 === 1 ? shape.depth : 1
    pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
  }
  return pts
}

function extent(pts: Pt[]) {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

/** height / width of the regular unit polygon or star; 1 for an ellipse. */
export function naturalAspect(shape: ShapeSettings): number {
  if (shape.kind === 'ellipse') return 1
  if (shape.kind !== 'polygon' && shape.kind !== 'star') return NaN
  const e = extent(unitVertices(shape))
  return e.h / e.w
}

function rectanglePoints(w: number, h: number, end: 'square' | 'clipped' | 'rounded', clip: number): Pt[] {
  const c = Math.min(clip, h / 2, w)
  if (end === 'clipped' && c > EPS) {
    return [
      { x: c, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: c, y: h },
      { x: 0, y: h - c },
      { x: 0, y: c },
    ]
  }
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

function rectangle(
  w: number,
  h: number,
  end: 'square' | 'clipped' | 'rounded',
  clip: number,
  rounding: number,
): Contour {
  const pts = rectanglePoints(w, h, end, clip)
  if (end === 'rounded') return roundedPolygon(pts, [h / 2, rounding, rounding, h / 2])
  return roundedPolygon(pts, rounding)
}

function wavy(d: Design, s: Extract<ShapeSettings, { kind: 'wavy' }>): Contour {
  const { width: w, height: h } = d
  const base = rectangle(w, h, s.end, s.clip, 0)
  const topStart = base.reduce((best, n, i) => (Math.abs(n.p.y) < EPS && (best < 0 || n.p.x < base[best].p.x) ? i : best), -1)
  const xL = base[topStart].p.x
  const half = (w - xL) / (2 * s.waves)
  // No room left for waves (the clip spans the whole width): keep the plain outline.
  if (half < EPS) return base
  const hl = WAVE_HANDLE * half
  const A = s.waveHeight
  const out: BezierNode[] = base.map((n) => ({ p: { ...n.p }, hIn: { ...n.hIn }, hOut: { ...n.hOut } }))
  // Interior wave nodes for the top edge (left to right) and bottom edge (right to left).
  const topNodes: BezierNode[] = []
  const bottomNodes: BezierNode[] = []
  for (let k = 1; k < 2 * s.waves; k++) {
    const x = xL + k * half
    const dy = k % 2 === 1 ? A : 0
    topNodes.push({ p: { x, y: dy }, hIn: { x: x - hl, y: dy }, hOut: { x: x + hl, y: dy } })
  }
  for (let k = 2 * s.waves - 1; k >= 1; k--) {
    const x = xL + k * half
    const y = h - (k % 2 === 1 ? A : 0)
    bottomNodes.push({ p: { x, y }, hIn: { x: x + hl, y }, hOut: { x: x - hl, y } })
  }
  const topEnd = (topStart + 1) % out.length
  // The base outline runs clockwise: top-left, top-right, bottom-right, bottom-left.
  const shift = (p: Pt, dx: number): Pt => ({ x: p.x + dx, y: p.y })
  out[topStart].hOut = shift(out[topStart].p, hl)
  out[topEnd].hIn = shift(out[topEnd].p, -hl)
  const rightBottom = (topEnd + 1) % out.length
  const leftBottom = (rightBottom + 1) % out.length
  out[rightBottom].hOut = shift(out[rightBottom].p, -hl)
  out[leftBottom].hIn = shift(out[leftBottom].p, hl)
  const result: BezierNode[] = []
  for (let i = 0; i < out.length; i++) {
    result.push(out[i])
    if (i === topStart) result.push(...topNodes)
    if (i === rightBottom) result.push(...bottomNodes)
  }
  return result
}

/**
 * Rounds the polygon so the rounded outline (not the sharp vertices) fills [0,w]x[0,h].
 * Rounding pulls the outline in from the tips, so the vertices are re-stretched a few
 * times; each corner stays a circular arc of the requested radius.
 */
function roundedToFill(verts: Pt[], w: number, h: number, rounding: number): Contour {
  const e = extent(verts)
  let pts = verts.map((p) => ({ x: ((p.x - e.minX) / e.w) * w, y: ((p.y - e.minY) / e.h) * h }))
  let out = roundedPolygon(pts, rounding)
  for (let i = 0; i < 6 && rounding > 0; i++) {
    const b = contourBounds(out)
    if (Math.max(Math.abs(b.minX), Math.abs(b.minY), Math.abs(b.maxX - w), Math.abs(b.maxY - h)) < 1e-4) break
    const sx = w / (b.maxX - b.minX)
    const sy = h / (b.maxY - b.minY)
    pts = pts.map((p) => ({ x: (p.x - b.minX) * sx, y: (p.y - b.minY) * sy }))
    out = roundedPolygon(pts, rounding)
  }
  return out
}

export function buildOutline(d: Design): Contour {
  if (d.points) return denormalizeContour(d.points, d.width, d.height)
  const { width: w, height: h } = d
  const s = d.shape
  switch (s.kind) {
    case 'rectangle':
      return rectangle(w, h, s.end, s.clip, s.rounding)
    case 'wavy':
      return wavy(d, s)
    case 'polygon':
    case 'star':
      return roundedToFill(unitVertices(s), w, h, s.rounding)
    case 'ellipse': {
      const kx = (KAPPA * w) / 2
      const ky = (KAPPA * h) / 2
      const cx = w / 2
      const cy = h / 2
      return [
        { p: { x: cx, y: 0 }, hIn: { x: cx - kx, y: 0 }, hOut: { x: cx + kx, y: 0 } },
        { p: { x: w, y: cy }, hIn: { x: w, y: cy - ky }, hOut: { x: w, y: cy + ky } },
        { p: { x: cx, y: h }, hIn: { x: cx + kx, y: h }, hOut: { x: cx - kx, y: h } },
        { p: { x: 0, y: cy }, hIn: { x: 0, y: cy + ky }, hOut: { x: 0, y: cy - ky } },
      ]
    }
    case 'oval': {
      const r = Math.min(w, h) / 2
      return roundedPolygon(rectanglePoints(w, h, 'square', 0), r)
    }
  }
}

const clampRange = (v: number, key: 'width' | 'height') => Math.min(RANGES[key].max, Math.max(RANGES[key].min, v))

/**
 * Stores an edited outline (mm) on the design. The contour is shifted so its bounds start at 0,0,
 * width/height follow its bounds (scaled into the allowed size range), and the points are
 * normalized against those new bounds.
 */
export function applyPointEdit(d: Design, next: Contour): Design {
  const b = contourBounds(next)
  const rawW = b.maxX - b.minX
  const rawH = b.maxY - b.minY
  const width = clampRange(rawW, 'width')
  const height = clampRange(rawH, 'height')
  // Scale into the clamped size so the declared size always matches the outline.
  const sx = rawW > EPS ? width / rawW : 1
  const sy = rawH > EPS ? height / rawH : 1
  const shifted = mapContour(next, (p) => ({ x: (p.x - b.minX) * sx, y: (p.y - b.minY) * sy }))
  // Proportions can't stay locked to a base shape once the outline is hand-edited.
  return { ...d, width, height, lockProportions: false, points: normalizeContour(shifted, width, height) }
}
