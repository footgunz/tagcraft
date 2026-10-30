# Tagcraft design

## Intent

Tagcraft is a browser app for making simple geometric gift tags and exporting
each tag as a cut-ready SVG for a vinyl/paper cutter (Cricut and similar).

The motivating case: a 3" × 1.5" tag tied to a small gift bag. It is a
rectangle with the two corners at the hole end clipped off at 45°, which makes
a hexagon with a square far end and a round hole near the clipped end.

Tagcraft is a sibling of `../glyphcraft` (layered text logos to cut-ready SVG)
and should look, build and ship the same way.

## Goals

- Pick a tag from presets and get a correct, cut-ready SVG in a few clicks.
- Shape the tag with settings on a base shape: size, end style, clip size,
  corner rounding, and shape-specific settings.
- Configure the hole's size and position, both with numeric fields and by
  dragging and resizing it on the preview.
- Fine-tune a shape with bezier point and handle editing.
- Save custom designs in the browser, reload them, and delete them.
- Export exactly one tag per SVG at true physical size.

## Non-goals (for now, likely follow-ups)

- **Text on the tag.** A text layer is a planned follow-up. Keep the tag model
  open to extra layers (for example, a list of layers or a separate `text`
  field later) without building it now.
- **Fill a sheet.** Laying out N copies to fill a given sheet/mat size is a
  planned follow-up. Keep shape generation a pure function of the design so it
  can be stamped repeatedly later.
- Hole shapes other than round, off-center holes, multiple holes, and
  reinforcement rings.
- PNG export (the output is for cutting).

## Anti-goals

- An SVG that imports at the wrong physical size, or with the hole as a
  separate loose piece that does not cut out of the tag.
- Faceted (polygon-approximated) curves where the shape should be smooth;
  rounded corners and the hole should cut as smooth curves.
- A different stack, look, or build story from Glyphcraft.
- Any AI attribution or co-author lines anywhere (commits, PRs, docs, UI).

## Constraints

- Same stack as Glyphcraft: Vite + TypeScript, plain DOM (no UI framework),
  `vite-plugin-singlefile` so `npm run build` writes one self-contained
  `dist/tagcraft.html` that opens from disk with no server.
- Same layout language as Glyphcraft: a 340px settings panel on the left, the
  stage on the right with a toolbar above the preview. Reuse Glyphcraft's
  `style.css` tokens and conventions as the starting point.
- AGPL-3.0 (LICENSE already present), same README shape (try it, quick start,
  develop, build, license in plain English), a `docs/` usage guide including a
  Cricut workflow page, and a GitHub Pages and release workflow modeled on
  Glyphcraft's `.github/workflows/pages.yml`.
- Runs entirely in the browser; nothing is uploaded.

## What was decided

### Layout (layout A, chosen from mockups)

Left panel, top to bottom:

1. **Presets:** a grid of thumbnails (nine built-ins). Built-in presets first, then the user's
   saved designs. Clicking one loads it.
2. **Shape:** base shape picker, width, height, then the settings for that base
   shape.
3. **Hole:** diameter and distance from the hole end.
4. **Edit points…** button for bezier mode.
5. **Save design** (name it) for saving custom designs.

