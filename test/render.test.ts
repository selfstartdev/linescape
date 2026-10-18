import { describe, expect, it } from "vitest";
import { render, toSvg, type LineInput, type SvgNode } from "../src";
import { parseColor } from "../src/render/color";
import { designs } from "./designs";

const size = { width: 1200, height: 700 };
const flat = (nodes: (SvgNode | string)[]): SvgNode[] => nodes.flatMap((n) => (typeof n === "string" ? [] : [n, ...flat(n.children)]));
const all = (lines: Parameters<typeof render>[0], options = {}) => {
  const layer = render(lines, { ...size, ...options });
  return { layer, nodes: flat(layer.children), css: flat(layer.children).find((n) => n.tag === "style")?.children[0] as string | undefined };
};

describe("render", () => {
  it("writes a standalone, decorative svg", () => {
    const svg = toSvg(designs.band!, size);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1200" height="700" viewBox="0 0 1200 700" class="linescape" aria-hidden="true" focusable="false">/);
    expect(svg).toContain("<linearGradient");
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("is deterministic", () => {
    for (const line of Object.values(designs)) expect(toSvg(line, size)).toBe(toSvg(line, size));
  });

  it("draws a plain line as one stroked path", () => {
    const { nodes } = all({ path: { from: "left", to: "right" }, width: 12, paint: "red" });
    const paths = nodes.filter((n) => n.tag === "path");
    expect(paths).toHaveLength(1);
    expect(paths[0]!.attrs).toMatchObject({ fill: "none", stroke: "red", "stroke-width": "12", "stroke-linecap": "round", "stroke-linejoin": "round" });
  });

  it("shares identical gradients between lines", () => {
    const paint = { linear: { angle: 90, stops: [{ offset: 0, color: "#000" }, { offset: 1, color: "#fff" }] }, box: "element" as const };
    const { nodes } = all([{ path: { through: "center", angle: 10 }, paint }, { path: { through: "center", angle: -10 }, paint }]);
    expect(nodes.filter((n) => n.tag === "linearGradient")).toHaveLength(1);
  });

  it("draws bands widest first, all on one centerline", () => {
    const { nodes } = all(designs.stripes!);
    const paths = nodes.filter((n) => n.tag === "path");
    expect(paths.map((p) => p.attrs["stroke-width"])).toEqual(["260", "160", "60"]);
    expect(new Set(paths.map((p) => p.attrs.d)).size).toBe(1);
  });

  it("draws off-centre bands as filled outlines beside the centerline", () => {
    const { nodes } = all({ path: { from: [100, 350], to: [1100, 350] }, bands: [{ width: 10, paint: "red", offset: 40 }, { width: 10, paint: "blue" }] });
    const [offset, centre] = nodes.filter((n) => n.tag === "path");
    expect(offset!.attrs).toMatchObject({ fill: "red" });
    expect(offset!.attrs.d).toMatch(/Z$/);
    // Left of travel (rightwards) is up: y = 350 - 40 ± 5.
    const ys = [...offset!.attrs.d!.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeCloseTo(305, 0);
    expect(centre!.attrs).toMatchObject({ stroke: "blue", "stroke-width": "10" });
  });

  it("makes hollow lines with a mask", () => {
    const { nodes } = all({ path: { from: "left", to: "right" }, width: 100, outline: { width: 10 } });
    const mask = nodes.find((n) => n.tag === "mask")!;
    expect(mask.children.map((c) => (c as SvgNode).attrs)).toMatchObject([
      { stroke: "#fff", "stroke-width": "100" },
      { stroke: "#000", "stroke-width": "80" },
    ]);
    expect(nodes.some((n) => n.attrs.mask === `url(#${mask.attrs.id})`)).toBe(true);
  });

  it("colours a line along its length with slices", () => {
    const { nodes } = all({ path: { from: [100, 350], to: [1100, 350] }, width: 40, paint: { along: [{ offset: 0, color: "red" }, { offset: 1, color: "blue" }] } });
    const slices = nodes.filter((n) => n.tag === "path");
    expect(slices.length).toBeGreaterThan(100);
    expect(parseColor(slices[0]!.attrs.stroke!)!.r).toBeGreaterThan(250);
    expect(parseColor(slices[slices.length - 1]!.attrs.stroke!)!.b).toBeGreaterThan(250);
    expect(slices[1]!.attrs["stroke-linecap"]).toBe("butt");
  });

  it("explains colours it can't blend", () => {
    expect(() => render({ path: { from: "left", to: "right" }, paint: { along: [{ offset: 0, color: "var(--x)" }, { offset: 1, color: "red" }] } }, size)).toThrow(/can't be blended/);
  });

  it("draws tapered lines as filled outlines", () => {
    const { nodes } = all({ path: { from: [100, 350], to: [1100, 350] }, width: 60, taper: { end: 300 }, paint: "#123" });
    const paths = nodes.filter((n) => n.tag === "path");
    expect(paths).toHaveLength(1);
    expect(paths[0]!.attrs.fill).toBe("#123");
    expect(paths[0]!.attrs.d!.endsWith("Z")).toBe(true);
  });

  it("applies opacity and blend to the line's group", () => {
    const { layer } = all({ path: { from: "left", to: "right" }, opacity: 0.5, blend: "multiply" });
    expect(layer.children[layer.children.length - 1]!.attrs).toEqual({ opacity: "0.5", style: "mix-blend-mode:multiply" });
  });

  it("rejects an empty element", () => {
    expect(() => render(designs.band!, { width: 0, height: 100 })).toThrow(/linescape/);
  });
});

describe("animation", () => {
  const drawn = (animate: LineInput["animate"], extra: Partial<LineInput> = {}) => all({ path: { from: "left 40%", to: "right 60%" }, width: 30, ...extra, animate });

  it("draws through a mask with a CSS dash animation", () => {
    const { nodes, css } = drawn({ draw: { duration: 800, delay: 100 } });
    const maskPath = nodes.find((n) => n.tag === "mask")!.children[0] as SvgNode;
    expect(maskPath.attrs.class).toMatch(/^linescape-draw-/);
    expect(css).toContain(`@keyframes ${maskPath.attrs.class}`);
    expect(css).toContain(`.${maskPath.attrs.class}{animation:${maskPath.attrs.class} 800ms ease-in-out 100ms 1 both}`);
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("draws from the center with growing dashes and flat ends", () => {
    const { nodes, css } = drawn({ draw: { from: "center" } });
    const maskPath = nodes.find((n) => n.tag === "mask")!.children[0] as SvgNode;
    expect(maskPath.attrs["stroke-linecap"]).toBe("butt");
    expect(css).toMatch(/from\{stroke-dasharray:0 [\d.]+;stroke-dashoffset:-[\d.]+\}/);
  });

  it("follows scroll where scroll-driven animations are supported", () => {
    const { css } = drawn({ draw: true, trigger: "scroll" });
    expect(css).toContain("@supports (animation-timeline:view())");
    expect(css).toContain("animation-timeline:--linescape-tl");
    expect(css).toContain(".linescape{view-timeline:--linescape-tl block}");
  });

  it("has a scrubbable fallback for scroll-linked drawing", () => {
    const { layer, css } = drawn({ draw: true, trigger: "scroll" });
    expect(layer.followsScroll).toBe(true);
    expect(css).toMatch(/\.linescape\[data-scrub\] \.linescape-draw-\w+\{animation:linescape-draw-\w+ 1000ms linear both paused;animation-delay:calc\(var\(--linescape-progress,0\) \* -1000ms\)\}/);
    expect(drawn({ draw: true }).layer.followsScroll).toBe(false);
  });

  it("can wait until visible", () => {
    const { layer, css } = drawn({ draw: true, trigger: "visible" });
    expect(layer.waitsForVisibility).toBe(true);
    expect(css).toMatch(/\.linescape\[data-paused\] \.linescape-draw-\w+\{animation-play-state:paused\}/);
  });

  it("flows dashes", () => {
    const { nodes, css } = drawn({ flow: { speed: 30 } }, { dash: [20, 10] });
    const path = nodes.find((n) => n.tag === "path")!;
    expect(path.attrs.class).toMatch(/^linescape-flow-/);
    expect(css).toContain("stroke-dashoffset:-30");
    expect(css).toContain("1000ms linear infinite");
  });

  it("undulates with SMIL frames that share their commands", () => {
    const { nodes } = drawn({ undulate: { speed: 40 } }, { patterns: [{ type: "wave", wavelength: 120 }] });
    const animate = nodes.find((n) => n.tag === "animate")!;
    const frames = animate.attrs.values!.split(";");
    expect(frames).toHaveLength(13);
    const letters = (d: string) => d.replace(/[^A-Z]/g, "");
    for (const f of frames) expect(letters(f)).toBe(letters(frames[0]!));
    expect(frames[12]).toBe(frames[0]);
    expect(animate.attrs.dur).toBe("3000ms");
  });

  it("leaves undulation out without motion", () => {
    const { nodes } = all({ path: { from: "left", to: "right" }, patterns: [{ type: "wave" }], animate: { undulate: true } }, { motion: false });
    expect(nodes.some((n) => n.tag === "animate")).toBe(false);
  });
});

describe("colours", () => {
  it.each([
    ["#f00", [255, 0, 0, 1]],
    ["#ff000080", [255, 0, 0, 128 / 255]],
    ["rgb(10, 20, 30)", [10, 20, 30, 1]],
    ["rgb(10 20 30 / 50%)", [10, 20, 30, 0.5]],
    ["rgba(100%, 0%, 0%, 0.25)", [255, 0, 0, 0.25]],
    ["hsl(120, 100%, 50%)", [0, 255, 0, 1]],
    ["rebeccapurple", [102, 51, 153, 1]],
    ["transparent", [0, 0, 0, 0]],
  ])("parses %s", (input, [r, g, b, a]) => {
    const c = parseColor(input)!;
    expect(c.r).toBeCloseTo(r!);
    expect(c.g).toBeCloseTo(g!);
    expect(c.b).toBeCloseTo(b!);
    expect(c.a).toBeCloseTo(a!);
  });

  it.each(["currentColor", "var(--a)", "oklch(0.5 0.1 20)", "#12", "rgb(1,2)"])("refuses %s", (input) => {
    expect(parseColor(input)).toBeNull();
  });
});
