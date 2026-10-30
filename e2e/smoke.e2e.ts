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
