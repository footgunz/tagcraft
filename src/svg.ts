import { contourToPathData, mapContour, type Contour, type Pt } from './contour'
import type { Design } from './design'
import { holeContour } from './hole'
import { orientPoint } from './nest'
import { buildOutline } from './shapes'
import { layoutSheet, sheetDimensions, type Placement, type Sheet } from './sheet'
import { fromMm, type Unit } from './units'

function num(v: number, digits = 3): string {
  const n = Number(v.toFixed(digits))
  return String(Object.is(n, -0) ? 0 : n)
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Outline subpath followed by the hole subpath, for a single evenodd path. */
export function tagPathData(d: Design): string {
  return `${contourToPathData(buildOutline(d))} ${contourToPathData(holeContour(d))}`
}

function svgDocument(width: number, height: number, unit: Unit, paths: string[]): string {
  const w = `${num(fromMm(width, unit))}${unit}`
  const h = `${num(fromMm(height, unit))}${unit}`
  const viewBox = `0 0 ${num(width)} ${num(height)}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${esc(w)}" height="${esc(h)}" viewBox="${esc(viewBox)}">`,
    `  <g id="layer-tag" inkscape:groupmode="layer" inkscape:label="Tag">`,
    ...paths,
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n')
}

function pathElement(id: string, d: string): string {
  return `    <path id="${esc(id)}" d="${esc(d)}" fill="#000000" fill-rule="evenodd"/>`
}

export function designToSvg(d: Design, unit: Unit): string {
  return svgDocument(d.width, d.height, unit, [pathElement('tag', tagPathData(d))])
}

/** Moves a tag-space point into its slot on the sheet, turned clockwise by the placement's rotation. */
function placer(d: Design, p: Placement): (q: Pt) => Pt {
  return (q) => orientPoint(d.width, d.height, p.rotation, p.x, p.y, q)
}

/** Path data for each tag on the sheet, in sheet mm, with positions and turns written in. */
export function sheetTagPathData(d: Design, sheet: Sheet): string[] {
  const outline = buildOutline(d)
  const hole = holeContour(d)
  return layoutSheet(d, sheet).map((p) => {
    const place = (c: Contour) => contourToPathData(mapContour(c, placer(d, p)))
    return `${place(outline)} ${place(hole)}`
  })
}

/**
 * The whole sheet at true size, one evenodd path per tag. Positions and rotations
 * are written into the coordinates (no transforms), so every cutter reads them.
 */
export function sheetToSvg(d: Design, sheet: Sheet, unit: Unit): string {
  const { width, height } = sheetDimensions(sheet)
  const paths = sheetTagPathData(d, sheet).map((data, i) => pathElement(`tag-${i + 1}`, data))
  return svgDocument(width, height, unit, paths)
}

function slug(d: Design): string {
  const s = d.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || d.shape.kind
}

export function svgFilename(d: Design): string {
  return `tagcraft-${slug(d)}.svg`
}

export function sheetSvgFilename(d: Design, sheet: Sheet): string {
  return `tagcraft-${slug(d)}-${sheet.size}-${layoutSheet(d, sheet).length}up.svg`
}
