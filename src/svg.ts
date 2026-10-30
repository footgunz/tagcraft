import { contourToPathData } from './contour'
import type { Design } from './design'
import { holeContour } from './hole'
import { buildOutline } from './shapes'
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

export function designToSvg(d: Design, unit: Unit): string {
  const w = `${num(fromMm(d.width, unit))}${unit}`
  const h = `${num(fromMm(d.height, unit))}${unit}`
  const viewBox = `0 0 ${num(d.width)} ${num(d.height)}`
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${esc(w)}" height="${esc(h)}" viewBox="${esc(viewBox)}">`,
    `  <g id="layer-tag" inkscape:groupmode="layer" inkscape:label="Tag">`,
    `    <path id="tag" d="${esc(tagPathData(d))}" fill="#000000" fill-rule="evenodd"/>`,
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n')
}

export function svgFilename(d: Design): string {
  const slug = d.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `tagcraft-${slug || d.shape.kind}.svg`
}
