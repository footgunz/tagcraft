# Using Tagcraft

A walkthrough of the app, from picking a tag to downloading a file you can cut. Try it at **[footgunz.github.io/tagcraft](https://footgunz.github.io/tagcraft/)**.

Once your SVG is ready, see [Cutting with Cricut Design Space](cricut.md).

The left panel is the controls; the right side is a live preview with the tag's width and height labelled. Your current design is remembered in your browser between visits.

## 1. Pick a preset

**Preset** is a grid of thumbnails. Click one to load it. Your own saved designs appear after the built-in ones (see [Save your design](#6-save-your-design)).

| Preset | What it is |
| --- | --- |
| Gift tag | 3" × 1.5" rectangle with the two corners at the hole end clipped at 45° (0.5" clip), lightly rounded corners and a 0.25" hole. The starting point. |
| Rectangle | Square-ended rectangle |
| Star | 5-point star |
| Wavy | Rectangle with wavy long edges |
| Hexagon | Six-sided polygon |
| Circle | Ellipse with proportions locked, 2" across |
| Ellipse | 3" × 1.75" ellipse |
| Oval | 3" × 1.5" stadium: straight long sides, fully round ends |
| Seal | 36 shallow points, 2.5" across, like a certificate seal |

## 2. Units

The **Units** switch picks inches or mm for every length in the panel, the preview labels and the exported file. Switching never changes the design, only how it is shown.

## 3. Shape it

Choose a **Base shape**, then set **Width** and **Height**. Each shape has its own extra settings:

| Base shape | Settings |
| --- | --- |
| Rectangle | **End** (Square, Clipped or Rounded; Rounded is a full semicircle across the height), **Clip** (when Clipped), **Rounding** for the corners |
| Polygon | **Sides**, **Rounding**, **Lock proportions** |
| Star | **Points** (up to 60), **Depth** (inner radius as a fraction of the outer; higher is shallower), **Rounding**, **Lock proportions** |
| Wavy | **End**, **Clip**, **Waves** and **Wave height** along the long edges (the short ends stay straight) |
| Ellipse | **Lock proportions** (on, it is a circle) |
| Oval | Width and height only |

Switching base shape keeps your size and hole and takes that shape's other settings from its preset. **Lock proportions** keeps polygons, stars and ellipses regular: changing width changes height to match, and the other way round. Turn it off to stretch them. Polygons and stars always point up, and rounding is applied after stretching so corners stay circular.

The hole end is the left end for horizontal shapes (rectangle, wavy, ellipse, oval) and the top for polygons and stars.

## 4. Place the hole

The hole is always round and centered across the tag. In **Hole**, set its **Diameter** and its distance from the hole end (**From end**, or **From top** for polygons and stars). The distance runs from the outermost point of the hole end, such as the clipped tip, to the center of the hole.

You can also do it on the preview:

- **Drag the hole** to slide it along the tag's axis.
- **Drag the dot on its edge** to resize it.

The fields and the preview stay in sync as you drag.

**Minimum wall.** At least 1/8" (3.175 mm) of material always stays around the hole. The hole can't be dragged or sized past that, and if a typed value or a shape change (a smaller height, more sides, deeper star points) would break it, the hole is moved first and then shrunk, and the status line says **Hole adjusted to keep a 1/8" wall**.

## 5. Edit points

For a shape no setting can make, press **Edit points…**. The outline (not the hole) becomes bezier points: drag a square point to move it, and drag its round handles to bend the curves. Press **Done editing** when you're finished.

- Once a design has edited points, the shape settings are disabled for it. **Width** and **Height** still scale the edited shape, and the hole stays editable.
- **Reset to shape** throws the point edits away and goes back to the shape settings.
- The hole stays on the centerline of the edited outline's bounding box and slides along it as before.
- Point edits are never blocked. If the outline comes closer than 1/8" to the hole, or crosses it, the status line shows a warning and the hole is highlighted. You can still save and export, so check the preview before you cut.

## 6. Save your design

Type a **Name** and press **Save design** (or Enter). It is stored in your browser and shows up in the preset grid after the built-ins, with its own thumbnail. Saving a name you already used replaces that design. You can't reuse a built-in preset's name.

To delete one, click the **×** on its thumbnail; it turns into **Remove?**, and a second click within a few seconds removes it. Built-in presets can't be removed.

If your browser has storage turned off, Save is disabled and the status line says so. Everything else still works. Saved designs live in that one browser; export the SVG if you need the tag elsewhere.

## 7. Export

**Download SVG** saves `tagcraft-<design name>.svg`; **Copy SVG** puts the SVG text on the clipboard. The file holds one tag at true size: `width` and `height` are in the display unit you chose (in or mm), with a `viewBox` in mm.

The tag is a single path, outline plus hole, with the hole cut out of it, drawn with real curves in an Inkscape layer named **Tag**.

Not yet available: text on the tag, laying out several copies to fill a sheet, and PNG export.
