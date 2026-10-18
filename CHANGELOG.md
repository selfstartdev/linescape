# linescape

## 0.2.0

### Minor Changes

- b28d68e: Scroll-linked drawing (`trigger: "scroll"`) now follows the scroll in browsers without CSS scroll-driven animations too (Firefox, for now): `<Linescape>` scrubs the animation from the scroll position there instead of drawing on load. Static SVG gains a `data-scrub` rule for hosts that want to do the same, driven by `--linescape-progress` (0–1); `render()` reports it as `followsScroll`. Generated SVG for scroll-triggered lines changes accordingly.

## 0.1.0

### Minor Changes

- First release: lines described by a path (through a point, from–to with a bend, through points, arc, ring or your own path data), patterns (wave, ridges, steps, sawtooth, scallop, bumps, coil), features (loops from teardrop to round, spirals, kinks), any stroke width, dashes and dots, taper, solid, gradient and along-the-line paint, concentric and off-centre bands, hollow lines, and animation (draw, flow, undulate; on load, when visible or following scroll). `toSvg()` and `render()` in a zero-dependency core, `<Linescape>` in `linescape/react`, fifteen presets, and `suggest()` for generated starting points.
