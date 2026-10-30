/**
 * GitHub Pages lets browsers and its CDN keep the page for 10 minutes, and the
 * app is one inlined file, so a new release can hide behind a cached copy.
 * On load, the published app asks for version.json past every cache; if a
 * newer version is live it reloads once at a new address (?v=<version>),
 * which no cache has seen.
 */

/**
 * Where to go to load `latest`, or null to stay. Never sends the page back to a
 * version it already asked for, so a stale cache can't cause a reload loop.
 */
export function updateTarget(current: string, latest: unknown, href: string): string | null {
  if (typeof latest !== 'string' || !latest || latest === current) return null
  const url = new URL(href)
  if (url.searchParams.get('v') === latest) return null
  url.searchParams.set('v', latest)
  return url.href
}

/** The address without the ?v= this module added, once it's done its job. */
export function cleanedHref(current: string, href: string): string | null {
  const url = new URL(href)
  if (url.searchParams.get('v') !== current) return null
  url.searchParams.delete('v')
  return url.href
}

/** Only the served app can be stale; a copy opened from disk has no version.json. */
export async function checkForUpdate(current: string): Promise<void> {
  if (!/^https?:$/.test(location.protocol)) return
  const clean = cleanedHref(current, location.href)
  if (clean) history.replaceState(history.state, '', clean)
  try {
    const res = await fetch(new URL(`version.json?t=${Date.now()}`, location.href), { cache: 'no-store' })
    if (!res.ok) return
    const target = updateTarget(current, ((await res.json()) as { version?: unknown }).version, location.href)
    if (target) location.replace(target)
  } catch {
    // Offline, or hosted without version.json: keep running this version.
  }
}
