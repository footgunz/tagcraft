# Sheet fill design

## Intent

Cut many copies of one tag in a single pass. Tagcraft lays out as many copies
of the selected design as fit on a sheet of paper or cardstock and exports
them as one SVG at the sheet's true size. The sheet sits on a cutting mat
(Cricut and similar), so the SVG is the sheet, not the mat.

This is the "Fill a sheet" follow-up from the
[Tagcraft design](2026-10-30-tagcraft-design.md). Shape generation is already
a pure function of the design, so copies are stamped from `buildOutline` and
`holeContour` without changing the geometry code.

## Goals

- Pick a sheet size: US Letter, A4, or a custom width × height for partial
  sheets and odd paper.
- Fit as many copies of the current design as possible, turning tags 90°
  when that fits more.
- Optionally cut fewer: a count below the maximum.
- See the layout live, with the count, before exporting.
- Export one cut-ready SVG of the whole sheet.

## Non-goals (for now, likely follow-ups)

- **Shape-aware nesting:** staggered rows, or alternate tags flipped 180° so
  they interlock. v1 packs bounding boxes. The layout function is the one
  place this plugs in later.
- More than one sheet per export, and pages of sheets.
- Different designs on one sheet.
- Cricut mat-size presets (12 × 12, 12 × 24). A custom size covers them.
- Print Then Cut limits and registration marks.

## Anti-goals

- A sheet SVG at the wrong physical size, or tags that overlap or cross the
  margin.
- Tags merged into one shape, so the cutter can't treat them as separate
  pieces.
- Flattened curves: copies keep the same smooth beziers as the single-tag
  export.
- Any AI attribution or co-author lines anywhere.

## What was decided

### Sheet settings

- **Size:** Letter (8.5 × 11 in), A4 (210 × 297 mm), or Custom (width and
  height). Presets are portrait. A custom size is used as entered, so a
  landscape scrap is just a custom size with width > height.
- **Margin:** one value for all four edges, default 1/4" (6.35 mm). Nothing is
  placed closer than this to the sheet edge.
- **Gap:** space between neighbouring tags, default 1/8" (3.175 mm, the same
  as the minimum hole wall).
- **Count:** defaults to the maximum that fits ("As many as fit"). A lower
  number places only that many.
- Lengths follow the in/mm unit switch, like the rest of the panel. Values are
  stored in mm.
- Sheet settings are saved in the browser separately from designs (they are
  about the paper, not the tag) and restored on the next visit. Storage access
  is wrapped like the existing storage, so the app still works without it.
- Settings are always valid: out-of-range values are clamped, as designs are.

### Layout (v1)

Pure function: `layoutSheet(design, sheet) → placements`, where each placement
is a position and a rotation (0° or 90°). It packs the tag's bounding box
(width × height, plus the gap between neighbours) into the sheet minus the
margin, and tries:

1. A grid of upright tags.
2. A grid of tags turned 90°.
3. Mixed: an upright grid with turned tags filling the leftover strip, and the
   reverse. The strip can be on the right or along the bottom.

It keeps the layout with the most tags. Ties go to the simpler layout (all
upright, then all turned, then mixed).

- Tags are packed from the top-left corner of the usable area, not centred,
  so the leftover material is one piece that can be reused as a partial sheet.
- With a count below the maximum, the first N placements in reading order
  (top to bottom, left to right) are kept.
- If no copy fits, even turned, the layout is empty. The UI says so and the
  sheet export is disabled.

Example: the 3" × 1.5" Gift tag on Letter with the default margin and gap fits
12 upright, or 15 turned.

### Sheet view

- The stage toolbar gets a **Tag / Sheet** toggle. Tag is today's editor.
  Sheet shows the whole sheet with the tags in place, updating live as the
  design or sheet settings change. Editing (hole drag, points) is only
  available in Tag view.
- A **Sheet** section in the panel holds size, custom width and height, margin,
  gap and count, plus a summary line ("15 tags fit · 12 upright, 3 turned").
- In Sheet view, **Download SVG** and **Copy SVG** export the sheet. In Tag
  view they export one tag, as today.

### Sheet export

- One SVG at the sheet's true size: `width`/`height` in `in` or `mm`, a
  `viewBox` in mm, and the same Inkscape layer ("Tag") as the single-tag
  export.
- Each tag is its own `<path>` (outline plus hole subpath, evenodd), so the
  cutter treats each one as a separate piece with its hole cut out.
- Positions and rotations are written into the path coordinates, not as
  `transform` attributes, which some cutter software handles badly.
- No sheet outline in the file, since the cutter would cut it.
- Filename: `tagcraft-<design name or base shape>-<sheet>-<count>up.svg`, for
  example `tagcraft-gift-tag-letter-15up.svg` or
  `tagcraft-gift-tag-custom-6up.svg`.

### Docs

- `docs/guide.md`: how to use Sheet view.
- `docs/cricut.md`: cutting a sheet. Set the material size to match the sheet,
  and Attach all the tags after uploading so Design Space keeps the layout
  instead of rearranging them on the mat. Confirm both steps in Design Space
  before documenting them.

## Left to the builder

- Ranges for custom size, margin and gap (custom size at least up to a
  12 × 24 in mat).
- Whether the mixed layout searches every split of the sheet or only the
  leftover strips of the best grids, as long as it is never worse than the
  plain grids.
- Exact wording and placement of the toggle and summary line.
