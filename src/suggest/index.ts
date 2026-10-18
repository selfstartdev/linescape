/**
 * suggest(): a starting point instead of a blank page. Generates a complete,
 * static line from a seed; print it, paste it, change it. Nothing about the
 * output is random at render time.
 *
 * `keep` holds the parts you've settled on (say, the path and the paint); they
 * replace the generated ones, so shuffling only changes the rest.
 */
import { createRandom, type KeyPart, type Random } from "../random";
import type { FeatureInput, LineInput, Paint, PatternInput, Point, Stop } from "../spec/types";

export const SUGGESTION_KINDS = ["band", "sweep", "squiggle", "loops", "swirl", "ridges", "stripes", "brush", "coil", "frame"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface SuggestOptions {
  seed: KeyPart;
  /** What kind of line to make. Picked from the seed when left out. */
  kind?: SuggestionKind;
  /** Parts of the line to keep as they are. */
  keep?: Partial<LineInput>;
}

/** Curated palettes: each reads well as a gradient between neighbours and as bands. */
export const PALETTES: readonly (readonly string[])[] = [
  ["#ffd6c2", "#ffeab8", "#f9b4c8"],
  ["#7c5cff", "#a9b8f5", "#f9b4c8"],
  ["#1d3557", "#457b9d", "#a8dadc", "#f1faee"],
  ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"],
  ["#ef476f", "#ffd166", "#06d6a0", "#118ab2"],
  ["#3d405b", "#e07a5f", "#f2cc8f", "#81b29a"],
  ["#0b132b", "#3a506b", "#5bc0be", "#6fffe9"],
  ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"],
  ["#f72585", "#b5179e", "#7209b7", "#4361ee", "#4cc9f0"],
  ["#e9d8a6", "#ee9b00", "#ca6702", "#9b2226"],
  ["#d8e2dc", "#ffe5d9", "#ffcad4", "#f4acb7", "#9d8189"],
  ["#283618", "#606c38", "#fefae0", "#dda15e", "#bc6c25"],
];

// "|| 0" turns -0 into 0, so a spec survives a trip through JSON unchanged.
const round = (n: number, step = 1) => Math.round(n / step) * step || 0;
const pct = (n: number) => `${round(n)}%` as const;
const at = (x: number, y: number): Point => `${pct(x)} ${pct(y)}`;

interface Pick {
  r: Random;
  /** A number in [min, max], rounded to `step`. */
  num(key: string, min: number, max: number, step?: number): number;
  chance(key: string, p: number): boolean;
  one<T>(key: string, list: readonly T[]): T;
  /** A number in ±[min, max]: a random sign times num(). */
  signed(key: string, min: number, max: number, step?: number): number;
}

function picker(r: Random): Pick {
  return {
    r,
    num: (key, min, max, step = 1) => round(min + r.value(key) * (max - min), step),
    chance: (key, p) => r.value(key) < p,
    one: (key, list) => list[Math.min(list.length - 1, Math.floor(r.value(key) * list.length))]!,
    signed: (key, min, max, step = 1) => (r.value(`${key}.sign`) < 0.5 ? 1 : -1) * round(min + r.value(key) * (max - min), step) || 0,
  };
}

/** Relative luminance of a #rrggbb colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function stops(colors: readonly string[]): Stop[] {
  return colors.map((color, i) => ({ offset: colors.length === 1 ? 0 : round(i / (colors.length - 1), 0.0001), color }));
}

/** Two or three neighbouring colours from the palette, in order. */
function run(p: Pick, palette: readonly string[], key: string, n: number): string[] {
  const start = p.num(`${key}.start`, 0, Math.max(0, palette.length - n), 1);
  return palette.slice(start, start + n);
}

function paintFor(p: Pick, palette: readonly string[], style: "solid" | "gradient" | "along" | "any"): Paint {
  const kind = style === "any" ? p.one("paint.kind", ["solid", "solid", "gradient", "along"] as const) : style;
  // A solid line on its own needs contrast: skip the palette's near-white colours.
  if (kind === "solid") {
    const strong = palette.filter((c) => luminance(c) < 0.6);
    return p.one("paint.color", strong.length > 0 ? strong : [...palette].sort((a, b) => luminance(a) - luminance(b)).slice(0, 1));
  }
  const colors = run(p, palette, "paint.run", p.chance("paint.three", 0.3) && palette.length >= 3 ? 3 : 2);
  if (kind === "along") return { along: stops(colors) };
  return { linear: { angle: p.num("paint.angle", 0, 345, 15), stops: stops(colors) } };
}

/** A point on one edge, or just beyond it. */
function edgePoint(p: Pick, key: string, side: "left" | "right" | "top" | "bottom"): Point {
  const t = p.num(`${key}.t`, 15, 85);
  if (side === "left") return `left ${t}%`;
  if (side === "right") return `right ${t}%`;
  if (side === "top") return `${t}% -5%`;
  return `${t}% 105%`;
}

type Generator = (p: Pick, palette: readonly string[]) => LineInput;

const GENERATORS: Record<SuggestionKind, Generator> = {
  band: (p, palette) => ({
    path: { through: at(p.num("through.x", 35, 65), p.num("through.y", 35, 65)), angle: p.signed("angle", 6, 28) },
    width: p.num("width", 120, 300, 10),
    paint: paintFor(p, palette, "gradient"),
    ...(p.chance("faint", 0.3) ? { opacity: p.num("opacity", 0.5, 0.85, 0.05) } : {}),
  }),
  sweep: (p, palette) => {
    const features: FeatureInput[] = p.chance("loop", 0.6) ? [{ type: "loop", at: p.num("loop.at", 0.35, 0.65, 0.01), radius: p.num("loop.radius", 30, 70), side: p.one("loop.side", ["left", "right"] as const) }] : [];
    return {
      path: { from: edgePoint(p, "from", "left"), to: edgePoint(p, "to", "right"), bend: p.signed("bend", 0.03, 0.2, 0.01) },
      width: p.num("width", 18, 70, 2),
      ...(features.length ? { features } : {}),
      paint: paintFor(p, palette, "any"),
    };
  },
  squiggle: (p, palette) => {
    const pattern: PatternInput = {
      type: p.one("pattern", ["wave", "wave", "ridges", "scallop", "bumps"] as const),
      amplitude: p.num("amplitude", 8, 40),
      wavelength: p.num("wavelength", 50, 220, 5),
    };
    return {
      path: { from: at(p.num("from.x", 5, 20), p.num("from.y", 20, 80)), to: at(p.num("to.x", 80, 95), p.num("to.y", 20, 80)), bend: p.signed("bend", 0, 0.12, 0.01) },
      width: p.num("width", 6, 24),
      patterns: [pattern],
      paint: paintFor(p, palette, "solid"),
      ...(p.chance("draw", 0.4) ? { animate: { draw: { duration: p.num("draw.duration", 600, 1800, 100) } } } : {}),
    };
  },
  loops: (p, palette) => {
    const n = p.num("count", 1, 3);
    const side = p.one("side", ["left", "right"] as const);
    const features: FeatureInput[] = Array.from({ length: n }, (_, i) => ({
      type: "loop",
      at: round((i + 1) / (n + 1) + (p.r.value("at", i) - 0.5) * 0.1, 0.01),
      radius: p.num(`radius.${i}`, 18, 48),
      side,
    }));
    return {
      path: { from: edgePoint(p, "from", "left"), to: edgePoint(p, "to", "right"), bend: p.signed("bend", 0, 0.12, 0.01) },
      width: p.num("width", 8, 28),
      features,
      paint: paintFor(p, palette, "solid"),
    };
  },
  swirl: (p, palette) => {
    const corner = p.one("corner", ["top-left", "top-right", "bottom-left", "bottom-right"] as const);
    const [h, v] = corner.split("-") as ["top" | "bottom", "left" | "right"];
    const x = v === "left" ? p.num("end.x", 10, 22) : p.num("end.x", 78, 90);
    const y = h === "top" ? p.num("end.y", 12, 25) : p.num("end.y", 75, 88);
    return {
      path: { from: edgePoint(p, "from", p.chance("from.side", 0.5) ? h : v), to: at(x, y), bend: p.signed("bend", 0, 0.15, 0.01) },
      width: p.num("width", 10, 36, 2),
      features: [{ type: "spiral", at: "end", radius: p.num("radius", 70, 170, 5), turns: p.num("turns", 1.5, 3, 0.25), side: p.one("side", ["left", "right"] as const) }],
      paint: paintFor(p, palette, "solid"),
    };
  },
  ridges: (p, palette) => ({
    path: {
      points: [
        at(p.num("p0.x", 55, 80), -5),
        at(p.num("p1.x", 20, 45), p.num("p1.y", 25, 40)),
        at(p.num("p2.x", 55, 80), p.num("p2.y", 60, 75)),
        at(p.num("p3.x", 25, 45), 105),
      ],
    },
    width: p.num("width", 24, 80, 2),
    patterns: [{ type: p.one("pattern", ["ridges", "steps", "sawtooth"] as const), amplitude: p.num("amplitude", 16, 40), wavelength: p.num("wavelength", 80, 180, 5), range: [0.12, 0.88], ease: p.num("ease", 80, 240, 10) }],
    paint: paintFor(p, palette, "any"),
  }),
  stripes: (p, palette) => {
    const n = Math.min(palette.length, p.num("count", 2, 4));
    const outer = p.num("width", 140, 300, 10);
    const colors = run(p, palette, "colors", n);
    return {
      path: { from: edgePoint(p, "from", "left"), to: edgePoint(p, "to", "right"), bend: p.signed("bend", 0, 0.18, 0.01) },
      bands: colors.map((paint, i) => ({ width: round(outer * (1 - i / n), 2), paint })),
    };
  },
  brush: (p, palette) => ({
    path: { from: at(p.num("from.x", 5, 20), p.num("from.y", 55, 85)), to: at(p.num("to.x", 80, 95), p.num("to.y", 15, 45)), bend: p.signed("bend", 0.05, 0.2, 0.01) },
    width: p.num("width", 60, 160, 5),
    taper: { start: p.num("taper.start", 120, 320, 10), end: p.num("taper.end", 300, 700, 10) },
    paint: paintFor(p, palette, p.chance("along", 0.6) ? "along" : "solid"),
  }),
  coil: (p, palette) => ({
    path: { from: edgePoint(p, "from", "left"), to: edgePoint(p, "to", "right"), bend: p.signed("bend", 0, 0.1, 0.01) },
    width: p.num("width", 4, 12),
    patterns: [{ type: "coil", amplitude: p.num("amplitude", 24, 56), wavelength: p.num("wavelength", 50, 110, 5), range: [0.1, 0.9], ease: p.num("ease", 80, 200, 10) }],
    paint: paintFor(p, palette, "solid"),
  }),
  frame: (p, palette) => {
    const dots = p.chance("dots", 0.5);
    return {
      path: { ring: { center: "center", radius: [pct(p.num("rx", 38, 48)), pct(p.num("ry", 34, 46))] } },
      width: dots ? p.num("width", 6, 12) : p.num("width", 2, 6),
      dash: dots ? { dots: p.num("dots", 16, 32) } : [p.num("dash", 10, 40), p.num("gap", 8, 24)],
      paint: paintFor(p, palette, "solid"),
      ...(p.chance("flow", 0.4) ? { animate: { flow: { speed: p.num("flow", 20, 80, 5) } } } : {}),
    };
  },
};

/** Generates a complete line from a seed. The same seed and options always give the same line. */
export function suggest({ seed, kind, keep }: SuggestOptions): LineInput {
  const root = createRandom(seed);
  const k = kind ?? picker(root.fork("kind")).one("kind", SUGGESTION_KINDS);
  if (!SUGGESTION_KINDS.includes(k)) throw new TypeError(`linescape: unknown suggestion kind ${JSON.stringify(k)}`);
  const palette = picker(root.fork("palette")).one("palette", PALETTES);
  const line = GENERATORS[k](picker(root.fork(k)), palette);
  return keep ? { ...line, ...keep } : line;
}
