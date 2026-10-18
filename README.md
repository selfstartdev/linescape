# linescape

Designed background lines for the web: bands, sweeps, wiggles, loops and swirls behind your content.

Putting a line behind a page by hand means drawing it somewhere, exporting an SVG and then fighting `viewBox`, `preserveAspectRatio`, positioning, `z-index` and stroke scaling, only for the line to stretch or crop as the element changes size. linescape takes a short description of the line instead and rebuilds it for the element's real size. Positions are relative to the element; thickness, loop sizes and wave sizes stay in pixels, so a line keeps its character at any width.

**[Docs and playground →](https://linescape.selfstartdev.com)**

```sh
npm install linescape
```

- `linescape`: the core. No dependencies; runs in Node, the browser, build scripts and edge runtimes. Writes SVG strings.
- `linescape/react`: the `<Linescape>` component. React 18 or 19, an optional peer dependency.

## React

`<Linescape>` is a layer, not a wrapper. Put it inside the element it should sit behind, and give that element `linescapeParentStyle`:

```tsx
import { linescapeParentStyle } from "linescape";
import { Linescape } from "linescape/react";

<section style={linescapeParentStyle}>
  <Linescape line={{ path: { through: "center", angle: -12 }, width: 220, paint: "#ffe3d3" }} />
  {children}
</section>
```

`linescapeParentStyle` is `{ position: "relative", isolation: "isolate" }`: the layer covers this element and can't slip behind its background. In development, `<Linescape>` warns if either is missing. Import it from `linescape`, not `linescape/react`: a React Server Component importing a plain value from a client module gets an empty reference.

Several lines share one layer: `<Linescape lines={[band, swoosh]} />`, drawn in order.

`<Linescape>` measures its parent and redraws the lines when the parent changes size. Lines depend on that size, which the server doesn't know, so the server renders at `initialSize` (1440 × 900) with the layer hidden, and the layer fades in once measured. `reveal="none"` shows the server render straight away instead.

| Prop | Default | Meaning |
|---|---|---|
| `line` / `lines` | | One line, or several. |
| `attach` | `"scroll"` | `"fixed"` pins the layer to the viewport. |
| `fullBleed` | `false` | Break out of the parent's width to the full viewport width. |
| `clip` | `true` | Clip lines to the layer. |
| `initialSize` | `{ width: 1440, height: 900 }` | Size rendered before measuring. |
| `reveal` | `"fade"` | `"none"` shows the server render without waiting. |
| `className`, `style` | | On the layer. |

## SVG, without React

```ts
import { toSvg } from "linescape";

const svg = toSvg({ path: { from: "left 80%", to: "right 30%" }, width: 48 }, { width: 1440, height: 900 });
```

One `<svg>`, coordinates rounded to two decimals: the same input always gives the same bytes. `render()` returns the same output as a plain tree of nodes if you'd rather draw it yourself.

## A line

```ts
{
  path: { from: "left 80%", to: "right 30%", bend: 0.08 },   // where it goes
  patterns: [{ type: "wave", amplitude: 20, wavelength: 160 }], // what it does along the way
  features: [{ type: "loop", at: 0.55, radius: 50 }],           // what happens at a point
  width: 48,                                                    // px
  paint: "#7c5cff",                                             // colour or gradient
  animate: { draw: true },                                      // optional
}
```

### Positions

CSS `background-position` syntax, or `[x, y]` pairs of px and percentages: `"center"`, `"left 30%"`, `"top right"`, `"75% 20%"`, `"right 40px top 10%"`, `[120, "50%"]`. Points outside the element are fine. An end that sits on an edge is extended outward automatically, so its cap never shows.

### Paths

| Path | |
|---|---|
| `{ through, angle }` | A straight line through a point, edge to edge. 0° is horizontal; positive turns clockwise. |
| `{ from, to, bend? }` | Straight, or one smooth curve. `bend` is the sideways bulge as a fraction of the length; positive bulges left of the direction of travel. |
| `{ points, smooth? }` | A smooth curve through points. `smooth: 0` gives straight segments with corners. |
| `{ arc: { center, radius, start, end } }` | Part of a circle. Angles in degrees, 0° pointing right. |
| `{ ring: { center, radius } }` | A closed circle, or an ellipse with `radius: [x, y]`. |
| `{ d, viewBox? }` | Your own SVG path. With a viewBox it's stretched to the element. |

### Patterns

Patterns displace the line sideways as it travels, following it however it curves. Sizes are px, so a wave keeps its shape when the element changes size; a whole number of repeats always fits the range, so a pattern ends back on the line.

`wave` · `ridges` (zigzag) · `steps` (square wave) · `sawtooth` · `scallop` · `bumps` · `coil` (telephone cord)

| Option | Default | |
|---|---|---|
| `amplitude` | per type | Sideways size in px (for `coil`, the loop radius). |
| `wavelength` | per type | Length of one repeat in px. |
| `range` | `[0, 1]` | The part of the line it covers. |
| `ease` | `0` | px over which it fades in and out at the ends of its range. |
| `phase` | `0` | Offset along the pattern, 0–1. |
| `side` | `"left"` | Which side one-sided patterns sit on. |

Patterns can be stacked and placed on different ranges.

### Features

| Feature | |
|---|---|
| `{ type: "loop", at, radius?, roundness?, turns?, side? }` | A loop at a point (`at`, 0–1 along the line). `radius` (default 50) is half its height; `roundness` runs from a cursive teardrop (0) to nearly a circle (1), default 0.4. |
| `{ type: "spiral", at: "start" \| "end", radius?, turns?, inner?, side? }` | The line curls into a spiral. |
| `{ type: "kink", at, length?, angle?, side? }` | A sharp spike. |

### Stroke

| Option | Default | |
|---|---|---|
| `width` | `40` | px. Very thick lines (hundreds of px) are a first-class use. |
| `cap` / `join` | `"round"` | |
| `dash` | | `[dash, gap, …]` in px, or `{ dots: spacing }`. |
| `taper` | | `{ start, end }`: px over which the line narrows to a point. |
| `opacity`, `blend` | `1` | `blend` is a CSS `mix-blend-mode`. |

### Paint

```ts
paint: "#7c5cff"                                                    // any CSS colour; default currentColor
paint: { linear: { angle: 90, stops: [{ offset: 0, color: "#ffd6c2" }, { offset: 1, color: "#ffeab8" }] } }
paint: { radial: { stops: [...] }, box: "element" }                 // gradients span the line (default) or the element
paint: { along: [{ offset: 0, color: "#ef476f" }, { offset: 1, color: "#ffd166" }] }   // colour changes along the line
bands: [{ width: 260, paint: "#1d3557" }, { width: 160, paint: "#f1faee" }]            // concentric stripes
bands: [{ width: 10, paint: "red", offset: 30 }, { width: 10, paint: "blue", offset: -30 }]  // parallel lines
outline: { width: 6 }                                               // hollow: only the edges are painted
```

### Animation

```ts
animate: {
  draw: { duration: 1200, delay: 0, easing: "ease-in-out", from: "start" },  // or "end", "center"; or just `true`
  flow: { speed: 60 },        // dashes march along the line (needs `dash`)
  undulate: { speed: 40 },    // patterns travel along the line
  trigger: "load",            // "visible": when scrolled into view (React); "scroll": follows the scroll position
  repeat: 1,                  // or "infinite"
}
```

Drawing and flowing are CSS animations, switched off for `prefers-reduced-motion`. Scroll-linked drawing uses CSS scroll-driven animations; where they aren't supported, `<Linescape>` follows the scroll itself (static SVG draws on load there). Undulating uses SMIL; `<Linescape>` leaves it out for reduced motion. Undulating doesn't apply to tapered lines, `along` paint or off-centre bands.

## Presets and suggestions

```tsx
import { presets, suggest } from "linescape";

<Linescape line={{ ...presets.swoosh, paint: "#0a7" }} />
```

Presets: `band`, `swoosh`, `underline`, `ridgeline`, `swirl`, `stripes`, `ribbon`, `coil`, `zigzag`, `brush`, `frame`, `orbit`, `parallel`, `current`, `scribble`.

`suggest({ seed, kind?, keep? })` generates a complete line from a seed: a starting point rather than a blank page. The output is a plain, static spec; print it, paste it and change it. `keep` holds the parts you've settled on (`{ keep: { path, paint } }`) so only the rest changes. The playground's Shuffle button is built on it.

## Accessibility

The layer is decorative: `aria-hidden="true"` and `pointer-events: none`. Animations respect `prefers-reduced-motion`. Check contrast where lines run behind text.

## Stability

The same spec and element size always produce the same output, on the server and in the browser.

From 1.0, the same spec, size and major version produce byte-identical output: any change to generated output, presets and `suggest()` included, is a major release. Before 1.0, a minor version (0.x → 0.y) may still change output; patch versions never do.

## License

MIT © SelfStartDev
