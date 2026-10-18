/**
 * Golden tests: the stability promise.
 *
 * Same spec + same element size + same major version = identical output. If a
 * golden file changes, the generated output changed, and from 1.0 that is a
 * MAJOR release. Never update these with `vitest -u` to make a failure go away;
 * treat it as a deliberate decision and record it in a changeset.
 */
import { describe, expect, it } from "vitest";
import { presets, toSvg, type LineInput } from "../src";
import { designs } from "./designs";

const sizes = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

describe("golden", () => {
  for (const [name, line] of Object.entries(designs)) {
    it.each(sizes)(`design ${name} at $name size`, async ({ name: sizeName, width, height }) => {
      await expect(toSvg(line, { width, height }) + "\n").toMatchFileSnapshot(`golden/designs/${name}-${sizeName}.svg`);
    });
  }
});

const rainbow = [
  { offset: 0, color: "#ff595e" },
  { offset: 0.5, color: "#8ac926" },
  { offset: 1, color: "#6a4c93" },
];

/** One of everything the designs don't cover. */
const extras: Record<string, LineInput[]> = {
  patterns: (["wave", "ridges", "steps", "sawtooth", "scallop", "bumps", "coil"] as const).map((type, i) => ({
    path: { from: [40, 60 + i * 110], to: [1400, 60 + i * 110] },
    width: 10,
    patterns: [{ type, range: [0.05, 0.95] }],
  })),
  features: [
    { path: { from: "left 20%", to: "right 20%" }, width: 16, features: [{ type: "loop", at: 0.3 }, { type: "loop", at: 0.7, turns: 2, side: "right" }] },
    { path: { from: "left 50%", to: "right 50%" }, width: 16, features: [{ type: "kink", at: 0.3 }, { type: "kink", at: 0.6, angle: 20, length: 120, side: "right" }] },
    { path: { from: "20% 80%", to: "80% 80%" }, width: 16, features: [{ type: "spiral", at: "start", radius: 60 }, { type: "spiral", at: "end", radius: 60, side: "right" }] },
  ],
  paths: [
    { path: { arc: { center: "center", radius: "20%", start: 200, end: 340 } }, width: 20 },
    { path: { ring: { center: "center", radius: ["40%", "30%"] } }, width: 12, patterns: [{ type: "wave", amplitude: 10, wavelength: 80 }] },
    { path: { points: [[100, 100], [400, 300], [700, 100], [1000, 300]], smooth: 0 }, width: 30 },
    { path: { d: "M0 1 C 0.3 0.2 0.7 0.8 1 0", viewBox: [0, 0, 1, 1] }, width: 24 },
  ],
  paint: [
    { path: { from: "left 10%", to: "right 10%" }, width: 20, dash: [40, 20], cap: "butt" },
    { path: { from: "left 20%", to: "right 20%" }, width: 20, dash: { dots: 36 } },
    { path: { from: "left 40%", to: "right 40%" }, width: 100, outline: { width: 14 }, patterns: [{ type: "wave", amplitude: 30, wavelength: 300 }] },
    { path: { from: "left 65%", to: "right 65%" }, width: 110, patterns: [{ type: "ridges", amplitude: 50, wavelength: 260 }], paint: { along: rainbow } },
    { path: { from: "10% 90%", to: "90% 85%" }, width: 120, taper: { start: 300, end: 500 }, paint: { radial: { stops: rainbow } } },
  ],
  animation: [
    { path: { from: "left 30%", to: "right 30%" }, width: 30, animate: { draw: { from: "center" }, trigger: "visible" } },
    { path: { from: "left 50%", to: "right 50%" }, width: 30, dash: [20, 10], animate: { flow: true, draw: true, trigger: "scroll" } },
    { path: { from: "left 70%", to: "right 70%" }, width: 30, patterns: [{ type: "wave" }], animate: { undulate: true, draw: { from: "end" }, repeat: "infinite" } },
  ],
};

describe("golden extras", () => {
  it.each(Object.entries(extras))("%s", async (name, lines) => {
    await expect(toSvg(lines, { width: 1440, height: 900 }) + "\n").toMatchFileSnapshot(`golden/extras/${name}.svg`);
  });
});

describe("golden presets", () => {
  it.each(Object.entries(presets))("%s", async (name, line) => {
    await expect(toSvg(line, { width: 1440, height: 900 }) + "\n").toMatchFileSnapshot(`golden/presets/${name}.svg`);
  });
});
