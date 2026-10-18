/**
 * Backbone: the path a line follows before patterns and features, measured by
 * arc length. Built from the spec's `path` and the element's size, with
 * endpoints on an edge extended outward ("bleed") so caps never show.
 */
import {
  add,
  distance,
  dot,
  fromAngle,
  lerp,
  normalize,
  rightOf,
  scale,
  segmentAt,
  segmentTangent,
  sub,
  type PathData,
  type Segment,
  type Vec,
} from "../geometry";
import { parsePath } from "../geometry/parse";
import { resolveLength, resolvePoint, type Size } from "../spec/position";
import type { PathInput } from "../spec/types";

export interface Frame {
  /** Position. */
  p: Vec;
  /** Unit tangent, in the direction of travel. */
  t: Vec;
}

export interface Backbone {
  length: number;
  closed: boolean;
  /** Arc-length range of the path as specified, without bleed extensions. */
  visible: [start: number, end: number];
  /** Arc lengths where the direction changes abruptly. */
  corners: number[];
  /** Position and tangent at arc length s. Beyond the ends it continues straight (or wraps, if closed). */
  at(s: number): Frame;
  /** The backbone as path data (used for the `d` escape hatch tests and debugging). */
  path: PathData;
}

/** How far outside the element an extended endpoint must reach for any cap to be hidden. */
export function bleedRadius(width: number): number {
  return width * 0.75 + 2;
}

export interface BackboneOptions {
  /** Stroke width, for bleed. */
  width: number;
  /** Skip bleed at an end (e.g. a spiral starts or ends there). */
  bleedStart?: boolean;
  bleedEnd?: boolean;
}

export function buildBackbone(path: PathInput, size: Size, { width, bleedStart = true, bleedEnd = true }: BackboneOptions): Backbone {
  const r = bleedRadius(width);

  if ("through" in path) {
    const p = resolvePoint(path.through, size);
    const dir = fromAngle(path.angle);
    const outer = clipLine(p, dir, { minX: -r, minY: -r, maxX: size.width + r, maxY: size.height + r });
    const [t0, t1] = outer ?? [-100, 100];
    const inner = clipLine(p, dir, { minX: 0, minY: 0, maxX: size.width, maxY: size.height });
    const start = add(p, scale(dir, t0));
    const data: PathData = { start, segments: [{ type: "L", to: add(p, scale(dir, t1)) }], closed: false };
    const visible: [number, number] = inner ? [inner[0] - t0, inner[1] - t0] : [0, t1 - t0];
    return measure(data, visible);
  }

  let data: PathData;
  if ("from" in path) {
    const a = resolvePoint(path.from, size), b = resolvePoint(path.to, size);
    const bend = path.bend ?? 0;
    if (bend === 0) {
      data = { start: a, segments: [{ type: "L", to: b }], closed: false };
    } else {
      // A quadratic's peak sits halfway to its control point, so the bulge is bend × length.
      const len = distance(a, b);
      const left = scale(rightOf(normalize(sub(b, a))), -1);
      const control = add(lerp(a, b, 0.5), scale(left, 2 * bend * len));
      data = { start: a, segments: [{ type: "Q", control, to: b }], closed: false };
    }
  } else if ("points" in path) {
    data = throughPoints(path.points.map((p) => resolvePoint(p, size)), path.smooth ?? 1);
  } else if ("arc" in path) {
    const c = resolvePoint(path.arc.center, size);
    const radius = resolveLength(path.arc.radius, size.width);
    data = ellipseArc(c, radius, radius, path.arc.start, path.arc.end, false);
  } else if ("ring" in path) {
    const c = resolvePoint(path.ring.center, size);
    const [rx, ry] = Array.isArray(path.ring.radius)
      ? [resolveLength(path.ring.radius[0], size.width), resolveLength(path.ring.radius[1], size.height)]
      : [resolveLength(path.ring.radius as never, size.width), resolveLength(path.ring.radius as never, size.width)];
    data = ellipseArc(c, rx, ry, -90, 270, true);
  } else {
    data = parsePath(path.d);
    if (path.viewBox) {
      const [vx, vy, vw, vh] = path.viewBox;
      const sx = size.width / vw, sy = size.height / vh;
      data = mapPoints(data, (p) => ({ x: (p.x - vx) * sx, y: (p.y - vy) * sy }));
    }
  }

  if (data.closed) return measure(data, null);

  // Bleed: extend endpoints on or beyond an edge outward along their direction.
  const rect = { minX: 0, minY: 0, maxX: size.width, maxY: size.height };
  const first = data.segments[0]!;
  const last = data.segments[data.segments.length - 1]!;
  const lastFrom = data.segments.length > 1 ? endOf(data.segments[data.segments.length - 2]!) : data.start;
  let pre = 0, post = 0;
  const segments: Segment[] = [...data.segments];
  let start = data.start;

  if (bleedStart) {
    const out = scale(segmentTangent(data.start, first, 0), -1);
    const t = bleedDistance(data.start, out, rect, r);
    if (t > 0) {
      start = add(data.start, scale(out, t));
      segments.unshift({ type: "L", to: data.start });
      pre = t;
    }
  }
  if (bleedEnd) {
    const end = last.to;
    const out = segmentTangent(lastFrom, last, 1);
    const t = bleedDistance(end, out, rect, r);
    if (t > 0) {
      segments.push({ type: "L", to: add(end, scale(out, t)) });
      post = t;
    }
  }
  const b = measure({ start, segments, closed: false }, null);
  b.visible = [pre, b.length - post];
  return b;
}

