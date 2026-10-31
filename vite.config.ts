import { execSync } from 'node:child_process'
import { renameSync, writeFileSync } from 'node:fs'
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
 * Write dist/version.json next to the app. The published app fetches it,
 * bypassing caches, to notice it's an older copy and load the new release.
 */
function versionFile(version: string): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    closeBundle() {
      writeFileSync('dist/version.json', JSON.stringify({ version }) + '\n')
    },
  }
}

/**
 * The version shown in the app: the release tag when the release workflow sets
 * TAGCRAFT_VERSION, otherwise `git describe` (e.g. v0.0.3-3-gbdac605), otherwise
 * "dev". No --dirty suffix: the label is shown to people, and "dirty" reads badly.
 */
function appVersion(): string {
  if (process.env.TAGCRAFT_VERSION) return process.env.TAGCRAFT_VERSION
  try {
    return execSync('git describe --tags --always', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

const version = appVersion()

export default defineConfig(({ mode }) => ({
  server: { port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Keep the other build's file when building one of the two variants.
  build: { emptyOutDir: false },
  // Everything, fonts included, is inlined into one HTML file that opens
  // straight from disk. `--mode public` leaves out src/fonts-private so the
  // file is safe to share.
  plugins: [viteSingleFile(), renameOutput(mode === 'public' ? 'tagcraft-public.html' : 'tagcraft.html'), versionFile(version)],
}))
