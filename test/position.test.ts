import { describe, expect, it } from "vitest";
import { resolveLength, resolvePoint } from "../src";

const size = { width: 1000, height: 500 };

describe("resolvePoint", () => {
  it.each([
    ["center", 500, 250],
    ["left", 0, 250],
    ["right", 1000, 250],
    ["top", 500, 0],
    ["bottom", 500, 500],
    ["30%", 300, 250],
    ["120px", 120, 250],
    ["left 30%", 0, 150],
    ["top left", 0, 0],
    ["left top", 0, 0],
    ["bottom right", 1000, 500],
    ["center top", 500, 0],
    ["top center", 500, 0],
    ["30% 40px", 300, 40],
    ["-10% 50%", -100, 250],
    ["right 40px top 10%", 960, 50],
    ["left 25% bottom 20px", 250, 480],
    ["right 40px bottom", 960, 500],
    ["bottom 10% right", 1000, 450],
  ])("%s", (position, x, y) => {
    const p = resolvePoint(position, size);
    expect(p.x).toBeCloseTo(x);
    expect(p.y).toBeCloseTo(y);
  });

  it("takes [x, y] lengths", () => {
    expect(resolvePoint([40, "50%"], size)).toEqual({ x: 40, y: 250 });
    expect(resolvePoint(["-5%", -20], size)).toEqual({ x: -50, y: -20 });
  });

  it.each(["", "left right", "top bottom", "middle", "40px left", "left 10% 20%", "a b c d e"])("rejects %j", (position) => {
    expect(() => resolvePoint(position, size)).toThrow(/linescape/);
  });
});

describe("resolveLength", () => {
  it("reads px and percentages", () => {
    expect(resolveLength(12, 400)).toBe(12);
    expect(resolveLength("25%", 400)).toBe(100);
    expect(() => resolveLength("12em" as never, 400)).toThrow(/linescape/);
    expect(() => resolveLength(Number.NaN, 400)).toThrow(/linescape/);
  });
});