const endOf = (s: Segment) => s.to;

function mapPoints(data: PathData, fn: (p: Vec) => Vec): PathData {
  return {
    start: fn(data.start),
    closed: data.closed,
    segments: data.segments.map((s): Segment =>
      s.type === "L" ? { type: "L", to: fn(s.to) } : s.type === "Q" ? { type: "Q", control: fn(s.control), to: fn(s.to) } : { type: "C", c1: fn(s.c1), c2: fn(s.c2), to: fn(s.to) },
    ),
  };
}

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Liang–Barsky: the parameter range where p + t·dir lies inside rect, or null. */
function clipLine(p: Vec, dir: Vec, rect: Rect): [number, number] | null {
  let t0 = -Infinity, t1 = Infinity;
  const axes: [number, number, number, number][] = [
    [dir.x, p.x, rect.minX, rect.maxX],
    [dir.y, p.y, rect.minY, rect.maxY],
  ];
  for (const [d, o, min, max] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < min || o > max) return null;
      continue;
    }
    let a = (min - o) / d, b = (max - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * How far to extend an endpoint along `out` so a cap of radius r clears the element.
 * 0 when the point is inside the element, or when `out` runs along the edge rather than away from it.
 */
function bleedDistance(p: Vec, out: Vec, rect: Rect, r: number): number {
  const eps = 0.5;
  const normals: Vec[] = [];
  if (p.x <= rect.minX + eps) normals.push({ x: -1, y: 0 });
  if (p.x >= rect.maxX - eps) normals.push({ x: 1, y: 0 });
  if (p.y <= rect.minY + eps) normals.push({ x: 0, y: -1 });
  if (p.y >= rect.maxY - eps) normals.push({ x: 0, y: 1 });
  if (normals.length === 0 || !normals.some((n) => dot(n, out) > 0.2)) return 0;
  const expanded = { minX: rect.minX - r, minY: rect.minY - r, maxX: rect.maxX + r, maxY: rect.maxY + r };
  const range = clipLine(p, out, expanded);
  const exit = range ? Math.max(0, range[1]) : 0;
  return Math.min(exit, 4 * r + 50);
}

/**
 * A curve through points. Each interior tangent follows its neighbours; each end
 * tangent mirrors the next one across the first chord, so ends curve naturally.
 * smooth = 0 gives straight segments.
 */
function throughPoints(points: Vec[], smooth: number): PathData {
  const start = points[0]!;
  if (smooth === 0 || points.length === 2) {
    return { start, segments: points.slice(1).map((to) => ({ type: "L" as const, to })), closed: false };
  }
  const n = points.length;
  const tangents: Vec[] = points.map((p, i) => (i === 0 || i === n - 1 ? { x: 0, y: 0 } : normalize(sub(points[i + 1]!, points[i - 1]!))));
  const mirror = (chord: Vec, t: Vec) => sub(scale(chord, 2 * dot(chord, t)), t);
  tangents[0] = normalize(mirror(normalize(sub(points[1]!, points[0]!)), tangents[1]!));
  tangents[n - 1] = normalize(mirror(normalize(sub(points[n - 1]!, points[n - 2]!)), tangents[n - 2]!));
  const segments: Segment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const k = (smooth * distance(a, b)) / 3;
    segments.push({ type: "C", c1: add(a, scale(tangents[i]!, k)), c2: sub(b, scale(tangents[i + 1]!, k)), to: b });
  }
  return { start, segments, closed: false };
}

