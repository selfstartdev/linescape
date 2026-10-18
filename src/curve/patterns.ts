/**
 * Pattern profiles. Each maps a position along the pattern, q (in wavelengths),
 * to an offset from the backbone: dx along the direction of travel and dy to
 * the left, both in px. dx is periodic (zero at whole wavelengths), so it lets
 * a profile pause or step back (vertical risers, loops) without drifting.
 */
import type { PatternType } from "../spec/types";

export interface Offset {
  dx: number;
  dy: number;
}

export interface Profile {
  at(q: number, amplitude: number, wavelength: number): Offset;
  /** Positions within one wavelength (0 ≤ c < 1) where the direction changes abruptly. */
  corners: number[];
}

const TAU = Math.PI * 2;
const frac = (q: number) => q - Math.floor(q);

/**
 * A piecewise-linear profile through [q, x, y] vertices over one wavelength
 * (q and x both run 0 → 1; y in amplitudes). x standing still makes a riser.
 */
function polyline(vertices: [q: number, x: number, y: number][], corners: number[]): Profile {
  return {
    corners,
    at(q, amplitude, wavelength) {
      const f = frac(q);
      let i = 1;
      while (i < vertices.length - 1 && vertices[i]![0] < f) i++;
      const [q0, x0, y0] = vertices[i - 1]!, [q1, x1, y1] = vertices[i]!;
      const u = q1 > q0 ? (f - q0) / (q1 - q0) : 0;
      return { dx: (x0 + (x1 - x0) * u - f) * wavelength, dy: (y0 + (y1 - y0) * u) * amplitude };
    },
  };
}

export const PROFILES: Record<PatternType, Profile> = {
  wave: { corners: [], at: (q, a) => ({ dx: 0, dy: a * Math.sin(TAU * q) }) },
  ridges: polyline([[0, 0, 0], [0.25, 0.25, 1], [0.75, 0.75, -1], [1, 1, 0]], [0.25, 0.75]),
  steps: polyline([[0, 0, 0], [0.05, 0, 1], [0.45, 0.5, 1], [0.55, 0.5, -1], [0.95, 1, -1], [1, 1, 0]], [0.05, 0.45, 0.55, 0.95]),
  sawtooth: polyline([[0, 0, 0], [0.45, 0.5, 1], [0.55, 0.5, -1], [1, 1, 0]], [0.45, 0.55]),
  // Half-ellipse arches, parametrised by angle so the ends stay well behaved.
  scallop: {
    corners: [0],
    at(q, a, wl) {
      const f = frac(q);
      return { dx: ((1 - Math.cos(Math.PI * f)) / 2 - f) * wl, dy: a * Math.sin(Math.PI * f) };
    },
  },
  // Flat, then a smooth cosine bump over the middle half of each wavelength.
  bumps: {
    corners: [],
    at(q, a) {
      const f = frac(q);
      if (f <= 0.25 || f >= 0.75) return { dx: 0, dy: 0 };
      return { dx: 0, dy: (a * (1 - Math.cos(TAU * 2 * (f - 0.25)))) / 2 };
    },
  },
  // Prolate cycloid: one loop per wavelength, radius ≈ amplitude, on one side of the line.
  coil: { corners: [], at: (q, a) => ({ dx: a * Math.sin(TAU * q), dy: a * (1 - Math.cos(TAU * q)) }) },
};

/** A single sharp spike: up to the tip and back down over one wavelength. */
export const KINK: Profile = polyline([[0, 0, 0], [0.5, 0.5, 1], [1, 1, 0]], [0, 0.5]);

/** Smooth 0 → 1 over [0, 1]. */
export function smoothstep(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}
