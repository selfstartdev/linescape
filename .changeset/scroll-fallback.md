---
"linescape": minor
---

Scroll-linked drawing (`trigger: "scroll"`) now follows the scroll in browsers without CSS scroll-driven animations too (Firefox, for now): `<Linescape>` scrubs the animation from the scroll position there instead of drawing on load. Static SVG gains a `data-scrub` rule for hosts that want to do the same, driven by `--linescape-progress` (0–1); `render()` reports it as `followsScroll`. Generated SVG for scroll-triggered lines changes accordingly.
