// Inputs from the full code review of 2026-10-22: each one went wrong before its fix.
import { describe, expect, it } from "vitest";
import { render, resolve, toSvg, type LineInput, type SvgNode } from "../src";
import { buildBackbone } from "../src/backbone";
import { buildCurve } from "../src/curve";
import { resolvePoint } from "../src/spec/position";

const flat = (nodes: (SvgNode | string)[]): SvgNode[] => nodes.flatMap((n) => (typeof n === "string" ? [] : [n, ...flat(n.children)]));
const nodesOf = (line: LineInput, size = { width: 800, height: 400 }) => flat(render(line, size).children);
const red = { offset: 0, color: "#ff0000" };
const blue = { offset: 1, color: "#0000ff" };
/** The first point of a path's d. */
const startOf = (d: string) => d.match(/^M(-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number) as [number, number];

describe("lines drawn right", () => {
  it("dots with along paint keep their round caps in every slice", () => {
    const paths = nodesOf({ path: { from: "left 50%", to: "right 50%" }, width: 10, dash: { dots: 20 }, paint: { along: [red, blue] } }).filter((n) => n.tag === "path");
    expect(paths.length).toBeGreaterThan(2);
    expect(paths.every((p) => p.attrs["stroke-linecap"] === "round")).toBe(true);
  });

  it("toSvg outputs of one line at two sizes don't share ids or keyframes", () => {
    const line: LineInput = { path: { from: "left", to: "right" }, animate: { draw: true } };
    const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    const desktop = toSvg(line, { width: 800, height: 400 }), phone = toSvg(line, { width: 300, height: 600 });
    expect(ids(desktop)).toHaveLength(1);
    expect(ids(desktop)[0]).not.toBe(ids(phone)[0]);
    // With a prefix of its own (React's), names stay put across sizes, so animations don't restart.
    expect(ids(toSvg(line, { width: 800, height: 400, idPrefix: "x" }))).toEqual(ids(toSvg(line, { width: 300, height: 600, idPrefix: "x" })));
  });

  it("a loop at the start of a ring is whole: the path ends where it starts", () => {
    const line = resolve({ path: { ring: { center: "center", radius: 150 } }, features: [{ type: "loop", at: 0, radius: 40 }] });
    const curve = buildCurve(line, { width: 800, height: 400 });
    const L = curve.backbone.length;
    const main = curve.pieces[0]!.at;
    const [a, b] = [main(0), main(L)];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
    // And the loop is there on both sides of the seam: off the ring just before and just after it.
    const offRing = (t: number) => Math.abs(Math.hypot(main(t).x - 400, main(t).y - 200) - 150);
    expect(offRing(L - 5)).toBeGreaterThan(1);
    expect(offRing(5)).toBeGreaterThan(1);
  });

  it.each<[string, LineInput]>([
    ["tapered", { path: { from: "left 50%", to: "right 50%" }, dash: [10, 10], taper: { start: 100 } }],
    ["off-centre bands", { path: { from: "left 50%", to: "right 50%" }, bands: [{ width: 10, offset: 20, paint: "red" }], dash: [10, 10] }],
  ])("%s lines are dashed", (_, line) => {
    const d = nodesOf(line).find((n) => n.tag === "path")!.attrs.d!;
    // One outline per dash: about 800px / 20px of them.
    expect(d.split("M").length - 1).toBeGreaterThan(30);
  });

  it("along stops in any order blend in offset order", () => {
    const paths = nodesOf({ path: { from: "left 50%", to: "right 50%" }, paint: { along: [blue, red] } }).filter((n) => n.tag === "path");
    expect(new Set(paths.map((p) => p.attrs.stroke)).size).toBeGreaterThan(10);
  });

  it("a spiral at the start of a through line is attached at the edge, as on a from–to line", () => {
    const b = buildBackbone({ through: "center", angle: 0 }, { width: 800, height: 400 }, { width: 40, bleedStart: false });
    expect(b.at(0).p.x).toBeCloseTo(0, 6);
    expect(b.visible[0]).toBeCloseTo(0, 6);
  });

  it("along colours run across the part on screen: red at the left edge", () => {
    const paths = nodesOf({ path: { from: "left 50%", to: "right 50%" }, width: 200, paint: { along: [red, blue] } }).filter((n) => n.tag === "path");
    const atEdge = paths.reduce((best, p) => (Math.abs(startOf(p.attrs.d!)[0]) < Math.abs(startOf(best.attrs.d!)[0]) ? p : best));
    expect(parseInt(atEdge.attrs.stroke!.slice(1, 3), 16)).toBeGreaterThan(0xf0);
  });

  it("a taper is on screen: the line is narrow at the element's edge", () => {
    const line = { path: { from: "left 50%", to: "right 50%" }, width: 60, taper: { start: 40, end: 40 } } as const;
    const d = nodesOf(line).find((n) => n.tag === "path")!.attrs.d!;
    // Points of the outline within 2px of the left edge are within a few px of the centreline.
    const points = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const nearEdge = points.filter(([x]) => Math.abs(x!) < 2);
    expect(nearEdge.length).toBeGreaterThan(0);
    for (const [, y] of nearEdge) expect(Math.abs(y! - 200)).toBeLessThan(10);
  });

  it("a shifted pattern round a whole ring isn't flattened at the seam", () => {
    const line = resolve({ path: { ring: { center: "center", radius: 150 } }, patterns: [{ type: "wave", amplitude: 20, wavelength: 80, phase: 0.25 }] });
    const main = buildCurve(line, { width: 800, height: 400 }).pieces[0]!.at;
    const offRing = (t: number) => Math.abs(Math.hypot(main(t).x - 400, main(t).y - 200) - 150);
    expect(Math.max(offRing(0), offRing(10), offRing(20))).toBeGreaterThan(10);
  });

  it("the centre of a centre-out draw is the middle of the part on screen", () => {
    // Bleed at the start only (the end is inside the element), so the visible middle isn't the path's.
    const line: LineInput = { path: { from: "left 50%", to: [600, 200] }, animate: { draw: { from: "center" } } };
    const css = flat(render(line, { width: 800, height: 400 }).children).find((n) => n.tag === "style")!.children[0] as string;
    const offset = Number(/stroke-dasharray:0 [\d.]+;stroke-dashoffset:-([\d.]+)/.exec(css)![1]);
    // The mask path runs pad + bleed before x = 0; the visible part's middle is at x = 300.
    const w = resolve(line).width;
    const pad = w + 4, bleed = w * 0.75 + 2;
    expect(offset).toBeCloseTo(pad + bleed + 300 + 1, 0);
  });
});

describe("behaviour and API", () => {
  it("an option set to undefined keeps its default", () => {
    expect(() => resolve({ path: { from: "left", to: "right" }, animate: { draw: { duration: undefined }, flow: { speed: undefined }, undulate: { speed: undefined } } })).not.toThrow();
    expect(resolve({ path: { from: "left", to: "right" }, animate: { draw: { duration: undefined } } }).animate!.draw!.duration).toBeGreaterThan(0);
  });

  it("with several patterns, an undulate cycle is the longest one's, so each moves at `speed`", () => {
    const animate = nodesOf({
      path: { from: "left 50%", to: "right 50%" },
      patterns: [{ type: "wave", wavelength: 100 }, { type: "wave", wavelength: 300 }],
      animate: { undulate: { speed: 40 } },
    }).find((n) => n.tag === "animate")!;
    expect(animate.attrs.dur).toBe("7500ms");
  });

  it.each(["constructor", "__proto__", "toString"])("%s is not a position keyword", (word) => {
    expect(() => resolvePoint(word, { width: 800, height: 400 })).toThrow();
  });
});