/** An elliptical arc as cubics, ≤ 90° each. Angles in degrees, 0° = right, clockwise. */
function ellipseArc(c: Vec, rx: number, ry: number, fromDeg: number, toDeg: number, closed: boolean): PathData {
  const a0 = (fromDeg * Math.PI) / 180, a1 = (toDeg * Math.PI) / 180;
  const delta = a1 - a0;
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (a: number): Vec => ({ x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) });
  const d = (a: number): Vec => ({ x: -rx * Math.sin(a), y: ry * Math.cos(a) });
  const segments: Segment[] = [];
  for (let i = 0; i < pieces; i++) {
    const t0 = a0 + i * step, t1 = t0 + step;
    const p0 = at(t0), p1 = closed && i === pieces - 1 ? at(a0) : at(t1);
    segments.push({ type: "C", c1: add(p0, scale(d(t0), k)), c2: sub(p1, scale(d(t1), k)), to: p1 });
  }
  return { start: at(a0), segments, closed };
}

interface Measured {
  from: Vec;
  segment: Segment;
  s0: number;
  length: number;
  /** Arc length at evenly spaced t, for inverting s → t. */
  table: Float64Array | null;
}

/** Builds arc-length tables and the at() lookup. */
function measure(data: PathData, visible: [number, number] | null): Backbone {
  const pieces: Measured[] = [];
  let from = data.start;
  let total = 0;
  const segments = [...data.segments];
  // A closed path's implied closing segment is part of the backbone too.
  if (data.closed && distance(segments[segments.length - 1]!.to, data.start) > 1e-6) segments.push({ type: "L", to: data.start });

  for (const segment of segments) {
    let len: number;
    let table: Float64Array | null = null;
    if (segment.type === "L") {
      len = distance(from, segment.to);
    } else {
      // Rough length first, to pick a table resolution of about one entry per 2px.
      let rough = 0;
      let prev = from;
      for (let i = 1; i <= 16; i++) {
        const q = segmentAt(from, segment, i / 16);
        rough += distance(prev, q);
        prev = q;
      }
      const n = Math.min(4096, Math.max(32, Math.ceil(rough / 2)));
      table = new Float64Array(n + 1);
      prev = from;
      for (let i = 1; i <= n; i++) {
        const q = segmentAt(from, segment, i / n);
        table[i] = table[i - 1]! + distance(prev, q);
        prev = q;
      }
      len = table[n]!;
    }
    if (len > 1e-9) {
      pieces.push({ from, segment, s0: total, length: len, table });
      total += len;
    }
    from = segment.to;
  }
  if (pieces.length === 0) throw new RangeError("linescape: the path has no length");

  const corners: number[] = [];
  const tangentAt = (m: Measured, t: number) => segmentTangent(m.from, m.segment, t);
  for (let i = 1; i < pieces.length; i++) {
    const a = tangentAt(pieces[i - 1]!, 1), b = tangentAt(pieces[i]!, 0);
    if (dot(a, b) < Math.cos((2 * Math.PI) / 180)) corners.push(pieces[i]!.s0);
  }

  const paramAt = (m: Measured, local: number): number => {
    if (!m.table) return local / m.length;
    const table = m.table;
    let lo = 0, hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid]! <= local) lo = mid;
      else hi = mid;
    }
    const span = table[hi]! - table[lo]!;
    const f = span > 0 ? (local - table[lo]!) / span : 0;
    return (lo + f) / (table.length - 1);
  };

  const find = (s: number): Measured => {
    let lo = 0, hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid]!.s0 <= s) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo]!;
  };

  const firstPiece = pieces[0]!, lastPiece = pieces[pieces.length - 1]!;
  const startFrame: Frame = { p: data.start, t: tangentAt(firstPiece, 0) };
  const endFrame: Frame = { p: lastPiece.segment.to, t: tangentAt(lastPiece, 1) };

  const at = (sIn: number): Frame => {
    let s = sIn;
    if (data.closed) {
      s = ((s % total) + total) % total;
    } else if (s <= 0) {
      return { p: add(startFrame.p, scale(startFrame.t, s)), t: startFrame.t };
    } else if (s >= total) {
      return { p: add(endFrame.p, scale(endFrame.t, s - total)), t: endFrame.t };
    }
    const m = find(s);
    const t = paramAt(m, Math.min(m.length, Math.max(0, s - m.s0)));
    return { p: segmentAt(m.from, m.segment, t), t: tangentAt(m, t) };
  };

  return { length: total, closed: data.closed, visible: visible ?? [0, total], corners, at, path: data };
}

