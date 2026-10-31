# Cutting with Cricut Design Space

How to take a Tagcraft SVG from download to cut tag. New to the app? Start with [Using Tagcraft](guide.md).

1. Upload the SVG. The tag comes in as one shape, and the hole is part of it: it is cut out of the tag, not a separate piece to delete. If you added text or a border, they come in too; see [Text and borders](#text-and-borders-pen-and-deboss) before cutting.
2. Check the size after uploading. It should match the tag size shown in Tagcraft (for the Gift tag, 3" × 1.5"); if not, resize the shape proportionally until it does.
3. Choose your material and cut. Pick the setting for the material you loaded: cardstock, vinyl or whatever you are cutting.
4. Peel the tag from the mat and thread your ribbon or string through the hole.

Cardstock tips:

- Use a light-grip mat, and peel the mat away from the paper, not the paper from the mat, so the tag doesn't curl.
- Heavier cardstock holds a hanging tag better. Try a test cut of a tag on scrap first.
- Keep at least 1/8" of material around the hole (Tagcraft enforces this whenever you change the hole or the size; dragging points only warns). A tag with a thin wall can tear when the gift is carried.
- A hole of about 1/4" fits most ribbon and twine. Make it larger for thick string.
- For sturdier tags, cut two and glue them back to back.

Other cutter software (Silhouette Studio, Inkscape with a plotter, and so on) works the same way: the SVG is one shape with the hole already cut out, at true size.

## Text and borders: pen and deboss

> **Unconfirmed:** these steps haven't been tried in Cricut Design Space yet, so menu names and behaviour may differ in your version. If something doesn't match, please [open an issue](https://github.com/footgunz/tagcraft/issues).

Tagcraft's SVG keeps each tool in its own layer: **Tag** (black, to cut), **Text** (blue lines, for a pen) and **Border** (red lines, to deboss). Design Space treats every shape as a cut until you tell it otherwise.

1. Upload the SVG and add it to the canvas. In the Layers panel you should see the tag, the text and the border as separate items.
2. Select the **text** and set its **Operation** to **Pen** (or Draw), then pick the pen you'll use.
3. Select the **border** and set its **Operation** to **Deboss** (Cricut Maker with the debossing tip). Without a Maker, use **Score** with a scoring stylus or wheel, or **Pen** to draw it.
4. Select everything and **Attach** it. Without this, Design Space places each operation on the mat on its own, and the text and border won't line up with the tag.
5. Check the size as above, then make it. Design Space asks for the pen and the deboss tip as it reaches each layer, before it cuts the tag out.

Tips:

- The bundled fonts are single-line, so the pen draws each letter once. An outline font (marked "(outline)" in Tagcraft) draws hollow letters.
- Draw before you deboss and cut, so the paper is still flat for the pen; Design Space normally orders it that way.
- Fine-tip pens suit text 1/8" tall and up; very small text can blot.
- A deboss line reads best on thicker, softer cardstock. Medium or Bold weight gives a wider line.

## Cutting a sheet of tags

> **Unconfirmed:** these steps haven't been tried in Cricut Design Space yet, so menu names and behaviour may differ in your version. If something doesn't match, please [open an issue](https://github.com/footgunz/tagcraft/issues).

A sheet SVG from Tagcraft's Sheet view (see [Fill a sheet](guide.md#10-fill-a-sheet)) holds every tag laid out on the sheet, each as its own shape with its hole cut out.

1. Upload the sheet SVG. Every tag should come in as a separate shape. Text and borders come in with their own layers: set their operations as in [Text and borders](#text-and-borders-pen-and-deboss).
2. Keep the layout: select all the tags and **Attach** them (at the bottom of the Layers panel). Without this, Design Space arranges shapes on the mat itself when you go to cut, and the tags won't sit where Tagcraft placed them.
3. Check the size. Design Space may trim the empty space around the tags, so the attached group can be smaller than the sheet. Its width and height should match the tags' extent on the Tagcraft preview. If they don't, resize the group proportionally until they do.
4. On the mat screen, set the **material size** to your sheet (Letter or A4, or a custom size for a partial sheet), and lay the paper on the mat to match.
5. Check the tags sit inside the paper. If the margin was trimmed in step 3, move the group so it starts the margin's distance (1/4" by default) in from the paper's top-left corner.
6. Choose your material and cut, then peel the tags as above.

Because Tagcraft packs tags from the top-left, the paper you don't use is one piece along the right or bottom edge, ready to use again as a partial sheet with a custom size.
