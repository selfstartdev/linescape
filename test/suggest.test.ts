import { describe, expect, it } from "vitest";
import { resolve, suggest, SUGGESTION_KINDS, toSvg } from "../src";

describe("suggest", () => {
  it("is deterministic", () => {
    expect(suggest({ seed: "a" })).toEqual(suggest({ seed: "a" }));
    expect(suggest({ seed: 42, kind: "band" })).toEqual(suggest({ seed: 42, kind: "band" }));
  });

  it("varies with the seed", () => {
    const lines = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(suggest({ seed: i }))));
    expect(lines.size).toBe(20);
  });

  it("picks every kind from seeds", () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const line = suggest({ seed: i });
      // Recognise the kind from what's in it: every kind has a distinct shape of spec.
      kinds.add(JSON.stringify(Object.keys(line).sort()) + ("through" in line.path ? "through" : "ring" in line.path ? "ring" : "points" in line.path ? "points" : ""));
    }
    expect(kinds.size).toBeGreaterThan(6);
  });

  it.each(SUGGESTION_KINDS)("makes valid, static %s lines that render", (kind) => {
    for (let i = 0; i < 25; i++) {
      const line = suggest({ seed: `${kind}-${i}`, kind });
      expect(() => resolve(line)).not.toThrow();
      expect(JSON.parse(JSON.stringify(line))).toEqual(line);
      expect(toSvg(line, { width: 1200, height: 700 })).toMatch(/^<svg/);
      expect(toSvg(line, { width: 390, height: 844 })).toMatch(/^<svg/);
    }
  });

  it("keeps what you lock", () => {
    const keep = { path: { through: "center", angle: 5 }, paint: "#123456" } as const;
    for (let i = 0; i < 10; i++) {
      const line = suggest({ seed: i, keep });
      expect(line.path).toEqual(keep.path);
      expect(line.paint).toBe("#123456");
    }
  });

  it("rejects unknown kinds", () => {
    expect(() => suggest({ seed: 1, kind: "spaghetti" as never })).toThrow(/linescape/);
  });
});
