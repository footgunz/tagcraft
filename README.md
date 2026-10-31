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

Type-checks, then writes `dist/tagcraft.html`, including your private fonts (see [Fonts](#fonts)). Rebuild after changing code; `dist/` is not committed.

```bash
npm run build:public
```

Writes `dist/tagcraft-public.html` with the open-licensed fonts only, safe to share. Releases publish this one. `npm run check:public` confirms a public build never picks up private fonts.

The app shows its version in small text next to **Source code**, so you can tell builds apart. A release build shows the release's tag (for example `v0.0.4`, linking to its release notes); any other build shows `git describe`, for example `v0.0.3-3-gbdac605` (three commits after `v0.0.3`). Set `TAGCRAFT_VERSION` to override it.

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

## Fonts

Text on a tag is drawn with a cutter's pen, so the bundled fonts are **single-line** ("stroke") fonts: the pen traces each letter once. Ordinary outline fonts (TTF, OTF, WOFF) work too, but a pen draws them as hollow, outlined letters.

Fonts live in two folders and appear in the font list automatically, named after the file:

| Folder | What goes there | Included in |
| --- | --- | --- |
| `src/fonts/` | Open-licensed single-line SVG fonts that may be redistributed | Both builds |
| `src/fonts-private/` | Personal-use fonts (`.ttf`, `.otf`, `.woff`, or single-line `.svg`), ignored by git | `npm run build` and dev only |

Put a font's license in the matching `licenses/` folder, named `<font file name>-<anything>.txt` (for example `EMS Tech-OFL.txt`); the app shows it under **About this font**. Fonts can also be added in the app for the current session.

Bundled fonts and where they come from:

| Font | Style | License | Source |
| --- | --- | --- | --- |
| Relief SingleLine (default) | Sans | SIL OFL 1.1 | [isdat-type/Relief-SingleLine](https://github.com/isdat-type/Relief-SingleLine) |
| EMS Readability | Light sans | SIL OFL 1.1 | [Inkscape Hershey Text fonts](https://gitlab.com/inkscape/extensions/-/tree/master/svg_fonts) |
| EMS Allure | Script | SIL OFL 1.1 | same |
| EMS Tech | Technical | SIL OFL 1.1 | same |
| Hershey Serif | Serif | Hershey Fonts license | same |
| Hershey Script | Script | Hershey Fonts license | same |

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
