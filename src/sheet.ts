import { clampNum, rec, type Design } from './design'
import { nestedLayout, type Rotation } from './nest'

export type SheetSize = 'letter' | 'a4' | 'custom'

/** mm. Presets are portrait. */
export const SHEET_PRESETS: Record<Exclude<SheetSize, 'custom'>, { label: string; width: number; height: number }> = {
  letter: { label: 'Letter', width: 215.9, height: 279.4 },
  a4: { label: 'A4', width: 210, height: 297 },
}

/** mm. `count` null = as many as fit. */
export interface Sheet {
  size: SheetSize
  // Kept when a preset is picked, so switching back to Custom restores them.
  customWidth: number
  customHeight: number
  margin: number
  gap: number
  count: number | null
}

/** mm unless noted. Custom sizes go up to a 12 × 24 in mat. */
export const SHEET_RANGES: Record<string, { min: number; max: number; step: number }> = {
  customWidth: { min: 25.4, max: 609.6, step: 0.1 },
  customHeight: { min: 25.4, max: 609.6, step: 0.1 },
  margin: { min: 0, max: 25.4, step: 0.1 },
  gap: { min: 0, max: 25.4, step: 0.1 },
  count: { min: 1, max: 999, step: 1 },
}

export const DEFAULT_SHEET: Sheet = {
  size: 'letter',
  customWidth: 215.9,
  customHeight: 279.4,
  margin: 6.35,
  gap: 3.175,
  count: null,
}

const SIZES: SheetSize[] = ['letter', 'a4', 'custom']

function range(key: string, v: unknown, fallback: number, integer = false): number {
  return clampNum(v, fallback, SHEET_RANGES[key].min, SHEET_RANGES[key].max, integer)
}

/** Repairs anything (UI state, parsed JSON) into a valid Sheet. */
export function normalizeSheet(input: unknown): Sheet {
  const s = rec(input)
  return {
    size: SIZES.find((k) => k === s.size) ?? DEFAULT_SHEET.size,
    customWidth: range('customWidth', s.customWidth, DEFAULT_SHEET.customWidth),
    customHeight: range('customHeight', s.customHeight, DEFAULT_SHEET.customHeight),
    margin: range('margin', s.margin, DEFAULT_SHEET.margin),
    gap: range('gap', s.gap, DEFAULT_SHEET.gap),
    count: s.count === null || s.count === undefined ? null : range('count', s.count, 1, true),
  }
}

export function sheetDimensions(s: Sheet): { width: number; height: number } {
  return s.size === 'custom' ? { width: s.customWidth, height: s.customHeight } : SHEET_PRESETS[s.size]
}

/**
 * mm. (x, y) is the top-left of the tag's bounding box on the sheet. A turned tag
 * (rotation 90 or 270) takes up height × width; 180 is upside down.
 */
export interface Placement {
  x: number
  y: number
  rotation: Rotation
}

// Float slack so a tag that fits exactly isn't lost to rounding.
const EPS = 1e-6

/** How many items of `size` fit along `length` with `gap` between them. */
function fit(size: number, length: number, gap: number): number {
  return size > length + EPS ? 0 : Math.floor((length + gap) / (size + gap) + EPS)
}

function grid(x0: number, y0: number, cols: number, rows: number, w: number, h: number, gap: number, rotation: Rotation): Placement[] {
  const out: Placement[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (w + gap), y: y0 + r * (h + gap), rotation })
  return out
}

// The panel, preview, toolbar and export all ask for the same layout on each change.
const layouts = new Map<string, Placement[]>()

/**
 * As many copies of the design as fit inside the margin, packed from the
 * top-left. Tries bounding-box grids first: all upright, all turned, then mixed
 * (one orientation in a block, the other in the leftover strip to the right or
 * below). Then shape-aware nesting, which packs the actual outlines (staggered
 * rows, tags flipped to interlock). The most tags wins and ties go to the
 * earlier, simpler layout. With a count, keeps the first N in reading order.
 */
export function layoutSheet(d: Design, s: Sheet): Placement[] {
  const key = JSON.stringify([d, s])
  let out = layouts.get(key)
  if (!out) {
    out = computeLayout(d, s)
    if (layouts.size > 16) layouts.clear()
    layouts.set(key, out)
  }
  return out
}

function computeLayout(d: Design, s: Sheet): Placement[] {
  const { width, height } = sheetDimensions(s)
  const { margin: m, gap: g } = s
  const W = width - 2 * m
  const H = height - 2 * m
  const orients = [
    { w: d.width, h: d.height, rotation: 0 as const },
    { w: d.height, h: d.width, rotation: 90 as const },
  ]

  const candidates: Placement[][] = orients.map((o) => grid(m, m, fit(o.w, W, g), fit(o.h, H, g), o.w, o.h, g, o.rotation))
  for (const [p, q] of [orients, [orients[1], orients[0]]]) {
    const pRows = fit(p.h, H, g)
    const pCols = fit(p.w, W, g)
    // Strip to the right of k columns of p.
    for (let k = 1; k <= pCols; k++) {
      const used = k * (p.w + g)
      const rest = W - used
      candidates.push([
        ...grid(m, m, k, pRows, p.w, p.h, g, p.rotation),
        ...grid(m + used, m, fit(q.w, rest, g), fit(q.h, H, g), q.w, q.h, g, q.rotation),
      ])
    }
    // Strip below k rows of p.
    for (let k = 1; k <= pRows; k++) {
      const used = k * (p.h + g)
      const rest = H - used
      candidates.push([
        ...grid(m, m, pCols, k, p.w, p.h, g, p.rotation),
        ...grid(m, m + used, fit(q.w, W, g), fit(q.h, rest, g), q.w, q.h, g, q.rotation),
      ])
    }
  }

  candidates.push(nestedLayout(d, W, H, g).map((p) => ({ x: m + p.x, y: m + p.y, rotation: p.rotation })))

  let best: Placement[] = []
  for (const c of candidates) if (c.length > best.length) best = c
  if (s.count === null || s.count >= best.length) return best
  const reading = [...best].sort((a, b) => (Math.abs(a.y - b.y) > EPS ? a.y - b.y : a.x - b.x))
  return reading.slice(0, s.count)
}
