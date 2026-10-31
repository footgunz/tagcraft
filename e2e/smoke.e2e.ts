/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

// The shipped app: one self-contained file, opened from disk.
const APP = new URL('../dist/tagcraft.html', import.meta.url).href

const section = (page: Page, title: string) => page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })

async function downloaded(page: Page, click: () => Promise<void>): Promise<{ name: string; svg: string }> {
  const [download]: [Download, void] = await Promise.all([page.waitForEvent('download'), click()])
  return { name: download.suggestedFilename(), svg: await readFile(await download.path(), 'utf8') }
}

/** Number fields commit on change, so type the value and leave the field. */
async function setNumber(page: Page, sectionTitle: string, label: string, value: string) {
  const input = section(page, sectionTitle).getByLabel(label)
  await input.fill(value)
  await input.blur()
}

let errors: string[]

test.beforeEach(async ({ page }) => {
  errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(APP)
})

test.afterEach(() => expect(errors).toEqual([]))

test('opens on the gift tag', async ({ page }) => {
  await expect(page.getByRole('img', { name: 'Gift tag tag preview' })).toBeVisible()
  await expect(page.locator('#preview .dim').first()).toHaveText('3.00 in')
  await expect(page.locator('#status')).toContainText('Drag the hole')
})

test('shows which build it is', async ({ page }) => {
  await expect(page.locator('.brand .version')).toHaveText(/^(v\d+\.\d+\.\d+.*|[0-9a-f]{7,}.*|dev)$/)
})

test('Save appears once the preset is changed', async ({ page }) => {
  await expect(section(page, 'Save')).toHaveCount(0)
  await setNumber(page, 'Shape', 'Width', '3.5')
  await expect(section(page, 'Save')).toBeVisible()
  await page.getByTitle('Load the Gift tag preset').click()
  await expect(section(page, 'Save')).toHaveCount(0)
})

test('downloads one tag at true size', async ({ page }) => {
  const { name, svg } = await downloaded(page, () => page.getByRole('button', { name: 'Download SVG' }).click())
  expect(name).toBe('tagcraft-gift-tag.svg')
  expect(svg).toContain('width="3in" height="1.5in"')
  expect(svg.match(/<path /g)).toHaveLength(1)
})

test('dragging the hole moves it and updates the field', async ({ page }) => {
  const field = section(page, 'Hole').getByLabel('From end')
  const before = await field.inputValue()
  const box = (await page.locator('#preview circle.hit').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(field).not.toHaveValue(before)
  expect(Number(await field.inputValue())).toBeGreaterThan(Number(before))
})

test('sheet view lays out 15 gift tags on Letter and downloads the sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(page.locator('#preview path.tag')).toHaveCount(15)
  await expect(page.locator('.sheet-summary')).toHaveText('15 tags fit · 15 turned')
  const { name, svg } = await downloaded(page, () => page.getByRole('button', { name: 'Download sheet SVG' }).click())
  expect(name).toBe('tagcraft-gift-tag-letter-15up.svg')
  expect(svg).toContain('width="8.5in" height="11in"')
  expect(svg.match(/<path /g)).toHaveLength(15)
  expect(svg).not.toContain('transform')
})

test('a sheet too small for the tag disables export', async ({ page }) => {
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await section(page, 'Sheet').getByLabel('Size').selectOption('custom')
  await setNumber(page, 'Sheet', 'Width', '1.5')
  await expect(page.locator('.sheet-summary')).toHaveText("The tag doesn't fit on this sheet, even turned")
  await expect(page.locator('#preview path.tag')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Download sheet SVG' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Copy sheet SVG' })).toBeDisabled()
})

test('the Sheet section only shows in Sheet view', async ({ page }) => {
  await expect(section(page, 'Sheet')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(section(page, 'Sheet')).toBeVisible()
  await page.getByRole('button', { name: 'Tag', exact: true }).click()
  await expect(section(page, 'Sheet')).toHaveCount(0)
})

test('sheet settings survive a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await setNumber(page, 'Sheet', 'Count', '4')
  await expect(page.locator('.sheet-summary')).toHaveText('Cutting 4 of 15 · 4 turned')
  await page.reload()
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(section(page, 'Sheet').getByLabel('Count')).toHaveValue('4')
  await expect(page.locator('#preview path.tag')).toHaveCount(4)
})

test('a count goes back to all that fit, by the All button or stepping below 1', async ({ page }) => {
  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  const count = section(page, 'Sheet').getByLabel('Count')
  await expect(count).toHaveAttribute('placeholder', 'All that fit (15)')
  await expect(section(page, 'Sheet').getByRole('button', { name: 'All' })).toHaveCount(0)

  await setNumber(page, 'Sheet', 'Count', '3')
  await expect(page.locator('.sheet-summary')).toHaveText('Cutting 3 of 15 · 3 turned')
  await section(page, 'Sheet').getByRole('button', { name: 'All' }).click()
  await expect(page.locator('.sheet-summary')).toHaveText('15 tags fit · 15 turned')
  await expect(section(page, 'Sheet').getByLabel('Count')).toHaveValue('')

  await setNumber(page, 'Sheet', 'Count', '1')
  const one = section(page, 'Sheet').getByLabel('Count')
  await one.focus()
  await page.keyboard.press('ArrowDown')
  await one.blur()
  await expect(page.locator('.sheet-summary')).toHaveText('15 tags fit · 15 turned')
  await expect(section(page, 'Sheet').getByLabel('Count')).toHaveValue('')

  // From empty, the up arrow starts counting at 1.
  const empty = section(page, 'Sheet').getByLabel('Count')
  await empty.focus()
  await page.keyboard.press('ArrowUp')
  await empty.blur()
  await expect(page.locator('.sheet-summary')).toHaveText('Cutting 1 of 15 · 1 turned')
})

