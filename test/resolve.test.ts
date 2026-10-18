import { describe, expect, it } from "vitest";
import { resolve, type LineInput } from "../src";
import { designs } from "./designs";

describe("resolve", () => {
  it("fills defaults", () => {
    const line = resolve({ path: { from: "left", to: "right" } });
    expect(line).toEqual({
      path: { from: "left", to: "right", bend: 0 },
      patterns: [],
      features: [],
      width: 40,
      cap: "round",
      join: "round",
      dash: null,
      taper: null,
      opacity: 1,
      blend: null,
      paint: "currentColor",
      bands: null,
      outline: null,
      animate: null,
    });
  });

  it("fills pattern, feature and animation defaults", () => {
    const line = resolve({
      path: { through: "center", angle: 10 },
      patterns: [{ type: "ridges" }],
      features: [{ type: "loop", at: 0.5 }, { type: "spiral", at: "end" }],
      animate: { draw: true },
    });
    expect(line.patterns).toEqual([{ type: "ridges", amplitude: 24, wavelength: 96, range: [0, 1], ease: 0, phase: 0, side: "left" }]);
    expect(line.features).toEqual([
      { type: "loop", at: 0.5, radius: 40, turns: 1, side: "left" },
      { type: "spiral", at: "end", radius: 120, turns: 2, inner: 0.2, side: "left" },
    ]);
    expect(line.animate).toEqual({
      draw: { duration: 1200, delay: 0, easing: "ease-in-out", from: "start" },
      flow: null,
      undulate: null,
      trigger: "load",
      repeat: 1,
    });
  });

  it("takes the widest band as the width", () => {
    expect(resolve(designs.stripes!).width).toBe(260);
    expect(resolve({ path: { from: "left", to: "right" }, bands: [{ width: 30, paint: "red" }, { width: 90, paint: "blue" }] }).width).toBe(90);
  });

  it("turns dots into zero-length dashes with round caps", () => {
    const line = resolve({ path: { from: "left", to: "right" }, dash: { dots: 20 }, cap: "butt" });
    expect(line.dash).toEqual([0, 20]);
    expect(line.cap).toBe("round");
  });

  it("is idempotent", () => {
    for (const input of Object.values(designs)) {
      const once = resolve(input);
      expect(resolve(once)).toEqual(once);
    }
    const animated: LineInput = { path: { from: "left", to: "right" }, animate: { draw: true, undulate: { speed: 10 } }, dash: [10, 5], taper: { end: 50 } };
    const once = resolve(animated);
    expect(resolve(once)).toEqual(once);
  });

  it("output is JSON-serialisable", () => {
    for (const input of Object.values(designs)) {
      const line = resolve(input);
      expect(JSON.parse(JSON.stringify(line))).toEqual(line);
    }
  });

  it.each<[string, LineInput]>([
    ["missing path", {} as LineInput],
    ["bad width", { path: { from: "left", to: "right" }, width: 0 }],
    ["bad pattern type", { path: { from: "left", to: "right" }, patterns: [{ type: "spiral" as never }] }],
    ["backwards range", { path: { from: "left", to: "right" }, patterns: [{ type: "wave", range: [0.6, 0.2] }] }],
    ["feature at > 1", { path: { from: "left", to: "right" }, features: [{ type: "loop", at: 1.5 }] }],
    ["spiral at a number", { path: { from: "left", to: "right" }, features: [{ type: "spiral", at: 0.5 as never }] }],
    ["kink angle", { path: { from: "left", to: "right" }, features: [{ type: "kink", at: 0.5, angle: 180 }] }],
    ["opacity > 1", { path: { from: "left", to: "right" }, opacity: 2 }],
    ["one point", { path: { points: ["left"] } }],
    ["bad trigger", { path: { from: "left", to: "right" }, animate: { draw: true, trigger: "hover" as never } }],
    ["empty stops", { path: { from: "left", to: "right" }, paint: { linear: { angle: 0, stops: [] } } }],
  ])("rejects %s", (_name, input) => {
    expect(() => resolve(input)).toThrow(/^linescape: /);
  });
});
