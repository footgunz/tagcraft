import { execSync } from 'node:child_process'
import { renameSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Name the single-file build something worth sharing instead of index.html. */
function renameOutput(name: string): Plugin {
  return {
    name: 'rename-output',
    apply: 'build',
    closeBundle() {
      renameSync('dist/index.html', `dist/${name}`)
    },
  }
}

/**
 * The version shown in the app: the release tag when the release workflow sets
 * TAGCRAFT_VERSION, otherwise `git describe` (e.g. v0.0.3-3-gbdac605, or with
 * -dirty for uncommitted changes), otherwise "dev".
 */
function appVersion(): string {
  if (process.env.TAGCRAFT_VERSION) return process.env.TAGCRAFT_VERSION
  try {
    return execSync('git describe --tags --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  server: { port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Everything is inlined into one HTML file that opens straight from disk.
  plugins: [viteSingleFile(), renameOutput('tagcraft.html')],
})
