# linescape

## 0.2.1

### Patch Changes

- 60744fd: Fix the issues a code review found:
  
  - Dotted and dashed lines with `along` paint keep their caps in every slice; past the first slice, dots used to vanish.
  - Tapered lines and off-centre bands can be dashed (one outline per dash).
  - Loops and kinks near the seam of a ring wrap round it instead of losing half the feature.
  - A spiral at an end of a `through` line attaches at the edge.
  - Taper, `along` colours and centre-out drawing are measured over the part of the line on screen, not the bleed past the edges.
  - `along` stops are sorted by offset.
  - `toSvg()` with the default `idPrefix` includes the size in mask and keyframe names, so one line at two sizes can be inlined in the same page. With your own prefix (as `<Linescape>` uses) names still ignore the size.
  - `trigger: "visible"` fires for layers many windows tall.
  - An `animate` option set to `undefined` keeps its default.
  - Undulating moves every pattern at `speed`: a cycle is the longest pattern's.
  - `constructor` and other `Object.prototype` keys aren't accepted as position keywords.
  - The layer falls back to `overflow: hidden` where `overflow: clip` isn't supported (Safari before 16).
  - Following the scroll: the scrub starts from 0 instead of pausing the on-load draw, the layer no longer becomes its own scroll container, reduced motion is respected before the first scrub, and the position is measured against the nearest scroll container.
  
  Generated SVG changes for lines with masks or keyframes (names include the size) and for `along` paint on lines that bleed past the edges.

## 0.2.0

### Minor Changes

- b28d68e: Scroll-linked drawing (`trigger: "scroll"`) now follows the scroll in browsers without CSS scroll-driven animations too (Firefox, for now): `<Linescape>` scrubs the animation from the scroll position there instead of drawing on load. Static SVG gains a `data-scrub` rule for hosts that want to do the same, driven by `--linescape-progress` (0–1); `render()` reports it as `followsScroll`. Generated SVG for scroll-triggered lines changes accordingly.

## 0.1.0

### Minor Changes

- First release: lines described by a path (through a point, from–to with a bend, through points, arc, ring or your own path data), patterns (wave, ridges, steps, sawtooth, scallop, bumps, coil), features (loops from teardrop to round, spirals, kinks), any stroke width, dashes and dots, taper, solid, gradient and along-the-line paint, concentric and off-centre bands, hollow lines, and animation (draw, flow, undulate; on load, when visible or following scroll). `toSvg()` and `render()` in a zero-dependency core, `<Linescape>` in `linescape/react`, fifteen presets, and `suggest()` for generated starting points.
