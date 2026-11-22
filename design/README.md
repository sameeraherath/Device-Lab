# App icon

A blue laptop with a phone in front, both with white screens, on a transparent background. It is one
simple shape, like other toolbar icons, so it is easy to pick out in the Chrome toolbar.

- `app-icon.svg`: the large icon (48 and 128 px). The same drawing with transparent padding, so the
  artwork is about 96 of 128 px, as Chrome's icon guidelines ask.
- `app-icon-small.svg`: the toolbar icon (16 and 32 px). It fills the square. The phone is cut out of
  the laptop with a gap so both shapes stay readable at 16 px.

The PNGs in `public/icon/` are rendered from these SVGs at 16, 32, 48 and 128 px with a transparent
background. For example, with `rsvg-convert` (or the same sizes from any SVG renderer such as Chrome):

```bash
rsvg-convert -w 128 -h 128 design/app-icon.svg -o public/icon/128.png
rsvg-convert -w 48 -h 48 design/app-icon.svg -o public/icon/48.png
rsvg-convert -w 32 -h 32 design/app-icon-small.svg -o public/icon/32.png
rsvg-convert -w 16 -h 16 design/app-icon-small.svg -o public/icon/16.png
```
