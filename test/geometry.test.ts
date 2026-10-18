import { describe, expect, it } from "vitest";
import { buildBackbone, buildCurve, emit, pathLength, resolve, type LineInput } from "../src";
import { measurePath, slicePath } from "../src/emit/slice";
import { segmentAt } from "../src/geometry";

const size = { width: 1000, height: 500 };

describe("backbone", () => {
  it("runs a `through` line from edge to edge, past the bleed", () => {
    const b = buildBackbone({ through: "center", angle: 0 }, size, { width: 40 });
    const r = 40 * 0.75 + 2;
    expect(b.at(0).p.x).toBeCloseTo(-r);
    expect(b.at(b.length).p.x).toBeCloseTo(1000 + r);
    expect(b.visible[0]).toBeCloseTo(r);
    expect(b.visible[1]).toBeCloseTo(1000 + r);
  });

  it("extends endpoints on an edge outward, and only those", () => {
    const b = buildBackbone({ from: "left 50%", to: "60% 50%" }, size, { width: 40 });
    expect(b.at(0).p.x).toBeLessThan(-30);
    expect(b.at(b.length).p.x).toBeCloseTo(600);
    expect(b.visible[1]).toBeCloseTo(b.length);
  });

  it("doesn't extend along an edge", () => {
    const b = buildBackbone({ from: "20% 100%", to: "80% 100%" }, size, { width: 10 });
    expect(b.length).toBeCloseTo(600);
  });

  it("measures arc length accurately", () => {
    const b = buildBackbone({ arc: { center: "center", radius: 100, start: 0, end: 180 } }, size, { width: 10 });
    expect(b.length).toBeCloseTo(Math.PI * 100, 0);
    const mid = b.at(b.length / 2).p;
    expect(mid.x).toBeCloseTo(500, 0);
    expect(mid.y).toBeCloseTo(350, 0);
  });

  it("bends to the left of travel for positive bend", () => {
    const b = buildBackbone({ from: [100, 250], to: [900, 250], bend: 0.1 }, size, { width: 10 });
    expect(b.at(b.length / 2).p.y).toBeCloseTo(250 - 80, 0);
  });

  it("finds corners of straight point paths", () => {
    const b = buildBackbone({ points: [[100, 100], [500, 400], [900, 100]], smooth: 0 }, size, { width: 10 });
    expect(b.corners).toHaveLength(1);
    expect(b.corners[0]).toBeCloseTo(500);
  });

  it("closes rings", () => {
    const b = buildBackbone({ ring: { center: "center", radius: 100 } }, size, { width: 10 });
    expect(b.closed).toBe(true);
    expect(b.length).toBeCloseTo(2 * Math.PI * 100, 0);
  });

  it("stretches `d` paths with a viewBox", () => {
    const b = buildBackbone({ d: "M0 0.5 L1 0.5", viewBox: [0, 0, 1, 1] }, size, { width: 10 });
    expect(b.at(b.visible[0]).p).toEqual({ x: 0, y: 250 });
  });
});

describe("loops", () => {
  const height = (roundness: number) => {
    const line = resolve({ path: { from: [0, 400], to: [1000, 400] }, features: [{ type: "loop", at: 0.5, radius: 60, roundness }] });
    let top = Infinity;
    for (const piece of buildCurve(line, { width: 1000, height: 800 }).pieces) {
      for (let i = 0; i <= 1000; i++) top = Math.min(top, piece.at(piece.t0 + ((piece.t1 - piece.t0) * i) / 1000).y);
    }
    return 400 - top;
  };

  it("are twice their radius tall, however round", () => {
    for (const r of [0, 0.4, 1]) expect(height(r)).toBeCloseTo(120, 0);
  });
});

describe("emit", () => {
  const fits = (input: LineInput) => {
    const line = resolve(input);
    const curve = buildCurve(line, size);
    const path = emit(curve);
    // Every emitted segment's midpoint lies on the curve: compare against dense samples.
    const samples: { x: number; y: number }[] = [];
    for (const piece of curve.pieces) for (let i = 0; i <= 4000; i++) samples.push(piece.at(piece.t0 + ((piece.t1 - piece.t0) * i) / 4000));
    let worst = 0;
    let from = path.start;
    for (const s of path.segments) {
      const mid = segmentAt(from, s, 0.5);
      let nearest = Infinity;
      for (const q of samples) nearest = Math.min(nearest, Math.hypot(q.x - mid.x, q.y - mid.y));
      worst = Math.max(worst, nearest);
      from = s.to;
    }
    return { path, worst };
  };

  it("emits a straight line as one segment", () => {
    const { path } = fits({ path: { from: [100, 100], to: [900, 400] } });
    expect(path.segments).toHaveLength(1);
    expect(path.segments[0]!.type).toBe("L");
  });

  it.each(["wave", "ridges", "steps", "sawtooth", "scallop", "bumps", "coil"] as const)("fits a %s within tolerance", (type) => {
    const { worst } = fits({ path: { from: [50, 250], to: [950, 250], bend: 0.1 }, patterns: [{ type }] });
    expect(worst).toBeLessThan(2);
  });

  it("keeps whole wavelengths, so patterns end on the backbone", () => {
    const line = resolve({ path: { from: [0, 250], to: [1000, 250] }, patterns: [{ type: "wave", amplitude: 50, wavelength: 170, range: [0.1, 0.9] }] });
    const curve = buildCurve(line, { width: 1000, height: 500 });
    const main = curve.pieces[0]!;
    const backboneLength = curve.backbone.length;
    const end = main.at(backboneLength * 0.9 + curve.backbone.visible[0] * 0.1);
    expect(Math.abs(end.y - 250)).toBeLessThan(1);
  });

  it("measures lengths", () => {
    const line = resolve({ path: { from: [100, 100], to: [400, 500] } });
    expect(pathLength(emit(buildCurve(line, { width: 1000, height: 1000 })))).toBeCloseTo(500);
  });

  it("slices by arc length", () => {
    const line = resolve({ path: { arc: { center: "center", radius: 100, start: 0, end: 360 } } });
    const m = measurePath(emit(buildCurve(line, size)));
    const half = slicePath(m, 0, m.length / 2);
    expect(pathLength(half)).toBeCloseTo(Math.PI * 100, 0);
  });

  it("uniform emission has the same commands at any phase", () => {
    const line = resolve({ path: { from: "left", to: "right", bend: 0.2 }, patterns: [{ type: "ridges" }], features: [{ type: "spiral", at: "end", radius: 60 }] });
    const shape = (shift: number) => emit(buildCurve(line, size, { shift, uniform: true }), { uniform: true }).segments.map((s) => s.type).join("");
    expect(shape(0.3)).toBe(shape(0));
    expect(shape(0.77)).toBe(shape(0));
  });
});
