import type { Pt } from './contour'

/** A cubic bezier: start, two control points, end. */
export type Cubic = [Pt, Pt, Pt, Pt]

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y
const len = (a: Pt): number => Math.hypot(a.x, a.y)
const unit = (a: Pt): Pt => {
  const l = len(a)
  return l < 1e-12 ? { x: 0, y: 0 } : mul(a, 1 / l)
}

export function bezierPoint(b: Cubic, t: number): Pt {
  const s = 1 - t
  return {
    x: s * s * s * b[0].x + 3 * s * s * t * b[1].x + 3 * s * t * t * b[2].x + t * t * t * b[3].x,
    y: s * s * s * b[0].y + 3 * s * s * t * b[1].y + 3 * s * t * t * b[2].y + t * t * t * b[3].y,
  }
}

function derivative(b: Cubic, t: number): Pt {
  const s = 1 - t
  return add(add(mul(sub(b[1], b[0]), 3 * s * s), mul(sub(b[2], b[1]), 6 * s * t)), mul(sub(b[3], b[2]), 3 * t * t))
}

function second(b: Cubic, t: number): Pt {
  return add(mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)), mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t))
}

function chordParams(d: Pt[], first: number, last: number): number[] {
  const u = [0]
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + len(sub(d[i], d[i - 1])))
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

/** Least-squares cubic through d[first..last] with the given end tangents. */
function generate(d: Pt[], first: number, last: number, u: number[], t1: Pt, t2: Pt): Cubic {
  const p0 = d[first]
  const p3 = d[last]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < u.length; i++) {
    const t = u[i]
    const s = 1 - t
    const a1 = mul(t1, 3 * s * s * t)
    const a2 = mul(t2, 3 * s * t * t)
    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)
    const tmp = sub(d[first + i], add(mul(p0, s * s * s + 3 * s * s * t), mul(p3, 3 * s * t * t + t * t * t)))
    x0 += dot(a1, tmp)
    x1 += dot(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  const seg = len(sub(p3, p0))
  let al = det === 0 ? 0 : (x0 * c11 - c01 * x1) / det
  let ar = det === 0 ? 0 : (c00 * x1 - x0 * c01) / det
  // Degenerate or backwards handles: fall back to a third of the chord.
  if (al < 1e-6 * seg || ar < 1e-6 * seg) al = ar = seg / 3
  return [p0, add(p0, mul(t1, al)), add(p3, mul(t2, ar)), p3]
}

function maxError(d: Pt[], first: number, last: number, b: Cubic, u: number[]): { err: number; at: number } {
  let err = 0
  let at = Math.floor((first + last) / 2)
  for (let i = first + 1; i < last; i++) {
    const p = bezierPoint(b, u[i - first])
    const e = (p.x - d[i].x) ** 2 + (p.y - d[i].y) ** 2
    if (e > err) {
      err = e
      at = i
    }
  }
  return { err, at }
}

/** One Newton step per point towards the parameter of the nearest curve point. */
function reparameterize(d: Pt[], first: number, b: Cubic, u: number[]): number[] {
  return u.map((t, i) => {
    const diff = sub(bezierPoint(b, t), d[first + i])
    const q1 = derivative(b, t)
    const q2 = second(b, t)
    const den = dot(q1, q1) + dot(diff, q2)
    return den === 0 ? t : Math.min(1, Math.max(0, t - dot(diff, q1) / den))
  })
}

function fitRange(d: Pt[], first: number, last: number, t1: Pt, t2: Pt, errSq: number): Cubic[] {
  if (last - first === 1) {
    const third = len(sub(d[last], d[first])) / 3
    return [[d[first], add(d[first], mul(t1, third)), add(d[last], mul(t2, third)), d[last]]]
  }
  let u = chordParams(d, first, last)
  let b = generate(d, first, last, u, t1, t2)
  let { err, at } = maxError(d, first, last, b, u)
  if (err < errSq) return [b]
  if (err < errSq * 4) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(d, first, b, u)
      b = generate(d, first, last, u, t1, t2)
      ;({ err, at } = maxError(d, first, last, b, u))
      if (err < errSq) return [b]
    }
  }
  const center = unit(sub(d[at - 1], d[at + 1]))
  return [...fitRange(d, first, at, t1, center, errSq), ...fitRange(d, at, last, mul(center, -1), t2, errSq)]
}

/**
 * Smooth cubics through a polyline, within `tol` of every point (Schneider's
 * least-squares fitting). End tangents default to the first and last segments;
 * pass them for a closed loop so the seam stays smooth.
 */
export function fitCurve(points: Pt[], tol: number, startTangent?: Pt, endTangent?: Pt): Cubic[] {
  const d: Pt[] = []
  for (const p of points) if (!d.length || len(sub(p, d[d.length - 1])) > 1e-9) d.push(p)
  if (d.length < 2) return []
  const t1 = startTangent ?? unit(sub(d[1], d[0]))
  const t2 = endTangent ?? unit(sub(d[d.length - 2], d[d.length - 1]))
  return fitRange(d, 0, d.length - 1, t1, t2, tol * tol)
}