Right side: toolbar with **Download SVG** and **Copy SVG**, then the preview,
then a status/hint line ("Drag the hole to move it · drag its edge dot to
resize").

### Base shapes and their settings

All base shapes have width and height. "Hole end" is the end where the hole
sits.

| Base shape | Settings |
| --- | --- |
| Rectangle | Hole end style: square, clipped, or rounded. Clip size (clipped). Corner rounding (applies to all corners). |
| Polygon | Number of sides. Corner rounding. |
| Star | Number of points, point depth (inner radius as a fraction of outer). Corner rounding. |
| Wavy | Number of waves and wave height along the long edges, with straight short ends. Hole end style as for rectangle. |
| Ellipse | None beyond width and height. With proportions locked it is a circle. |
| Oval | None beyond width and height: straight long sides with fully round ends (a stadium). *(My call: "oval" and "ellipse" are kept distinct this way.)* |

"Rounded" hole end on a rectangle means a full semicircle across the height.

*(Builder's-check call)* Polygons and stars are always point-up. Their width
and height are independent and stretch the shape, with a **Lock proportions**
toggle that is on by default (which keeps them regular). Corner rounding is
applied after scaling, so the corners stay circular.

### Built-in presets

- **Gift tag:** rectangle, 3" × 1.5", clipped hole end, 0.5" clip, small
  rounding, 0.25" hole. This is the motivating tag.
- **Rectangle:** rectangle, square ends.
- **Star:** 5-point star.
- **Wavy:** wavy long edges.
- **Hexagon:** polygon, 6 sides.
- **Circle:** ellipse with proportions locked, 2" across.
- **Ellipse:** ellipse, 3" × 1.75".
- **Oval:** oval (stadium), 3" × 1.5".
- **Seal:** star with many shallow points (36 points, depth 0.88), 2.5" across,
  like a certificate seal.

Ellipse and oval tags have the hole end on the left, like rectangles. A circle
uses the same horizontal axis. Star point counts go up to 60 so a seal can be
made.

### Hole

- Round only, centered across the tag (on the tag's axis).
- Its position is the distance from the hole end, and its size is its diameter.
  *(Builder's-check call)* The distance is measured from the outermost point of
  the hole end (x = 0 for the gift tag's clipped tip) to the **center** of the
  hole. Gift tag default: 0.35".
- On the preview: drag the hole to slide it along the axis, and drag a handle
  dot on its edge to resize it. The numeric fields and the canvas stay in sync.
- The hole end is the left end for horizontal shapes. For polygon and star,
  the hole sits near the top point/vertex, on the vertical axis, measured down
  from the top.
- The hole cannot be dragged or sized outside the tag. A minimum wall (about
  1/8") of material always remains around it. *(Builder's-check call)* The
  design state never holds an invalid hole: dragging, typed values, and shape
  changes (smaller height, more sides, deeper star points) all clamp the hole,
  moving it first and then shrinking it, and a status-line note says it was
  adjusted. Because the state is always valid, export never has to be blocked.

### Bezier editing ("Edit points…")

- Converts the current shape (outline only, not the hole) to editable cubic
  bezier nodes. Dragging a node moves it, and dragging its handles bends the
  curves.
- One-way per design: once points are edited, the shape settings are disabled
  for that design. A **Reset to shape** button throws away point edits and
  returns to the settings-driven shape.
- Width/height still scale an edited shape. The hole stays editable.
- After point edits, the hole stays on the axis: the centerline of the edited
  outline's bounding box, with the hole end at the bounding box's hole-end side.
  It slides along that axis exactly as before. Node edits are never blocked. If
  the edited outline comes within the minimum wall of the hole, or crosses it,
  the status line shows a warning and the preview highlights the problem. A
  sampled distance check against the flattened outline is enough. This is the
  one case where the design can be saved and exported with a too-thin wall,
  after a warning. *(The axis choice is the user's; the warning-only
  behavior is the user's lean, as offered.)*

### Units

Inches by default, with a unit switch to mm. Values are stored internally in
mm. The preview labels the tag's width and height.

### Saved designs

- **Save design** asks for a name and stores the full design (base shape,
  settings, hole, edited points if any) in `localStorage`.
- Saved designs appear after the built-in presets in the preset grid, with
  their own thumbnails. Each one has a remove (×) control that asks for
  confirmation. Built-in presets cannot be removed.
- The app also remembers the current design between visits.
- All storage access is wrapped so the app still works if storage is
  unavailable (saving is simply disabled with a status message).

### Export

- One tag per SVG, at true physical size: `width`/`height` in `in` or `mm`
  (matching the unit switch), with a `viewBox` in mm.
- Inkscape-flavored like Glyphcraft: the `inkscape` namespace and the tag in a
  layer group (`inkscape:groupmode="layer"`, label "Tag").
- The tag is a single `<path>`: the outline plus the hole as a subpath, with
  `fill-rule="evenodd"`, so the cutter treats the hole as cut out of the tag.
- Curves are kept as real SVG curves (cubic beziers, with arcs converted to
  beziers), not flattened to polygons.
- Filename: `tagcraft-<design name or base shape>.svg`.

## Left to the builder

- Module layout (Glyphcraft splits into `main.ts`, `geometry.ts`, `render.ts`;
  something similar is expected: shape generation, SVG export, UI, storage).
- Exact default numbers for presets other than the gift tag, the slider/field
  ranges, and the clamp margins.
- How corner rounding is implemented per shape, as long as the result is
  smooth curves.
- Whether bezier mode supports adding or removing nodes (nice to have, not
  required).
- Whether a geometry library is needed; Glyphcraft uses `clipper-lib`, but a
  single outline plus a hole subpath may not need one.
- Tests for the pure geometry and SVG export code (Vitest fits the stack).
