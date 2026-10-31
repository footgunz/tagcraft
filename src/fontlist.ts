import { DEFAULT_FONT } from './design'
import { parseSvgFont, readFont, type Font } from './fonts'

// ---------------------------------------------------------------------------
// Fonts: everything in src/fonts (open-licensed single-line SVG fonts, always
// bundled) and src/fonts-private (personal use, left out of
// `npm run build:public`) is listed automatically, named after the file; more
// can be added for the session.
// ---------------------------------------------------------------------------

const bundledFiles = import.meta.glob('./fonts/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

// A lazy glob inside a branch that is constant-folded away in the public build,
// so private font files never make it into that bundle.
const privateFiles = (
  import.meta.env.MODE === 'public' ? {} : import.meta.glob('./fonts-private/*.{svg,ttf,otf,woff,SVG,TTF,OTF,WOFF}', { query: '?url', import: 'default' })
) as Record<string, () => Promise<string>>

// License files that ship with the fonts, named "<font name>-<anything>.txt".
const bundledLicenses = import.meta.glob('./fonts/licenses/*.txt', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const privateLicenses = (
  import.meta.env.MODE === 'public' ? {} : import.meta.glob('./fonts-private/licenses/*.txt', { eager: true, query: '?raw', import: 'default' })
) as Record<string, string>

export { DEFAULT_FONT }

export type FontGroup = 'bundled' | 'private' | 'added'

export const GROUP_LABELS: Record<FontGroup, string> = {
  bundled: 'Single-line fonts (for pens)',
  private: 'Your fonts',
  added: 'Added this session',
}

export interface FontEntry {
  name: string
  group: FontGroup
  /** Single-line fonts draw cleanly with a pen; outline fonts draw as hollow letters. */
  singleLine: boolean
}

const fileName = (path: string) => path.split('/').pop()!
const baseName = (path: string) => fileName(path).replace(/\.\w+$/, '')

const entries = new Map<string, FontEntry>()
const loaders = new Map<string, () => Promise<Font>>()
const loaded = new Map<string, Font>()
const licenses = new Map<string, string>()

for (const [path, text] of Object.entries(bundledFiles)) {
  const name = baseName(path)
  entries.set(name, { name, group: 'bundled', singleLine: true })
  loaders.set(name, async () => parseSvgFont(text, name))
}
for (const [path, url] of Object.entries(privateFiles)) {
  const name = baseName(path)
  if (entries.has(name)) continue
  entries.set(name, { name, group: 'private', singleLine: /\.svg$/i.test(path) })
  loaders.set(name, async () => readFont(fileName(path), await (await fetch(await url())).arrayBuffer()))
}
const licenseOf = (path: string) => fileName(path).replace(/-[^-]*\.txt$/i, '')
for (const [path, text] of [...Object.entries(bundledLicenses), ...Object.entries(privateLicenses)]) licenses.set(licenseOf(path), text)

/** Every font: bundled single-line fonts first, then private ones, then this session's uploads, each by name. */
export function fontEntries(): FontEntry[] {
  const order: FontGroup[] = ['bundled', 'private', 'added']
  return [...entries.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name))
}

/** The license shipped with a font, if any. */
export function licenseFor(name: string): string | null {
  return licenses.get(name) ?? null
}

/** The font to use for a name, and whether it had to fall back to the default. */
export function resolveFont(name: string): { name: string; fellBack: boolean } {
  return entries.has(name) ? { name, fellBack: false } : { name: DEFAULT_FONT, fellBack: true }
}

/** Load a font by name (falling back to the default), once. */
export async function loadFont(name: string): Promise<Font> {
  const use = resolveFont(name).name
  let font = loaded.get(use)
  if (!font) {
    font = await loaders.get(use)!()
    loaded.set(use, font)
  }
  return font
}

/** A font already loaded, for drawing without waiting. */
export function loadedFont(name: string): Font | undefined {
  return loaded.get(resolveFont(name).name)
}

/**
 * Add an uploaded font (.ttf, .otf, .woff, or an .svg single-line font) for
 * this session. Throws if the file can't be read as a font.
 */
export function addFont(file: string, bytes: ArrayBuffer): FontEntry {
  const font = readFont(file, bytes)
  const existing = entries.get(font.name)
  const entry: FontEntry = { name: font.name, group: existing?.group ?? 'added', singleLine: font.singleLine }
  entries.set(font.name, entry)
  loaded.set(font.name, font)
  loaders.set(font.name, async () => font)
  return entry
}
