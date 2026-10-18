/**
 * Geometry primitives: points, Bézier segments, path data and its formatting.
 */
export interface Vec {
  x: number;
  y: number;
}

export type Segment =
  | { type: "L"; to: Vec }
  | { type: "Q"; control: Vec; to: Vec }
  | { type: "C"; c1: Vec; c2: Vec; to: Vec };

/** A single subpath: start point plus segments, optionally closed. */
export interface PathData {
  start: Vec;
  segments: Segment[];
  closed: boolean;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function normalize(a: Vec): Vec {
  const l = length(a);
  return l === 0 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Rotated 90° clockwise on screen (SVG's y points down): the right-hand side of travel along `a`. */
export const rightOf = (a: Vec): Vec => ({ x: -a.y, y: a.x });

export const fromAngle = (deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r), y: Math.sin(r) };
};

function quadAt(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

function cubicAt(p0: number, c1: number, c2: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1;
}

/** Point on a segment at t ∈ [0, 1], starting from `from`. */
export function segmentAt(from: Vec, s: Segment, t: number): Vec {
  switch (s.type) {
    case "L":
      return lerp(from, s.to, t);
    case "Q":
      return { x: quadAt(from.x, s.control.x, s.to.x, t), y: quadAt(from.y, s.control.y, s.to.y, t) };
    case "C":
      return { x: cubicAt(from.x, s.c1.x, s.c2.x, s.to.x, t), y: cubicAt(from.y, s.c1.y, s.c2.y, s.to.y, t) };
  }
}

/** Derivative d/dt of a segment at t. */
export function segmentDerivative(from: Vec, s: Segment, t: number): Vec {
  const u = 1 - t;
  switch (s.type) {
    case "L":
      return sub(s.to, from);
    case "Q":
      return {
        x: 2 * u * (s.control.x - from.x) + 2 * t * (s.to.x - s.control.x),
        y: 2 * u * (s.control.y - from.y) + 2 * t * (s.to.y - s.control.y),
      };
    case "C":
      return {
        x: 3 * u * u * (s.c1.x - from.x) + 6 * u * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.to.x - s.c2.x),
        y: 3 * u * u * (s.c1.y - from.y) + 6 * u * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.to.y - s.c2.y),
      };
  }
}

/** Unit tangent at t, falling back to the chord where the derivative vanishes (e.g. a control point on an end point). */
export function segmentTangent(from: Vec, s: Segment, t: number): Vec {
  const d = segmentDerivative(from, s, t);
  if (length(d) > 1e-9) return normalize(d);
  const nudged = segmentDerivative(from, s, t < 0.5 ? t + 1e-4 : t - 1e-4);
  if (length(nudged) > 1e-9) return normalize(nudged);
  return normalize(sub(s.to, from));
}

/** Parameters in (0, 1) where a segment's coordinate on one axis can reach an extreme. */
function extremaParams(from: Vec, s: Segment, axis: "x" | "y"): number[] {
  const inRange = (t: number) => t > 0 && t < 1;
  if (s.type === "L") return [];
  if (s.type === "Q") {
    const denom = from[axis] - 2 * s.control[axis] + s.to[axis];
    return denom === 0 ? [] : [(from[axis] - s.control[axis]) / denom].filter(inRange);
  }
  const p0 = from[axis], p1 = s.c1[axis], p2 = s.c2[axis], p3 = s.to[axis];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b].filter(inRange);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  return [(-b + sq) / (2 * a), (-b - sq) / (2 * a)].filter(inRange);
}

/** Exact axis-aligned bounding box (includes curve extrema). */
export function bounds(path: PathData): Bounds {
  let minX = path.start.x, maxX = minX, minY = path.start.y, maxY = minY;
  const include = ({ x, y }: Vec) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  let from = path.start;
  for (const s of path.segments) {
    include(s.to);
    for (const axis of ["x", "y"] as const) {
      for (const t of extremaParams(from, s, axis)) include(segmentAt(from, s, t));
    }
    from = s.to;
  }
  return { minX, minY, maxX, maxY };
}

export function mapPath(path: PathData, fn: (p: Vec) => Vec): PathData {
  return {
    start: fn(path.start),
    closed: path.closed,
    segments: path.segments.map((s): Segment => {
      switch (s.type) {
        case "L":
          return { type: "L", to: fn(s.to) };
        case "Q":
          return { type: "Q", control: fn(s.control), to: fn(s.to) };
        case "C":
          return { type: "C", c1: fn(s.c1), c2: fn(s.c2), to: fn(s.to) };
      }
    }),
  };
}

export function formatNumber(n: number, precision = 2): string {
  const s = String(Number(n.toFixed(precision)));
  return s === "-0" ? "0" : s;
}

/** Serializes path data to an SVG `d` string, rounded to `precision` decimals. */
export function formatPath(path: PathData, precision = 2): string {
  const fmt = (p: Vec) => formatNumber(p.x, precision) + " " + formatNumber(p.y, precision);
  let d = "M" + fmt(path.start);
  for (const s of path.segments) {
    if (s.type === "L") d += "L" + fmt(s.to);
    else if (s.type === "Q") d += "Q" + fmt(s.control) + " " + fmt(s.to);
    else d += "C" + fmt(s.c1) + " " + fmt(s.c2) + " " + fmt(s.to);
  }
  return path.closed ? d + "Z" : d;
}
