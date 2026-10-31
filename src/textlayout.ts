import type { Pt } from './contour'
import type { TextAlign, TextBox } from './design'
import type { Font, Seg } from './fonts'

export type { TextAlign, TextBox }

export interface TextStyle {
  /** Letter (cap) height, mm. */
  size: number
  /** Multiple of the font's natural line height (ascent to descent). */
  lineSpacing: number
  align: TextAlign
}

/** A stroke in tag mm: open for single-line glyphs and clipped pieces, closed for whole outline contours. */
export interface TextPath {
  start: Pt
  segs: Seg[]
  closed: boolean
}

/** A laid-out line: its text, where it starts, its baseline and its width (mm). */
export interface TextLine {
  text: string
  x: number
  baseline: number
  width: number
}

const EPS = 1e-9

/** mm per font unit at this size. */
const scaleOf = (font: Font, s: TextStyle) => s.size / font.capHeight

function advanceOf(font: Font, text: string): number {
  let w = 0
  let prev = ''
  for (const ch of text) {
    w += (font.glyph(ch)?.advance ?? font.missingAdvance) + (prev ? font.kerning(prev, ch) : 0)
    prev = ch
  }
  return w
}

/**
 * Wrap and align the text: words wrap at the box width, Enter starts a new
 * line, and a word wider than the box stays on its own line. Lines start at the
 * top of the box (the first baseline one ascent down) and step by the line height.
 */
export function layoutLines(font: Font, text: string, style: TextStyle, box: TextBox): TextLine[] {
  const k = scaleOf(font, style)
  const width = (s: string) => advanceOf(font, s) * k
  const rows: string[] = []
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/ +/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (line && width(next) > box.w + EPS) {
        rows.push(line)
        line = word
      } else line = next
    }
    rows.push(line)
  }
  const lineHeight = style.lineSpacing * (font.ascent - font.descent) * k
  return rows.map((t, i) => {
    const w = width(t)
    const x = style.align === 'left' ? box.x : style.align === 'center' ? box.x + (box.w - w) / 2 : box.x + box.w - w
    return { text: t, x, baseline: box.y + font.ascent * k + i * lineHeight, width: w }
  })
}

