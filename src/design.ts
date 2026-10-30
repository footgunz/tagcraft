import type { BezierNode, Contour } from './contour'
import { naturalAspect } from './shapes'

export type EndStyle = 'square' | 'clipped' | 'rounded'
export type ShapeSettings =
  | { kind: 'rectangle'; end: EndStyle; clip: number; rounding: number }
  | { kind: 'polygon'; sides: number; rounding: number }
  | { kind: 'star'; points: number; depth: number; rounding: number }
  | { kind: 'wavy'; end: EndStyle; clip: number; waves: number; waveHeight: number }
  | { kind: 'ellipse' }
  | { kind: 'oval' } // stadium: straight long sides, semicircular ends

/** mm; offset = distance from the hole end's outermost point to the hole center. */
export interface Hole {
  diameter: number
  offset: number
}

export interface Design {
  name: string
  width: number
  height: number
  lockProportions: boolean // used by polygon/star/ellipse only
  shape: ShapeSettings
  hole: Hole
  points: Contour | null // bezier edits, normalized to the unit box; null = settings-driven
}

/** Minimum wall between the hole and the outline: 1/8 inch. */
export const MIN_WALL_MM = 3.175

/**
 * mm unless noted. `clip`, `waveHeight` and `offset` depend on the design's size;
 * the max given here is the loosest possible and `normalizeDesign` tightens it.
 */
export const RANGES: Record<string, { min: number; max: number; step: number }> = {
  width: { min: 12.7, max: 304.8, step: 0.1 },
  height: { min: 12.7, max: 304.8, step: 0.1 },
  clip: { min: 0, max: 152.4, step: 0.1 },
  rounding: { min: 0, max: 25.4, step: 0.05 },
  sides: { min: 3, max: 12, step: 1 },
  points: { min: 3, max: 60, step: 1 },
  depth: { min: 0.2, max: 0.9, step: 0.01 },
  waves: { min: 1, max: 12, step: 1 },
  waveHeight: { min: 0, max: 76.2, step: 0.1 },
  diameter: { min: 1, max: 25.4, step: 0.05 },
  offset: { min: 0, max: 304.8, step: 0.1 },
}

const HOLE: Hole = { diameter: 6.35, offset: 8.89 }

function preset(name: string, width: number, height: number, lock: boolean, shape: ShapeSettings, hole: Hole = HOLE): Design {
  return { name, width, height, lockProportions: lock, shape, hole: { ...hole }, points: null }
}

function lockedHeight(width: number, shape: ShapeSettings): number {
  return width * naturalAspect(shape)
}

const hexagon: ShapeSettings = { kind: 'polygon', sides: 6, rounding: 1.27 }
const star: ShapeSettings = { kind: 'star', points: 5, depth: 0.5, rounding: 1 }
const seal: ShapeSettings = { kind: 'star', points: 36, depth: 0.88, rounding: 0.3 }

export const PRESETS: Design[] = [
  preset('Gift tag', 76.2, 38.1, false, { kind: 'rectangle', end: 'clipped', clip: 12.7, rounding: 1.27 }),
  preset('Rectangle', 76.2, 38.1, false, { kind: 'rectangle', end: 'square', clip: 12.7, rounding: 1.27 }),
  preset('Star', 63.5, lockedHeight(63.5, star), true, star, { diameter: 5, offset: 22 }),
  preset('Wavy', 76.2, 38.1, false, { kind: 'wavy', end: 'square', clip: 12.7, waves: 4, waveHeight: 3 }),
  preset('Hexagon', 50.8, lockedHeight(50.8, hexagon), true, hexagon, { diameter: 6.35, offset: 9 }),
  preset('Circle', 50.8, 50.8, true, { kind: 'ellipse' }),
  preset('Ellipse', 76.2, 44.45, false, { kind: 'ellipse' }),
  preset('Oval', 76.2, 38.1, false, { kind: 'oval' }),
  preset('Seal', 63.5, lockedHeight(63.5, seal), true, seal, { diameter: 6.35, offset: 11 }),
]

