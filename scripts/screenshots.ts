/**
 * Regenerate the screenshot and animations in docs/assets/.
 *
 *   npm run docs:screenshots [-- name ...]
 *
 * Starts the dev server and drives Playwright's Chromium, recording each
 * animation frame by frame into a GIF. Pass shot names to redo only those. Set
 * CHROME_PATH to use a specific browser instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { type Browser, type Page, chromium } from '@playwright/test'
import gifenc from 'gifenc'
import pngjs from 'pngjs'
import { createServer } from 'vite'

// Both are CommonJS packages.
const { GIFEncoder, applyPalette, quantize } = gifenc
const { PNG } = pngjs

const OUT = 'docs/assets'
const URL = 'http://localhost:5199/'
const ACCENT = '#e5197a'
/** Animations are recorded in a small window so the panel and preview both fit. */
const ANIM_VIEWPORT = { width: 960, height: 540 }

// ---------------------------------------------------------------------------
// Driving the app
// ---------------------------------------------------------------------------

/** A fresh page with default settings, counting preview renders. */
async function open(browser: Browser, viewport: { width: number; height: number }, scale = 1): Promise<Page> {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale, colorScheme: 'light' })
  await page.addInitScript(() => {
    localStorage.clear()
    ;(window as any).__renders = 0
    addEventListener('DOMContentLoaded', () =>
      new MutationObserver(() => (window as any).__renders++).observe(document.getElementById('preview')!, {
        childList: true,
        subtree: true,
        attributes: true,
      }),
    )
  })
  await page.goto(URL)
  await page.waitForFunction(() => !!document.querySelector('#preview svg'))
  // Leave the version label empty, so the images don't show whatever build recorded them.
  await page.addStyleTag({ content: '.brand .version { visibility: hidden }' })
  return page
}

/** Run a change and wait for the preview to redraw (or move on if nothing changed). */
async function apply(page: Page, change: () => Promise<unknown>) {
  const before = await page.evaluate(() => (window as any).__renders)
  await change()
  await page.waitForFunction((n) => (window as any).__renders > n, before, { timeout: 1500 }).catch(() => {})
  await page.waitForTimeout(60)
}

/** A panel section by its heading. */
const sectionOf = (page: Page, title: string) =>
  page.locator('#controls section', { has: page.locator('h2', { hasText: new RegExp(`^${title}$`) }) })

const rowInput = (page: Page, section: string, label: string, tag: string) =>
  sectionOf(page, section)
    .locator('.row', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) })
    .locator(tag)
    .first()

/** Number fields commit on change, like typing a value and leaving the field. */
function setNumber(page: Page, section: string, label: string, value: number | '') {
  return apply(page, () =>
    rowInput(page, section, label, 'input').evaluate((el: HTMLInputElement, v) => {
      el.value = String(v)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, value),
  )
}

function choose(page: Page, section: string, label: string, value: string) {
  return apply(page, () => rowInput(page, section, label, 'select').selectOption(value))
}

function click(page: Page, selector: string, text: string) {
  return apply(page, () => page.locator(selector, { hasText: text }).first().click())
}

/** Scroll the panel so the given section is at the top. */
async function scrollTo(page: Page, title: string) {
  await page.evaluate((title) => {
    const sec = [...document.querySelectorAll('#controls section')].find((s) => s.querySelector('h2')?.textContent?.trim() === title)
    if (!sec) throw new Error(`No section ${title}`)
    const panel = document.getElementById('controls')!
    panel.scrollTop += sec.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8
  }, title)
}

/** Outline the control being changed, so it's easy to follow in the animation. */
async function spotlight(page: Page, selector: string, text: string) {
  await page.evaluate(
    ({ selector, text, accent }) => {
      document.getElementById('shot-spot')?.remove()
      const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.textContent?.includes(text))
      if (!el) throw new Error(`No element for ${selector} ${text}`)
      const r = el.getBoundingClientRect()
      const box = document.createElement('div')
      box.id = 'shot-spot'
      box.style.cssText =
        `position:fixed;left:${r.left - 4}px;top:${r.top - 3}px;width:${r.width + 8}px;height:${r.height + 6}px;` +
        `border:2px solid ${accent};border-radius:7px;pointer-events:none;z-index:9999`
      document.body.append(box)
    },
    { selector, text, accent: ACCENT },
  )
}