/** Every glyph stroke of the laid-out lines, in tag mm, before clipping. */
function placeGlyphs(font: Font, lines: TextLine[], style: TextStyle): TextPath[] {
  const k = scaleOf(font, style)
  const out: TextPath[] = []
  for (const line of lines) {
    let pen = 0
    let prev = ''
    for (const ch of line.text) {
      if (prev) pen += font.kerning(prev, ch)
      const g = font.glyph(ch)
      if (g) {
        const ox = line.x + pen * k
        // Fonts are drawn y up; the tag is y down.
        const map = (p: Pt): Pt => ({ x: ox + p.x * k, y: line.baseline - p.y * k })
        for (const p of g.paths)
          out.push({
            start: map(p.start),
            closed: p.closed,
            segs: p.segs.map((s) => (s.kind === 'L' ? { kind: 'L', to: map(s.to) } : { kind: 'C', c1: map(s.c1), c2: map(s.c2), to: map(s.to) })),
          })
      }
      pen += g?.advance ?? font.missingAdvance
      prev = ch
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Clipping to the box
// ---------------------------------------------------------------------------

type Piece = { from: Pt; seg: Seg }

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

function pointAt(from: Pt, s: Seg, t: number): Pt {
  if (s.kind === 'L') return lerp(from, s.to, t)
  const u = 1 - t
  return {
    x: u * u * u * from.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.to.x,
    y: u * u * u * from.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.to.y,
  }
}

/** The part of a segment between t0 and t1, as the same kind of segment. */
function sub(from: Pt, s: Seg, t0: number, t1: number): Piece {
  if (s.kind === 'L') return { from: lerp(from, s.to, t0), seg: { kind: 'L', to: lerp(from, s.to, t1) } }
  // de Casteljau: split at t1, then split the first part at t0 / t1.
  const split = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] => {
    const a = lerp(p0, p1, t)
    const b = lerp(p1, p2, t)
    const c = lerp(p2, p3, t)
    const d = lerp(a, b, t)
    const e = lerp(b, c, t)
    return [p0, a, d, lerp(d, e, t)]
  }
  const left = split(from, s.c1, s.c2, s.to, t1)
  // Reverse, split at 1 - t0/t1 from the far end, reverse back: the piece [t0, t1].
  const r = t1 < EPS ? 0 : t0 / t1
  const rev = split(left[3], left[2], left[1], left[0], 1 - r)
  return { from: rev[3], seg: { kind: 'C', c1: rev[2], c2: rev[1], to: rev[0] } }
}

/** Parameters in (0, 1) where f changes sign: a fine grid, then bisection to each crossing. */
function roots(f: (t: number) => number): number[] {
  const N = 32
  const ts: number[] = []
  let t0 = 0
  let f0 = f(0)
  for (let i = 1; i <= N; i++) {
    const t1 = i / N
    const f1 = f(t1)
    if ((f0 < 0 && f1 > 0) || (f0 > 0 && f1 < 0)) {
      let lo = t0
      let hi = t1
      let flo = f0
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2
        const fm = f(mid)
        if ((flo < 0) === (fm < 0)) {
          lo = mid
          flo = fm
        } else hi = mid
      }
      const t = (lo + hi) / 2
      if (t > EPS && t < 1 - EPS) ts.push(t)
    }
    t0 = t1
    f0 = f1
  }
  return ts
}

/** An area strokes are cut against: where a segment crosses its edge, which side to keep, and edge snapping. */
interface Region {
  crossings(from: Pt, s: Seg): number[]
  keep(p: Pt): boolean
  snap(p: Pt): Pt
}

/** Keep what's inside the box. */
function boxRegion(box: TextBox): Region {
  const edges: [keyof Pt, number][] = [
    ['x', box.x],
    ['x', box.x + box.w],
    ['y', box.y],
    ['y', box.y + box.h],
  ]
  const near = (v: number, lo: number, hi: number) => (Math.abs(v - lo) < 1e-6 ? lo : Math.abs(v - hi) < 1e-6 ? hi : v)
  return {
    crossings(from, s) {
      if (s.kind === 'L') {
        const ts: number[] = []
        for (const [axis, v] of edges) {
          const d = s.to[axis] - from[axis]
          if (Math.abs(d) < EPS) continue
          const t = (v - from[axis]) / d
          if (t > EPS && t < 1 - EPS) ts.push(t)
        }
        return ts
      }
      return edges.flatMap(([axis, v]) => roots((t) => pointAt(from, s, t)[axis] - v))
    },
    keep: (p) => p.x >= box.x - 1e-7 && p.x <= box.x + box.w + 1e-7 && p.y >= box.y - 1e-7 && p.y <= box.y + box.h + 1e-7,
    // A clipped end that sits on an edge lands exactly on it.
    snap: (p) => ({ x: near(p.x, box.x, box.x + box.w), y: near(p.y, box.y, box.y + box.h) }),
  }
}

/** Keep what's outside the circle. */
function outsideCircle(c: Pt, r: number): Region {
  return {
    crossings(from, s) {
      if (s.kind === 'L') {
        const dx = s.to.x - from.x
        const dy = s.to.y - from.y
        const fx = from.x - c.x
        const fy = from.y - c.y
        const A = dx * dx + dy * dy
        const B = 2 * (fx * dx + fy * dy)
        const disc = B * B - 4 * A * (fx * fx + fy * fy - r * r)
        if (A < EPS || disc <= 0) return []
        const q = Math.sqrt(disc)
        return [(-B - q) / (2 * A), (-B + q) / (2 * A)].filter((t) => t > EPS && t < 1 - EPS)
      }
      return roots((t) => {
        const p = pointAt(from, s, t)
        return Math.hypot(p.x - c.x, p.y - c.y) - r
      })
    },
    keep: (p) => Math.hypot(p.x - c.x, p.y - c.y) >= r - 1e-7,
    snap: (p) => p,
  }
}

/** Cut a stroke where it crosses the region's edge, keeping the pieces on the kept side. */
function clipPath(p: TextPath, region: Region): TextPath[] {
  const out: TextPath[] = []
  let cur: TextPath | null = null
  let whole = true
  let from = p.start
  for (const s of p.segs) {
    const ts = [0, ...region.crossings(from, s).sort((a, b) => a - b), 1]
    if (ts.length > 2) whole = false
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < EPS) continue
      if (!region.keep(pointAt(from, s, (ts[i] + ts[i + 1]) / 2))) {
        whole = false
        if (cur) out.push(cur)
        cur = null
        continue
      }
      const piece = ts.length === 2 ? { from, seg: s } : sub(from, s, ts[i], ts[i + 1])
      const to = region.snap(piece.seg.to)
      const seg: Seg = piece.seg.kind === 'L' ? { kind: 'L', to } : { ...piece.seg, to }
      if (!cur) cur = { start: region.snap(piece.from), segs: [], closed: false }
      cur.segs.push(seg)
    }
    from = s.to
  }
  if (cur) out.push(cur)
  if (whole && out.length === 1) out[0].closed = p.closed
  return out
}

/** Cut strokes away inside a circle (the hole), keeping everything outside it. */
export function clipOutsideCircle(paths: TextPath[], c: Pt, r: number): TextPath[] {
  const region = outsideCircle(c, r)
  return paths.flatMap((p) => clipPath(p, region))
}

/**
 * The text's strokes in tag mm: wrapped, aligned and clipped to the box.
 * Nothing outside the box is ever drawn.
 */
export function layoutText(font: Font, text: string, style: TextStyle, box: TextBox): TextPath[] {
  const region = boxRegion(box)
  return placeGlyphs(font, layoutLines(font, text, style, box), style).flatMap((p) => clipPath(p, region))
}

function num(v: number): string {
  const n = Number(v.toFixed(3))
  return String(Object.is(n, -0) ? 0 : n)
}

/** SVG path data for text strokes, one subpath each. */
export function textPathData(paths: TextPath[]): string {
  const pt = (q: Pt) => `${num(q.x)} ${num(q.y)}`
  return paths
    .map((p) => {
      let s = `M${pt(p.start)}`
      for (const g of p.segs) s += g.kind === 'L' ? ` L${pt(g.to)}` : ` C${pt(g.c1)} ${pt(g.c2)} ${pt(g.to)}`
      return p.closed ? `${s} Z` : s
    })
    .join(' ')
}
