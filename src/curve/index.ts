/**
 * Curve: the final centerline. The backbone, displaced by patterns and features,
 * with spirals attached at the ends. Expressed as smooth pieces (split wherever
 * the direction can change abruptly) for the emitter to turn into path data.
 */
import { buildBackbone, type Backbone } from "../backbone";
import { add, cross, normalize, rightOf, scale, sub, type Vec } from "../geometry";
import type { Size } from "../spec/position";
import type { Feature, Line, Pattern } from "../spec/types";
import { KINK, PROFILES, smoothstep, type Profile } from "./patterns";

export interface Piece {
  t0: number;
  t1: number;
  at(t: number): Vec;
  /** Largest parameter step the emitter may take before checking its fit. */
  maxStep: number;
}

export interface Curve {
  pieces: Piece[];
  closed: boolean;
  backbone: Backbone;
  /**
   * Where the curve meets the element's edge at each end, or null where it doesn't bleed past it (closed
   * paths, spirals, ends inside the element). Taper and `along` colours are measured from these points.
   */
  edges: [start: Vec | null, end: Vec | null];
}

export interface CurveOptions {
  /** Added to every pattern's phase, in wavelengths of the longest pattern (used by `undulate`). */
  shift?: number;
  /**
   * Fixed sampling that doesn't depend on pattern phase, so every frame of an
   * `undulate` animation has the same path commands.
   */
  uniform?: boolean;
}

interface ActivePattern {
  profile: Profile;
  amplitude: number;
  wavelength: number;
  phase: number;
  sign: number;
  a: number;
  b: number;
  ease: number;
}

interface ActiveFeature {
  profile: Profile;
  amplitude: number;
  wavelength: number;
  sign: number;
  a: number;
  b: number;
}

const DEFAULT_MAX_STEP = 400;

/**
 * How far a loop doubles back (2π · amplitude / wavelength of its coil turn), from roundness 0 to 1.
 * 3 is a cursive teardrop; by 16 the turn is nearly a circle. Spaced geometrically, so equal steps of
 * roundness look like equal changes.
 */
const LOOPINESS = [3, 16] as const;