test('a deboss border shows on the preview and exports as its own layer', async ({ page }) => {
  const border = section(page, 'Border')
  await expect(page.locator('#preview path.border')).toHaveCount(0)
  await border.getByRole('checkbox').check()
  await expect(page.locator('#preview path.border')).toHaveCount(1)
  await expect(section(page, 'Save')).toBeVisible()

  await border.getByLabel('Line').selectOption('dashed')
  await border.getByLabel('Weight').selectOption('2')
  const { svg } = await downloaded(page, () => page.getByRole('button', { name: 'Download SVG' }).click())
  expect(svg).toContain('inkscape:label="Border"')
  expect(svg).toMatch(/<path id="border" d="M[^"]+" fill="none"/)

  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(page.locator('#preview path.border')).toHaveCount(15)
  const sheet = await downloaded(page, () => page.getByRole('button', { name: 'Download sheet SVG' }).click())
  expect(sheet.svg.match(/<path id="border-/g)).toHaveLength(15)
})

test('a border too big for the tag warns and stays out of the export', async ({ page }) => {
  await section(page, 'Border').getByRole('checkbox').check()
  await setNumber(page, 'Border', 'Inset', '1')
  await expect(page.locator('#status')).toContainText('border inset is too big')
  await expect(page.locator('#preview path.border')).toHaveCount(0)
  const { svg } = await downloaded(page, () => page.getByRole('button', { name: 'Download SVG' }).click())
  expect(svg).not.toContain('Border')
})

test('text: type it, move and resize its box, and export it as its own layer', async ({ page }) => {
  const text = section(page, 'Text')
  await text.getByRole('checkbox').check()
  await expect(page.locator('#preview path.text')).toHaveCount(1)
  await expect(page.locator('#preview rect.textbox')).toHaveCount(1)
  await expect(page.locator('#preview .box-handle')).toHaveCount(8)

  // Typing redraws the preview without losing the caret.
  const area = page.locator('#text-content')
  await area.click()
  await area.press('Control+End')
  await area.pressSequentially(' Love, Sam')
  await expect(area).toBeFocused()
  const before = await page.locator('#preview path.text').getAttribute('d')
  expect(before!.split('M').length).toBeGreaterThan(30)

  // Resize from the bottom-right handle, then move from inside.
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tagcraft:current')!).text.box)
  const box0 = await stored()
  const handle = (await page.locator('#preview .box-handle.se').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 60, handle.y - 30, { steps: 4 })
  await page.mouse.up()
  const box1 = await stored()
  expect(box1.w).toBeLessThan(box0.w)
  expect(box1.h).toBeLessThan(box0.h)
  const inside = (await page.locator('#preview rect.textbox').boundingBox())!
  await page.mouse.move(inside.x + inside.width / 2, inside.y + inside.height / 2)
  await page.mouse.down()
  await page.mouse.move(inside.x + inside.width / 2 + 25, inside.y + inside.height / 2 + 10, { steps: 4 })
  await page.mouse.up()
  const box2 = await stored()
  expect(box2.x).toBeGreaterThan(box1.x)
  expect(box2.w).toBeCloseTo(box1.w, 6)

  // Another font redraws the text.
  await page.locator('#text-font').selectOption('EMS Tech')
  await expect(page.locator('#preview path.text')).not.toHaveAttribute('d', before!)

  const { svg } = await downloaded(page, () => page.getByRole('button', { name: 'Download SVG' }).click())
  expect(svg).toContain('inkscape:label="Text"')
  expect(svg).toMatch(/<path id="text" d="M[^"]+" fill="none"/)
  expect(svg).not.toContain('textbox')

  await page.getByRole('button', { name: 'Sheet', exact: true }).click()
  await expect(page.locator('#preview path.text')).toHaveCount(15)
  const sheet = await downloaded(page, () => page.getByRole('button', { name: 'Download sheet SVG' }).click())
  expect(sheet.svg.match(/<path id="text-/g)).toHaveLength(15)
})

test('a text box over the hole warns', async ({ page }) => {
  await section(page, 'Text').getByRole('checkbox').check()
  const inside = (await page.locator('#preview rect.textbox').boundingBox())!
  await page.mouse.move(inside.x + inside.width / 2, inside.y + inside.height / 2)
  await page.mouse.down()
  await page.mouse.move(inside.x - 200, inside.y + inside.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(page.locator('#status')).toContainText('text box overlaps the hole')
})
