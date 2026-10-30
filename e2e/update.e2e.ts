/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// The built app served from a pretend site, so the update check runs as it does on GitHub Pages.
const SITE = 'http://tagcraft.test/'
const html = readFileSync(new URL('../dist/tagcraft.html', import.meta.url), 'utf8')
const built: string = JSON.parse(readFileSync(new URL('../dist/version.json', import.meta.url), 'utf8')).version

/** Serve the app, with version.json saying `live` is the published version. */
async function serve(page: Page, live: string) {
  await page.route(`${SITE}**`, (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/version.json') return route.fulfill({ json: { version: live } })
    return route.fulfill({ contentType: 'text/html', body: html })
  })
}

test('an older copy reloads once at the live version, without looping', async ({ page }) => {
  await serve(page, 'v99.0.0')
  const loads: string[] = []
  page.on('load', () => loads.push(page.url()))
  await page.goto(SITE)
  await expect(page).toHaveURL(`${SITE}?v=v99.0.0`)
  // The served file is still the old build: it must not keep reloading.
  await page.waitForTimeout(1000)
  expect(loads).toEqual([SITE, `${SITE}?v=v99.0.0`])
})

test('an up-to-date copy stays put', async ({ page }) => {
  await serve(page, built)
  await page.goto(SITE)
  await page.waitForTimeout(500)
  await expect(page).toHaveURL(SITE)
})

test('the ?v= address is tidied once the new version has loaded', async ({ page }) => {
  await serve(page, built)
  await page.goto(`${SITE}?v=${built}`)
  await expect(page).toHaveURL(SITE)
})