/** Spotlight a panel row by its label. */
const spotRow = (page: Page, label: string) => spotlight(page, '#controls .row', label)

const unspot = (page: Page) => page.evaluate(() => document.getElementById('shot-spot')?.remove())

/** Center of an element in the preview, in page pixels. */
async function centerOf(page: Page, selector: string, nth = 0) {
  const box = (await page.locator(selector).nth(nth).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Drag with the mouse from `from` by (dx, dy), recording a frame at each step. */
async function drag(page: Page, rec: Recorder, from: { x: number; y: number }, moves: [number, number][], stepsPer = 6) {
  let { x, y } = from
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (const [dx, dy] of moves) {
    for (let i = 1; i <= stepsPer; i++) {
      await apply(page, () => page.mouse.move(x + (dx * i) / stepsPer, y + (dy * i) / stepsPer))
      await rec.frame()
    }
    x += dx
    y += dy
    rec.hold(400)
  }
  await apply(page, () => page.mouse.up())
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

class Recorder {
  frames: { rgba: Uint8Array; delay: number }[] = []
  width = 0
  height = 0
  page: Page
  constructor(page: Page) {
    this.page = page
  }

  async frame(delay = 70) {
    const png = PNG.sync.read(await this.page.screenshot())
    this.width = png.width
    this.height = png.height
    this.frames.push({ rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length), delay })
  }

  /** Stay on the last frame a little longer. */
  hold(ms: number) {
    this.frames[this.frames.length - 1].delay += ms
  }

  /**
   * Write a looping GIF. After the first frame only changed pixels are stored
   * (the rest are transparent), which keeps files small since most of the
   * window stays still.
   */
  save(file: string) {
    const gif = GIFEncoder()
    let prev: Uint8Array | null = null
    for (const f of this.frames) {
      const palette = quantize(f.rgba, prev ? 255 : 256)
      const index = applyPalette(f.rgba, palette)
      let transparentIndex = -1
      if (prev) {
        transparentIndex = palette.length
        palette.push([255, 0, 255])
        for (let i = 0; i < index.length; i++) {
          const p = i * 4
          if (f.rgba[p] === prev[p] && f.rgba[p + 1] === prev[p + 1] && f.rgba[p + 2] === prev[p + 2]) index[i] = transparentIndex
        }
      }
      gif.writeFrame(index, this.width, this.height, {
        palette,
        delay: f.delay,
        transparent: transparentIndex >= 0,
        transparentIndex: Math.max(0, transparentIndex),
        dispose: 1,
      })
      prev = f.rgba
    }
    gif.finish()
    writeFileSync(`${OUT}/${file}`, gif.bytes())
    console.log(`  ${file}: ${this.frames.length} frames, ${Math.round(gif.bytes().length / 1024)} KB`)
  }
}

/** Evenly spaced values from a to b, inclusive. */
const steps = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)

// ---------------------------------------------------------------------------
// The shots
// ---------------------------------------------------------------------------

async function overview(browser: Browser) {
  const page = await open(browser, { width: 1280, height: 760 }, 2)
  await page.screenshot({ path: `${OUT}/overview.png` })
  await page.close()
}

/** Click through the built-in presets. */
async function presets(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  const rec = new Recorder(page)
  await rec.frame(1000)
  for (const name of ['Rectangle', 'Star', 'Wavy', 'Hexagon', 'Circle', 'Ellipse', 'Oval', 'Seal', 'Gift tag']) {
    await spotlight(page, 'button.preset', name)
    await click(page, 'button.preset', name)
    await rec.frame(1000)
  }
  rec.save('presets.gif')
  await page.close()
}

/** Sweep the clip, switch end styles, then turn the tag into a star. */
async function shapes(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Shape')
  const rec = new Recorder(page)
  await rec.frame(700)
  const sweep = async (label: string, values: number[], delay = 70) => {
    await spotRow(page, label)
    for (const v of values) {
      await setNumber(page, 'Shape', label, Number(v.toFixed(3)))
      await rec.frame(delay)
    }
    rec.hold(600)
  }
  await sweep('Clip', [...steps(0.5, 0.1, 6).slice(1), ...steps(0.1, 0.75, 10).slice(1)])
  await spotRow(page, 'End')
  for (const end of ['rounded', 'square']) {
    await choose(page, 'Shape', 'End', end)
    await rec.frame(1100)
  }
  await spotRow(page, 'Base shape')
  await choose(page, 'Shape', 'Base shape', 'star')
  await rec.frame(1100)
  await sweep('Points', [6, 7, 8, 9, 10], 260)
  await sweep('Depth', steps(0.5, 0.8, 8).slice(1))
  rec.save('shapes.gif')
  await page.close()
}

/** Drag the hole along the tag, then resize it by its edge dot. */
async function hole(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Hole')
  const rec = new Recorder(page)
  await rec.frame(800)
  await spotRow(page, 'From end')
  // End up farther along the tag than it started, so growing it stays clear of the 1/8" wall.
  await drag(page, rec, await centerOf(page, '#preview circle.hit'), [
    [90, 0],
    [-50, 0],
  ])
  await spotRow(page, 'Diameter')
  await drag(page, rec, await centerOf(page, '#preview circle.handle'), [
    [10, 0],
    [-6, 0],
  ])
  rec.hold(800)
  rec.save('hole.gif')
  await page.close()
}

/** Edit the outline as bezier points: move a point, then bend a curve with a handle. */
async function editPoints(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  const rec = new Recorder(page)
  await rec.frame(700)
  await spotlight(page, '#controls button', 'Edit points')
  await click(page, '#controls button', 'Edit points')
  await rec.frame(1000)
  await unspot(page)
  // The far end's top corner, and the handle leaving it along the top edge.
  const pick = (kind: 'anchor' | 'handle') =>
    page.evaluate((kind) => {
      const sel = kind === 'anchor' ? '#preview rect.bz-hit' : '#preview circle.bz-hit'
      const els = [...document.querySelectorAll<SVGGraphicsElement>(sel)]
      const score = (e: SVGGraphicsElement) => {
        const r = e.getBoundingClientRect()
        return kind === 'anchor' ? r.x - r.y : r.x - 3 * r.y
      }
      return els.indexOf(els.reduce((a, b) => (score(b) > score(a) ? b : a)))
    }, kind)
  await drag(page, rec, await centerOf(page, '#preview rect.bz-hit', await pick('anchor')), [[40, -30]])
  await drag(page, rec, await centerOf(page, '#preview circle.bz-hit', await pick('handle')), [[-60, -40]])
  await spotlight(page, '#controls button', 'Done editing')
  await click(page, '#controls button', 'Done editing')
  await rec.frame(1400)
  rec.save('edit-points.gif')
  await page.close()
}

/** Switch to the sheet, then change the paper, the gap and the count. */
async function sheet(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  const rec = new Recorder(page)
  await rec.frame(700)
  await spotlight(page, '#view button', 'Sheet')
  await click(page, '#view button', 'Sheet')
  await rec.frame(1300)
  await scrollTo(page, 'Sheet')
  await spotRow(page, 'Size')
  await choose(page, 'Sheet', 'Size', 'a4')
  await rec.frame(1100)
  await choose(page, 'Sheet', 'Size', 'custom')
  // Custom adds Width and Height rows; scroll again so Count and the summary stay in view.
  await scrollTo(page, 'Sheet')
  await spotRow(page, 'Size')
  await rec.frame(800)
  await spotRow(page, 'Height')
  for (const v of steps(11, 5, 6).slice(1)) {
    await setNumber(page, 'Sheet', 'Height', v)
    await rec.frame(260)
  }
  rec.hold(600)
  await spotRow(page, 'Gap')
  for (const v of [0.25, 0.375, 0.5]) {
    await setNumber(page, 'Sheet', 'Gap', v)
    await rec.frame(500)
  }
  await setNumber(page, 'Sheet', 'Gap', 0.125)
  await rec.frame(800)
  await spotRow(page, 'Count')
  await setNumber(page, 'Sheet', 'Count', 4)
  await rec.frame(1300)
  await setNumber(page, 'Sheet', 'Count', '')
  await rec.frame(1200)
  rec.save('sheet.gif')
  await page.close()
}

/** Turn on a section whose heading is a checkbox. */
async function toggleOn(page: Page, title: string) {
  await spotlight(page, '#controls section h2', title)
  await apply(page, () => sectionOf(page, title).locator('h2 input').check())
}

/** Type into the text area a few letters at a time, recording as it goes. */
async function typeText(page: Page, rec: Recorder, text: string) {
  for (let i = 3; i < text.length + 3; i += 3) {
    await apply(page, () =>
      page.locator('#text-content').evaluate((el: HTMLTextAreaElement, v) => {
        el.value = v
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }, text.slice(0, i)),
    )
    await rec.frame(90)
  }
  await apply(page, () => page.locator('#text-content').dispatchEvent('change'))
}

/** Turn on text, type it, pick a font, then resize, move and turn its box. */
async function text(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Text')
  const rec = new Recorder(page)
  await rec.frame(700)
  await toggleOn(page, 'Text')
  await page.waitForTimeout(300)
  await rec.frame(900)
  await spotlight(page, '#text-content', '')
  await page.locator('#text-content').evaluate((el: HTMLTextAreaElement) => {
    el.value = ''
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await typeText(page, rec, 'Happy Birthday,\nAvery!')
  rec.hold(700)
  await spotRow(page, 'Font')
  for (const font of ['EMS Allure', 'Hershey Serif']) {
    await choose(page, 'Text', 'Font', font)
    await page.waitForTimeout(300)
    await rec.frame(1100)
  }
  await unspot(page)
  await drag(page, rec, await centerOf(page, '#preview .box-handle.se'), [[-40, -20]])
  await drag(page, rec, await centerOf(page, '#preview rect.textbox'), [[30, 18]])
  await spotRow(page, 'Rotation')
  await drag(page, rec, await centerOf(page, '#preview .turn-handle'), [[-45, 6]], 8)
  rec.hold(1000)
  rec.save('text.gif')
  await page.close()
}

/** Turn on the border, then try each line style, weight and a wider inset. */
async function border(browser: Browser) {
  const page = await open(browser, ANIM_VIEWPORT)
  await scrollTo(page, 'Border')
  const rec = new Recorder(page)
  await rec.frame(700)
  await toggleOn(page, 'Border')
  await rec.frame(1000)
  await spotRow(page, 'Line')
  for (const style of ['dashed', 'dotted', 'double']) {
    await choose(page, 'Border', 'Line', style)
    await rec.frame(1000)
  }
  await spotRow(page, 'Weight')
  for (const weight of ['2', '3']) {
    await choose(page, 'Border', 'Weight', weight)
    await rec.frame(1000)
  }
  await spotRow(page, 'Inset')
  for (const inset of [0.15, 0.2, 0.25]) {
    await setNumber(page, 'Border', 'Inset', inset)
    await rec.frame(400)
  }
  rec.hold(700)
  await setNumber(page, 'Border', 'Inset', 0.125)
  await choose(page, 'Border', 'Weight', '1')
  await choose(page, 'Border', 'Line', 'solid')
  await rec.frame(1200)
  rec.save('border.gif')
  await page.close()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'warn' })
  await server.listen()
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
  try {
    const only = process.argv.slice(2)
    const shots = { overview, presets, shapes, hole, editPoints, text, border, sheet }
    for (const [name, shot] of Object.entries(shots)) if (!only.length || only.includes(name)) await shot(browser)
  } finally {
    await browser.close()
    await server.close()
  }
  console.log(`Written to ${OUT}/`)
}

await main()
