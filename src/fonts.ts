import { parse as parseOpentype, type Font as OpentypeFont } from 'opentype.js'
import type { Pt } from './contour'

// ---------------------------------------------------------------------------
// Glyph geometry, in font units with y up (as fonts are drawn).
// ---------------------------------------------------------------------------

export type Seg = { kind: 'L'; to: Pt } | { kind: 'C'; c1: Pt; c2: Pt; to: Pt }

/** One stroke of a glyph: open for single-line fonts, closed contours for outline fonts. */
export interface GlyphPath {
  start: Pt
  segs: Seg[]
  closed: boolean
}

export interface Glyph {
  advance: number
  paths: GlyphPath[]
}

/** A font, whatever file it came from. */
export interface Font {
  name: string
  /** Single-line fonts are traced once by a pen; outline fonts draw as hollow letters. */
  singleLine: boolean
  unitsPerEm: number
  capHeight: number
  ascent: number
  descent: number
  /** The glyph for one character, or null when the font has none. */
  glyph(ch: string): Glyph | null
  /** Advance for characters the font doesn't have. */
  missingAdvance: number
  /** Space to add between two characters (negative pulls them together). */
  kerning(a: string, b: string): number
}

// ---------------------------------------------------------------------------
// SVG path data
// ---------------------------------------------------------------------------

/**
 * SVG path data as strokes of lines and cubics: absolute and relative commands,
 * H/V, smooth S/T, quadratics raised to cubics, and repeated coordinates after
 * one command letter. Arcs are not used by fonts and are drawn as straight lines.
 */
export function parsePathData(d: string): GlyphPath[] {
  const tokens = d.match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []
  const paths: GlyphPath[] = []
  let cur: GlyphPath | null = null
  let pos: Pt = { x: 0, y: 0 }
  let start: Pt = { x: 0, y: 0 }
  // The previous segment's last control point, for S and T.
  let lastC: Pt | null = null
  let lastQ: Pt | null = null
  let cmd = ''
  let i = 0
  const num = () => Number(tokens[i++])
  const isNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i])
  const pt = (rel: boolean): Pt => {
    const x = num()
    const y = num()
    return rel ? { x: pos.x + x, y: pos.y + y } : { x, y }
  }
  const begin = () => {
    if (!cur) {
      cur = { start: pos, segs: [], closed: false }
      paths.push(cur)
    }
    return cur
  }
  const line = (to: Pt) => {
    begin().segs.push({ kind: 'L', to })
    pos = to
    lastC = lastQ = null
  }
  const cubic = (c1: Pt, c2: Pt, to: Pt) => {
    begin().segs.push({ kind: 'C', c1, c2, to })
    pos = to
    lastC = c2
    lastQ = null
  }
  const quad = (q: Pt, to: Pt) => {
    const from = pos
    cubic({ x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) }, { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) }, to)
    lastQ = q
  }
  const reflect = (p: Pt | null): Pt => (p ? { x: 2 * pos.x - p.x, y: 2 * pos.y - p.y } : pos)
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    switch (cmd.toUpperCase()) {
      case 'M': {
        pos = pt(rel)
        start = pos
        cur = null
        lastC = lastQ = null
        // Further pairs after a moveto are linetos.
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L':
        line(pt(rel))
        break
      case 'H': {
        const x = num()
        line({ x: rel ? pos.x + x : x, y: pos.y })
        break
      }
      case 'V': {
        const y = num()
        line({ x: pos.x, y: rel ? pos.y + y : y })
        break
      }
      case 'C': {
        const c1 = pt(rel)
        const c2 = pt(rel)
        cubic(c1, c2, pt(rel))
        break
      }
      case 'S': {
        const c1 = reflect(lastC)
        const c2 = pt(rel)
        cubic(c1, c2, pt(rel))
        break
      }
      case 'Q': {
        const q = pt(rel)
        quad(q, pt(rel))
        break
      }
      case 'T': {
        const q = reflect(lastQ)
        quad(q, pt(rel))
        break
      }
      case 'A': {
        for (let k = 0; k < 5; k++) num()
        line(pt(rel))
        break
      }
      case 'Z': {
        if (cur) {
          const c: GlyphPath = cur
          if (pos.x !== start.x || pos.y !== start.y) c.segs.push({ kind: 'L', to: start })
          c.closed = true
        }
        pos = start
        cur = null
        lastC = lastQ = null
        // Skip anything malformed until the next command.
        while (isNum()) i++
        break
      }
      default:
        // Unknown command: skip its numbers.
        while (isNum()) i++
    }
  }
  return paths.filter((p) => p.segs.length)
}

