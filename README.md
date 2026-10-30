# Tagcraft

**[Try it: footgunz.github.io/tagcraft](https://footgunz.github.io/tagcraft/)** · [How to use it](docs/README.md)

Design simple geometric gift tags and export each one as a **cut-ready SVG** at true size, for Cricut and other cutters.

Pick a preset (a 3" × 1.5" gift tag, a star, a seal, and more), tweak the size and shape, place the hole by dragging it, then download. The SVG is a single closed shape with the hole cut out of it, drawn with real curves, so it imports at the right size into Cricut Design Space or any other cutter software. The [docs](docs/README.md) walk through every control and the cutting workflow.

## License, in plain English

**The code** is under the [GNU AGPL v3](LICENSE). Use it, change it, share it, host it for your friends. The one rule: if you run a modified version for other people, especially as a website, you have to share your source code with them under the same license. So nobody gets to take Tagcraft, lock it behind a paywall and keep the code to themselves.

**Your designs are yours.** Anything you make with Tagcraft (tags, SVGs, the pieces you cut from them) belongs to you. Keep it, give it away, sell it. The AGPL covers this app's code, not what you create with it.

## Quick start

### Use it online

Open **[footgunz.github.io/tagcraft](https://footgunz.github.io/tagcraft/)**. It runs entirely in your browser; nothing is uploaded.

### Use it offline

Download **`tagcraft-<version>.html`** from the latest [release](https://github.com/footgunz/tagcraft/releases/latest) and open it in a browser. It's the same app as the website, in one file.

Or build it yourself (see below), then open **`dist/tagcraft.html`** in a browser (double-click it). It is a single self-contained file: no install, server or internet needed.

### Develop

Requires [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (current LTS recommended).

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Changes reload live.

### Build

```bash
npm run build
```

Type-checks, then writes `dist/tagcraft.html`. Rebuild after changing code; `dist/` is not committed.

### Test

```bash
npm test
```

Runs the geometry, hole, storage and SVG export tests with [Vitest](https://vitest.dev/).

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Runs browser smoke tests with [Playwright](https://playwright.dev/) against the built `dist/tagcraft.html`, opened from disk. Install Chromium once; rebuild before each run so the tests see your changes.

### Updating the guide images

The screenshot and animations in the [user guide](docs/guide.md) live in [`docs/assets/`](docs/assets/). After changing the UI, regenerate them with:

```bash
npm run docs:screenshots
```

Add shot names (for example `-- hole sheet`) to redo only those. It uses Playwright's Chromium (`npx playwright install chromium`); set `CHROME_PATH` to use another Chrome or Edge.

## How it works

| File | Role |
| --- | --- |
| `src/design.ts` | The design model, the nine built-in presets and input repair |
| `src/shapes.ts` | Builds each base shape's outline as cubic bezier nodes, and applies point edits |
| `src/contour.ts` | Bezier contour helpers: bounds, scaling, flattening and SVG path data |
| `src/hole.ts` | Hole position, the 1/8" minimum wall and clamping |
| `src/svg.ts` | Writes the SVG: one path, outline plus hole, in an Inkscape layer |
| `src/storage.ts` | Saved designs and the current design, in browser storage |
| `src/panel.ts`, `src/preview.ts`, `src/main.ts` | Controls, the draggable preview, and wiring |
| `vite.config.ts` | Builds everything into one HTML file |

All lengths are kept in millimeters internally and converted for display. The tag is written as a single `<path>` with `fill-rule="evenodd"`, so the hole is cut out of the tag rather than being a separate loose piece, and curves stay real cubic beziers instead of being flattened to polygons. The tag is placed in an Inkscape layer (`<g inkscape:groupmode="layer">`) labelled `Tag`.
