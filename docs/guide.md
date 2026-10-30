# Using Tagcraft

A walkthrough of the app, from picking a tag to downloading a file you can cut. Try it at **[footgunz.github.io/tagcraft](https://footgunz.github.io/tagcraft/)**.

Once your SVG is ready, see [Cutting with Cricut Design Space](cricut.md).

![The Tagcraft window](assets/overview.png)

The left panel is the controls; the right side is a live preview with the tag's width and height labelled. Your current design is remembered in your browser between visits.

## 1. Pick a preset

**Preset** is a grid of thumbnails. Click one to load it. Your own saved designs appear after the built-in ones (see [Save your design](#6-save-your-design)).

![Clicking through the built-in presets](assets/presets.gif)

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

Choose a **Base shape**, then set **Width** and **Height**.

![Changing the clip and end style of the gift tag, then turning it into a star and changing its points and depth](assets/shapes.gif)

Each shape has its own extra settings:

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

![Dragging the hole along the tag, then dragging its edge dot to resize it](assets/hole.gif)

**Minimum wall.** At least 1/8" (3.175 mm) of material always stays around the hole. The hole can't be dragged or sized past that, and if a typed value or a shape change (a smaller height, more sides, deeper star points) would break it, the hole is moved first and then shrunk, and the status line says **Hole adjusted to keep a 1/8" wall**.

## 5. Edit points

For a shape no setting can make, press **Edit points…**. The outline (not the hole) becomes bezier points: drag a square point to move it, and drag its round handles to bend the curves. Press **Done editing** when you're finished.

![Dragging a corner point, then a handle to bend the curve](assets/edit-points.gif)

- Once a design has edited points, the shape settings are disabled for it. **Width** and **Height** still scale the edited shape, and the hole stays editable.
- **Reset to shape** throws the point edits away and goes back to the shape settings.
- The hole stays on the centerline of the edited outline's bounding box and slides along it as before. Moving or resizing the hole, or changing **Width** or **Height**, still keeps the 1/8" wall.
- Point edits are never blocked. If dragging a point brings the outline closer than 1/8" to the hole, or across it, the hole stays where it is, the status line shows a warning and the hole is highlighted. You can still save and export, so check the preview before you cut.

## 6. Save your design

The **Save** section appears once you change anything about a built-in preset; an untouched preset is already in the grid. Type a **Name** and press **Save design** (or Enter). It is stored in your browser and shows up in the preset grid after the built-ins, with its own thumbnail. Saving a name you already used replaces that design. You can't reuse a built-in preset's name.

To delete one, click the **×** on its thumbnail; it turns into **Remove?**, and a second click within a few seconds removes it. Built-in presets can't be removed.

If your browser has storage turned off, Save is disabled and the status line says so. Everything else still works. Saved designs live in that one browser; export the SVG if you need the tag elsewhere.

## 7. Export

**Download SVG** saves `tagcraft-<design name>.svg`; **Copy SVG** puts the SVG text on the clipboard. The file holds one tag at true size: `width` and `height` are in the display unit you chose (in or mm), with a `viewBox` in mm.

The tag is a single path, outline plus hole, with the hole cut out of it, drawn with real curves in an Inkscape layer named **Tag**.

To export a whole sheet of copies instead, see [Fill a sheet](#8-fill-a-sheet).

## 8. Fill a sheet

To cut many copies of a tag at once, switch the toolbar from **Tag** to **Sheet**. The preview then shows a whole sheet of paper with as many copies of your tag as fit. The dashed line is the margin. Sheet view is for looking only; switch back to **Tag** (or press **Edit points…**) to change the tag. Any change you make to the tag or the sheet shows up on the sheet straight away.

![Switching to Sheet view, then changing the sheet size, gap and count](assets/sheet.gif)

Set up the paper in the panel's **Sheet** section, which appears while you're in Sheet view:

| Setting | What it does |
| --- | --- |
| **Size** | **Letter** (8.5" × 11"), **A4** (210 × 297 mm), or **Custom**, with your own **Width** and **Height**, for a partial sheet, a scrap or an odd paper size (up to 12" × 24"). |
| **Margin** | Space kept clear around the edges of the sheet. Default 1/4". |
| **Gap** | Space between neighbouring tags. Default 1/8". |
| **Count** | Leave it empty for as many as fit, or type a smaller number to cut only that many. |

The line under the settings says how many tags fit and how many are turned, for example **15 tags fit · 15 turned**, or **Cutting 4 of 15** when you set a count.

How the tags are laid out:

- Tags are turned 90° when that fits more. The gift tag fits 12 upright on Letter but 15 turned. Sometimes a mix of upright and turned tags fits best.
- Tags are packed from the top-left corner, so the paper you don't use stays in one piece you can use again as a partial sheet. With a count, the first tags in reading order are kept.
- The layout uses each tag's bounding box, so round and pointed shapes don't nest into each other yet.

In Sheet view the toolbar buttons export the sheet: **Download sheet SVG** saves a file named for the design, sheet and count, such as `tagcraft-gift-tag-letter-15up.svg`, and **Copy sheet SVG** copies it. The SVG is the sheet at true size with each tag as its own path, hole cut out. There's no sheet outline in the file, so nothing extra gets cut. If the tag doesn't fit on the sheet at all, even turned, the summary says so and the buttons are disabled.

Your sheet settings are remembered in your browser, separately from your designs. To cut a sheet on a Cricut, see [Cutting a sheet of tags](cricut.md#cutting-a-sheet-of-tags).

Not yet available: text on the tag, and PNG export.
