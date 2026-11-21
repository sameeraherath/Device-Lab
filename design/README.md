# App icon

A laptop and a tablet drawn as indigo outlines, with a solid phone, on a light tile.

- `app-icon.svg`: the full icon (used for the 48px and 128px sizes).
- `app-icon-small.svg`: a simplified version with heavier lines and a soft tile edge (used for 16px and 32px, where the full icon turns soft and thin).

The PNGs in `public/icon/` are rendered from these SVGs at 16, 32, 48 and 128 px with a transparent background. For example, with `rsvg-convert` (or the same sizes from any SVG renderer such as Chrome):

```bash
rsvg-convert -w 128 -h 128 design/app-icon.svg -o public/icon/128.png
rsvg-convert -w 48 -h 48 design/app-icon.svg -o public/icon/48.png
rsvg-convert -w 32 -h 32 design/app-icon-small.svg -o public/icon/32.png
rsvg-convert -w 16 -h 16 design/app-icon-small.svg -o public/icon/16.png
```