const GIFT = PRESETS[0]
const KINDS = ['rectangle', 'polygon', 'star', 'wavy', 'ellipse', 'oval'] as const
const ENDS: EndStyle[] = ['square', 'clipped', 'rounded']

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function clampNum(v: unknown, fallback: number, min: number, max: number, integer = false): number {
  let n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  if (integer) n = Math.round(n)
  return Math.min(max, Math.max(min, n))
}

function range(key: string, v: unknown, fallback: number, max = RANGES[key].max, integer = false): number {
  return clampNum(v, fallback, RANGES[key].min, max, integer)
}

function normalizeNodes(v: unknown): Contour | null {
  if (!Array.isArray(v) || v.length < 3) return null
  const pt = (q: unknown): { x: number; y: number } | null => {
    const o = rec(q)
    return typeof o.x === 'number' && typeof o.y === 'number' && Number.isFinite(o.x) && Number.isFinite(o.y)
      ? { x: o.x, y: o.y }
      : null
  }
  const out: BezierNode[] = []
  for (const item of v) {
    const o = rec(item)
    const p = pt(o.p)
    const hIn = pt(o.hIn)
    const hOut = pt(o.hOut)
    if (!p || !hIn || !hOut) return null
    out.push({ p, hIn, hOut })
  }
  return out
}

/** Repairs anything (UI state, parsed JSON) into a valid Design. Hole clamping is separate. */
export function normalizeDesign(input: unknown): Design {
  const d = rec(input)
  let width = range('width', d.width, GIFT.width)
  let height = range('height', d.height, GIFT.height)

  const s = rec(d.shape)
  const kind = KINDS.find((k) => k === s.kind) ?? 'rectangle'
  const rounding = (fallback: number) => range('rounding', s.rounding, fallback)
  const end = (fallback: EndStyle): EndStyle => ENDS.find((e) => e === s.end) ?? fallback
  let shape: ShapeSettings
  switch (kind) {
    case 'rectangle':
      shape = { kind, end: end('clipped'), clip: 0, rounding: rounding(1.27) }
      break
    case 'wavy':
      shape = { kind, end: end('square'), clip: 0, waves: range('waves', s.waves, 4, undefined, true), waveHeight: 0 }
      break
    case 'polygon':
      shape = { kind, sides: range('sides', s.sides, 6, undefined, true), rounding: rounding(1.27) }
      break
    case 'star':
      shape = {
        kind,
        points: range('points', s.points, 5, undefined, true),
        depth: range('depth', s.depth, 0.5),
        rounding: rounding(1),
      }
      break
    default:
      shape = { kind }
  }

  const lock = typeof d.lockProportions === 'boolean' ? d.lockProportions : GIFT.lockProportions
  const points = normalizeNodes(d.points)
  if (lock && !points && (shape.kind === 'polygon' || shape.kind === 'star' || shape.kind === 'ellipse')) {
    const aspect = naturalAspect(shape)
    height = width * aspect
    if (height < RANGES.height.min || height > RANGES.height.max) {
      height = range('height', height, height)
      width = height / aspect
    }
  }
  if (shape.kind === 'rectangle' || shape.kind === 'wavy') {
    // Past the width, the clipped corners would cross over the far end.
    shape.clip = range('clip', s.clip, 12.7, Math.min(height / 2, width))
  }
  if (shape.kind === 'wavy') shape.waveHeight = range('waveHeight', s.waveHeight, 3, height / 4)

  const h = rec(d.hole)
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name : GIFT.name,
    width,
    height,
    lockProportions: lock,
    shape,
    hole: {
      diameter: range('diameter', h.diameter, HOLE.diameter),
      offset: range('offset', h.offset, HOLE.offset, Math.max(width, height)),
    },
    points,
  }
}