export function buildCurve(line: Line, size: Size, { shift = 0, uniform = false }: CurveOptions = {}): Curve {
  const spiralStart = line.features.find((f): f is Extract<Feature, { type: "spiral" }> => f.type === "spiral" && f.at === "start");
  const spiralEnd = line.features.find((f): f is Extract<Feature, { type: "spiral" }> => f.type === "spiral" && f.at === "end");
  const backbone = buildBackbone(line.path, size, { width: line.width, bleedStart: !spiralStart, bleedEnd: !spiralEnd });
  const L = backbone.length;
  const [v0, v1] = backbone.visible;
  const closed = backbone.closed;
  // Range ends at 0 or 1 reach through the bleed, so a pattern runs right off the edge.
  const toS = (f: number) => (closed ? f * L : f === 0 ? 0 : f === 1 ? L : v0 + f * (v1 - v0));

  const cycle = undulateWavelength(line);
  const patterns: ActivePattern[] = line.patterns.map((p: Pattern) => {
    const a = toS(p.range[0]), b = toS(p.range[1]);
    // A whole number of repeats fits the range, so the pattern ends where it started (back on the
    // backbone) instead of breaking off mid-wave. On a closed ring that also makes it meet itself.
    const wavelength = (b - a) / Math.max(1, Math.round((b - a) / p.wavelength));
    // Every pattern moves a whole number of its own wavelengths per undulate cycle, so the cycle loops
    // seamlessly. The cycle is the longest pattern's, so each one's speed is as close to `speed` as whole
    // numbers allow (exact when the wavelengths divide the longest).
    const cycles = Math.max(1, Math.round(cycle / p.wavelength));
    const phase = p.phase - shift * cycles;
    // Shifted along (by phase, or while undulating), a pattern no longer starts at zero: ease it in and
    // out. Not round a whole ring, where it already meets itself.
    const wholeRing = closed && a <= 0 && b >= L;
    const shifted = !wholeRing && (uniform || Math.abs(phase - Math.round(phase)) > 1e-9);
    return {
      profile: PROFILES[p.type],
      amplitude: p.amplitude,
      wavelength,
      phase,
      sign: p.side === "left" ? 1 : -1,
      a,
      b,
      ease: shifted ? Math.max(p.ease, wavelength / 2) : p.ease,
    };
  });

  const features: ActiveFeature[] = [];
  for (const f of line.features) {
    if (f.type === "spiral") continue;
    const s = v0 + f.at * (v1 - v0);
    const sign = f.side === "left" ? 1 : -1;
    if (f.type === "loop") {
      // One coil turn per loop. Its height is 2 × amplitude whatever the loopiness, so `radius` (half the
      // height) sets the size and `roundness` only the shape.
      const turns = Math.max(1, Math.round(f.turns));
      const k = LOOPINESS[0] * (LOOPINESS[1] / LOOPINESS[0]) ** f.roundness;
      const amplitude = f.radius;
      const wavelength = (2 * Math.PI * amplitude) / k;
      const span = turns * wavelength;
      features.push({ profile: PROFILES.coil, amplitude, wavelength, sign, a: s - span / 2, b: s + span / 2 });
    } else {
      const wavelength = 2 * f.length * Math.tan(((f.angle / 2) * Math.PI) / 180);
      features.push({ profile: KINK, amplitude: f.length, wavelength, sign, a: s - wavelength / 2, b: s + wavelength / 2 });
    }
  }

  // On a closed path a feature near the seam reaches past 0 or L: look for t a lap either side too.
  const laps = closed ? [0, -L, L] : [0];
  const wrap = (t: number) => (closed ? ((t % L) + L) % L : t);

  // Patterns fade out around features, so a loop or kink always starts from the plain backbone.
  const mask = (t: number): number => {
    let m = 1;
    for (const f of features) {
      const gap = Math.min(60, (f.b - f.a) / 2);
      const outside = Math.min(...laps.map((k) => (t + k < f.a ? f.a - t - k : t + k > f.b ? t + k - f.b : 0)));
      m *= outside === 0 ? 0 : smoothstep(outside / gap);
    }
    return m;
  };

  const main = (t: number): Vec => {
    let dx = 0, dy = 0;
    const m = features.length > 0 ? mask(t) : 1;
    if (m > 0) {
      for (const p of patterns) {
        if (t < p.a || t > p.b) continue;
        let env = m;
        if (p.ease > 0) env *= Math.min(smoothstep((t - p.a) / p.ease), smoothstep((p.b - t) / p.ease));
        if (env === 0) continue;
        const o = p.profile.at((t - p.a) / p.wavelength + p.phase, p.amplitude, p.wavelength);
        dx += o.dx * env;
        dy += o.dy * env * p.sign;
      }
    }
    for (const f of features) {
      const k = laps.find((k) => t + k > f.a && t + k < f.b);
      if (k === undefined) continue;
      const o = f.profile.at((t + k - f.a) / f.wavelength, f.amplitude, f.wavelength);
      dx += o.dx;
      dy += o.dy * f.sign;
    }
    const frame = backbone.at(t + dx);
    // dy is to the left of travel: the opposite of rightOf on screen.
    return add(frame.p, scale(rightOf(frame.t), -dy));
  };

  // Where the main curve may turn abruptly: the pieces split there.
  const breaks = new Set<number>(backbone.corners);
  for (const p of patterns) {
    if (p.a > 0) breaks.add(p.a);
    if (p.b < L) breaks.add(p.b);
    if (uniform) continue;
    for (const c of p.profile.corners) {
      // Corner positions t where (t − a) / wavelength + phase ≡ c (mod 1).
      const first = Math.ceil((0 - c + p.phase) - 1e-9);
      for (let k = first; ; k++) {
        const t = p.a + (k + c - p.phase) * p.wavelength;
        if (t >= p.b) break;
        if (t > p.a) breaks.add(t);
      }
    }
  }
  for (const f of features) {
    breaks.add(wrap(f.a));
    breaks.add(wrap(f.b));
    for (const c of f.profile.corners) if (c > 0) breaks.add(wrap(f.a + c * f.wavelength));
  }
  const knots = [0, ...[...breaks].filter((t) => t > 1e-6 && t < L - 1e-6).sort((x, y) => x - y), L].filter(
    (t, i, all) => i === 0 || t - all[i - 1]! > 1e-6,
  );

  let maxStep = DEFAULT_MAX_STEP;
  for (const p of patterns) maxStep = Math.min(maxStep, p.wavelength / (p.profile === PROFILES.coil ? 8 : 4));
  for (const f of features) maxStep = Math.min(maxStep, f.wavelength / 8);
  if (uniform) maxStep = Math.min(maxStep, ...patterns.map((p) => p.wavelength / 12));

  const pieces: Piece[] = [];
  for (let i = 1; i < knots.length; i++) pieces.push({ t0: knots[i - 1]!, t1: knots[i]!, at: main, maxStep });

  if (!closed) {
    const h = Math.min(0.5, L / 1000);
    if (spiralStart) {
      const p0 = main(0);
      const t0 = normalize(sub(main(h), p0));
      // Built backwards from the line's start, then reversed so it's travelled into the line.
      const s = spiral(p0, scale(t0, -1), spiralStart.side === "left" ? "right" : "left", spiralStart);
      pieces.unshift({ t0: 0, t1: s.end, at: (t) => s.at(s.end - t), maxStep: Math.PI / 6 });
    }
    if (spiralEnd) {
      const p1 = main(L);
      const t1 = normalize(sub(p1, main(L - h)));
      const s = spiral(p1, t1, spiralEnd.side, spiralEnd);
      pieces.push({ t0: 0, t1: s.end, at: s.at, maxStep: Math.PI / 6 });
    }
  }

  const edges: Curve["edges"] = [
    !closed && !spiralStart && v0 > 1e-6 ? main(v0) : null,
    !closed && !spiralEnd && v1 < L - 1e-6 ? main(v1) : null,
  ];
  return { pieces, closed, backbone, edges };
}

/** The wavelength one undulate cycle moves by: the longest pattern's. */
export function undulateWavelength(line: Line): number {
  return Math.max(1, ...line.patterns.map((p) => p.wavelength));
}

/**
 * A spiral starting at p heading along t, curling towards `side` and tightening
 * to `inner` × radius. The radius shrinks from zero slope, so it leaves p
 * exactly along t.
 */
function spiral(p: Vec, t: Vec, side: "left" | "right", f: { radius: number; turns: number; inner: number }): { at(phi: number): Vec; end: number } {
  const left = scale(rightOf(t), -1);
  const center = add(p, scale(side === "left" ? left : scale(left, -1), f.radius));
  const v0 = normalize(sub(p, center));
  const dir = Math.sign(cross(v0, t)) || 1;
  const end = 2 * Math.PI * f.turns;
  return {
    end,
    at(phi) {
      const r = f.radius * (1 - (1 - f.inner) * Math.pow(phi / end, 1.5));
      const a = dir * phi;
      const c = Math.cos(a), s = Math.sin(a);
      return { x: center.x + r * (v0.x * c - v0.y * s), y: center.y + r * (v0.x * s + v0.y * c) };
    },
  };
}
