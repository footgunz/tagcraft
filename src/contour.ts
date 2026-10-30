export interface Pt {
  x: number
  y: number
}

/** Absolute coordinates; a sharp corner has hIn and hOut equal to p. */
export interface BezierNode {
  p: Pt
  hIn: Pt
  hOut: Pt
}

/** Closed; segment i runs nodes[i].p -> nodes[i].hOut -> nodes[i+1].hIn -> nodes[i+1].p. */
export type Contour = BezierNode[]

export const KAPPA = 0.5522847498

const MERGE_EPS = 1e-6

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const len = (a: Pt): number => Math.hypot(a.x, a.y)

const sharp = (p: Pt): BezierNode => ({ p, hIn: { ...p }, hOut: { ...p } })

/**
 * Rounds the corners of a closed polygon. `radius` may be a per-corner array
 * indexed by input point order. Tangent lengths are clamped to half of each
 * adjacent edge, and nodes that end up coincident are merged.
 */
export function roundedPolygon(points: Pt[], radius: number | number[]): Contour {
  const n = points.length
  const nodes: BezierNode[] = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i + n - 1) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const r = Array.isArray(radius) ? (radius[i] ?? 0) : radius
    const e1 = sub(p0, p1)
    const e2 = sub(p2, p1)
    const l1 = len(e1)
    const l2 = len(e2)
    if (r <= 0 || l1 < MERGE_EPS || l2 < MERGE_EPS) {
      nodes.push(sharp(p1))
      continue
    }
    const a = scale(e1, 1 / l1)
    const b = scale(e2, 1 / l2)
    const cos = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))
    const theta = Math.acos(cos) // interior angle
    const phi = Math.PI - theta // turn angle
    if (phi < 1e-9 || theta < 1e-9) {
      nodes.push(sharp(p1)) // collinear or degenerate spike
      continue
    }
    const tanHalf = Math.tan(theta / 2)
    const t = Math.min(r / tanHalf, l1 / 2, l2 / 2)
    const rEff = t * tanHalf
    const h = (4 / 3) * Math.tan(phi / 4) * rEff
    const s = add(p1, scale(a, t))
    const e = add(p1, scale(b, t))
    nodes.push({ p: s, hIn: { ...s }, hOut: sub(s, scale(a, h)) })
    nodes.push({ p: e, hIn: sub(e, scale(b, h)), hOut: { ...e } })
  }
  return mergeClose(nodes)
}

function mergeClose(nodes: BezierNode[]): Contour {
  const out: BezierNode[] = []
  for (const node of nodes) {
    const last = out[out.length - 1]
    if (last && len(sub(last.p, node.p)) < MERGE_EPS) {
      out[out.length - 1] = { p: last.p, hIn: last.hIn, hOut: node.hOut }
    } else {
      out.push(node)
    }
  }
  while (out.length > 1 && len(sub(out[out.length - 1].p, out[0].p)) < MERGE_EPS) {
    const last = out.pop() as BezierNode
    out[0] = { p: last.p, hIn: last.hIn, hOut: out[0].hOut }
  }
  return out
}

/** Four nodes, starting at the top. `clockwise` is as seen with y pointing down. */
export function circle(cx: number, cy: number, r: number, clockwise: boolean): Contour {
  const k = KAPPA * r
  const spec: [Pt, Pt][] = clockwise
    ? [
        [{ x: cx, y: cy - r }, { x: 1, y: 0 }],
        [{ x: cx + r, y: cy }, { x: 0, y: 1 }],
        [{ x: cx, y: cy + r }, { x: -1, y: 0 }],
        [{ x: cx - r, y: cy }, { x: 0, y: -1 }],
      ]
    : [
        [{ x: cx, y: cy - r }, { x: -1, y: 0 }],
        [{ x: cx - r, y: cy }, { x: 0, y: 1 }],
        [{ x: cx, y: cy + r }, { x: 1, y: 0 }],
        [{ x: cx + r, y: cy }, { x: 0, y: -1 }],
      ]
  return spec.map(([p, d]) => ({ p, hIn: sub(p, scale(d, k)), hOut: add(p, scale(d, k)) }))
}

export function contourToPathData(c: Contour, digits = 3): string {
  if (c.length === 0) return ''
  const f = (v: number): string => {
    const s = v.toFixed(digits)
    const num = Number(s)
    return String(Object.is(num, -0) ? 0 : num)
  }
  const pt = (p: Pt): string => `${f(p.x)} ${f(p.y)}`
  let d = `M${pt(c[0].p)}`
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    d += ` C${pt(a.hOut)} ${pt(b.hIn)} ${pt(b.p)}`
  }
  return `${d} Z`
}

export function flatten(c: Contour, segmentsPerCurve = 16): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    for (let s = 0; s < segmentsPerCurve; s++) {
      const t = s / segmentsPerCurve
      const u = 1 - t
      const w0 = u * u * u
      const w1 = 3 * u * u * t
      const w2 = 3 * u * t * t
      const w3 = t * t * t
      pts.push({
        x: w0 * a.p.x + w1 * a.hOut.x + w2 * b.hIn.x + w3 * b.p.x,
        y: w0 * a.p.y + w1 * a.hOut.y + w2 * b.hIn.y + w3 * b.p.y,
      })
    }
  }
  return pts
}

export function contourBounds(c: Contour): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of flatten(c)) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function mapContour(c: Contour, f: (p: Pt) => Pt): Contour {
  return c.map((n) => ({ p: f(n.p), hIn: f(n.hIn), hOut: f(n.hOut) }))
}

export function normalizeContour(c: Contour, w: number, h: number): Contour {
  return mapContour(c, (p) => ({ x: p.x / w, y: p.y / h }))
}

export function denormalizeContour(c: Contour, w: number, h: number): Contour {
  return mapContour(c, (p) => ({ x: p.x * w, y: p.y * h }))
}

/** Returns a new contour. Moving `p` translates both handles with it. */
export function moveNode(c: Contour, index: number, part: 'p' | 'hIn' | 'hOut', to: Pt): Contour {
  return c.map((n, i) => {
    if (i !== index) return n
    if (part === 'p') {
      const d = sub(to, n.p)
      return { p: { ...to }, hIn: add(n.hIn, d), hOut: add(n.hOut, d) }
    }
    return { ...n, [part]: { ...to } }
  })
}