// ---------------------------------------------------------------------------
// SVG fonts (the single-line fonts)
// ---------------------------------------------------------------------------

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Parse an SVG font file. Glyphs are kept for single characters; ligatures are ignored. */
export function parseSvgFont(text: string, name: string): Font {
  const font = attrs(text.match(/<font\b[^>]*>/)?.[0] ?? '')
  const face = attrs(text.match(/<font-face\b[^>]*>/)?.[0] ?? '')
  const missing = attrs(text.match(/<missing-glyph\b[^>]*>/)?.[0] ?? '')
  const defaultAdvance = Number(font['horiz-adv-x']) || 500
  const unitsPerEm = Number(face['units-per-em']) || 1000
  const ascent = Number(face.ascent) || unitsPerEm * 0.8
  const descent = Number(face.descent) || -unitsPerEm * 0.2
  const glyphs = new Map<string, { advance: number; d: string; paths?: GlyphPath[] }>()
  const byName = new Map<string, string>()
  for (const m of text.matchAll(/<glyph\b[^>]*>/g)) {
    const a = attrs(m[0])
    if (a.unicode === undefined) continue
    const ch = decode(a.unicode)
    if ([...ch].length !== 1) continue
    glyphs.set(ch, { advance: a['horiz-adv-x'] !== undefined ? Number(a['horiz-adv-x']) : defaultAdvance, d: a.d ?? '' })
    if (a['glyph-name']) byName.set(a['glyph-name'], ch)
  }

  // Size is the cap height, so measure it from the H: the EMS and Hershey fonts
  // declare 500 while their capitals reach about 660.
  const H = glyphs.get('H')
  const capTop = H ? Math.max(...parsePathData(H.d).flatMap((p) => [p.start.y, ...p.segs.map((s) => s.to.y)])) : 0
  const capHeight = capTop > 0 ? capTop : Number(face['cap-height']) || ascent * 0.7

  // hkern: k is taken off the advance between the pair.
  const kerns = new Map<string, number>()
  const chars = (u: string | undefined, g: string | undefined): string[] => [
    ...(u ? decode(u).split(',').filter((c) => [...c].length === 1) : []),
    ...(g ? g.split(',').map((n) => byName.get(n.trim())).filter((c): c is string => !!c) : []),
  ]
  for (const m of text.matchAll(/<hkern\b[^>]*>/g)) {
    const a = attrs(m[0])
    const k = Number(a.k) || 0
    for (const l of chars(a.u1, a.g1)) for (const r of chars(a.u2, a.g2)) kerns.set(l + '\u0000' + r, -k)
  }

  return {
    name,
    singleLine: true,
    unitsPerEm,
    capHeight,
    ascent,
    descent,
    missingAdvance: Number(missing['horiz-adv-x']) || defaultAdvance,
    glyph(ch) {
      const g = glyphs.get(ch)
      if (!g) return null
      g.paths ??= parsePathData(g.d)
      return { advance: g.advance, paths: g.paths }
    },
    kerning: (a, b) => kerns.get(a + '\u0000' + b) ?? 0,
  }
}

// ---------------------------------------------------------------------------
// TTF / OTF / WOFF (outline fonts, through opentype.js)
// ---------------------------------------------------------------------------

/** An opentype.js font. Its outlines are closed contours, drawn by a pen as hollow letters. */
export function fromOpentype(f: OpentypeFont, name: string): Font {
  const os2 = (f.tables as { os2?: { sCapHeight?: number } }).os2
  const cache = new Map<string, Glyph | null>()
  return {
    name,
    singleLine: false,
    unitsPerEm: f.unitsPerEm,
    capHeight: os2?.sCapHeight || f.ascender * 0.7,
    ascent: f.ascender,
    descent: f.descender,
    missingAdvance: f.unitsPerEm / 2,
    glyph(ch) {
      if (cache.has(ch)) return cache.get(ch)!
      const g = f.charToGlyph(ch)
      let out: Glyph | null = null
      if (g && g.index !== 0) {
        // Raw glyph outlines are in font units with y up, like SVG fonts.
        const d = g.path.commands
          .map((c) => {
            switch (c.type) {
              case 'M':
              case 'L':
                return `${c.type}${c.x} ${c.y}`
              case 'Q':
                return `Q${c.x1} ${c.y1} ${c.x} ${c.y}`
              case 'C':
                return `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`
              default:
                return 'Z'
            }
          })
          .join(' ')
        out = { advance: g.advanceWidth ?? f.unitsPerEm / 2, paths: parsePathData(d) }
      }
      cache.set(ch, out)
      return out
    },
    kerning(a, b) {
      const ga = f.charToGlyph(a)
      const gb = f.charToGlyph(b)
      return ga && gb ? f.getKerningValue(ga, gb) : 0
    },
  }
}

/** Read a font file by its extension: .svg as a single-line SVG font, anything else with opentype.js. */
export function readFont(fileName: string, bytes: ArrayBuffer): Font {
  const name = fileName.replace(/\.\w+$/, '')
  if (/\.svg$/i.test(fileName)) return parseSvgFont(new TextDecoder().decode(bytes), name)
  return fromOpentype(parseOpentype(bytes), name)
}
