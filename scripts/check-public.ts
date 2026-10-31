/**
 * Check that the public build never contains private fonts.
 *
 *   node scripts/check-public.ts
 *
 * Puts a throwaway font in src/fonts-private, builds both variants, and checks
 * it's in the personal build and absent from the public one. The throwaway
 * font is removed afterwards either way.
 */
import { execSync } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync } from 'node:fs'

const PROBE = 'zz-public-check'
const probe = `src/fonts-private/${PROBE}.svg`

copyFileSync('src/fonts/EMS Tech.svg', probe)
try {
  execSync('npx vite build --logLevel error', { stdio: 'inherit' })
  execSync('npx vite build --mode public --logLevel error', { stdio: 'inherit' })
  const personal = readFileSync('dist/tagcraft.html', 'utf8')
  const shared = readFileSync('dist/tagcraft-public.html', 'utf8')
  if (!personal.includes(PROBE)) throw new Error('The personal build should include private fonts, but the probe font is missing.')
  if (shared.includes(PROBE) || shared.includes('fonts-private')) throw new Error('The public build contains a private font.')
  console.log('OK: private fonts are in the personal build and left out of the public build.')
} finally {
  rmSync(probe, { force: true })
}
