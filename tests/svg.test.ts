import { describe, expect, it } from 'vitest'
import { PRESETS } from '../src/design'
import { designToSvg, svgFilename, tagPathData } from '../src/svg'

describe('svg export', () => {
  const svg = designToSvg(PRESETS[0], 'in')

  it('true size in inches with mm viewBox', () => {
    expect(svg).toContain('width="3in"')
    expect(svg).toContain('height="1.5in"')
    expect(svg).toContain('viewBox="0 0 76.2 38.1"')
  })
  it('mm units', () => expect(designToSvg(PRESETS[0], 'mm')).toContain('width="76.2mm"'))
  it('one evenodd path with two subpaths and real curves', () => {
    expect(svg.match(/<path /g)).toHaveLength(1)
    expect(svg).toContain('fill-rule="evenodd"')
    expect(tagPathData(PRESETS[0]).match(/M/g)).toHaveLength(2)
    expect(tagPathData(PRESETS[0])).toContain('C')
  })
  it('is an inkscape layer named Tag', () =>
    expect(svg).toMatch(/inkscape:groupmode="layer" inkscape:label="Tag"/))
  it('is well-formed: balanced tags, quoted attributes', () => {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
    const stack: string[] = []
    for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^<>]*?(\/?)>/g)) {
      if (m[3]) continue
      if (m[1]) expect(stack.pop()).toBe(m[2])
      else stack.push(m[2])
    }
    expect(stack).toEqual([])
    expect(svg.replace(/"[^"]*"/g, '')).not.toMatch(/[&"]/)
  })
  it('filename', () => {
    expect(svgFilename(PRESETS[0])).toBe('tagcraft-gift-tag.svg')
    expect(svgFilename({ ...PRESETS[0], name: '  ' })).toBe('tagcraft-rectangle.svg')
  })
})
