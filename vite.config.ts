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

export default defineConfig({
  server: { port: 5173 },
  // Everything is inlined into one HTML file that opens straight from disk.
  plugins: [viteSingleFile(), renameOutput('tagcraft.html')],
})
