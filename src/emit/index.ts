/**
 * Emitter: curve pieces → path data. Each piece is fitted with cubic Béziers
 * from its exact positions and derivatives (Hermite), subdividing until the fit
 * is within tolerance. Straight runs come out as one segment; corners stay sharp.
 */
import { add, distance, scale, segmentAt, sub, type PathData, type Segment, type Vec } from "../geometry";
import type { Curve, Piece } from "../curve";

export interface EmitOptions {
  /** Maximum distance between the fitted path and the curve, in px. Default 0.1. */
  tolerance?: number;
  /** Fixed subdivision (no adaptive splitting), so the command count doesn't depend on the curve's shape. */
  uniform?: boolean;
}

const MAX_DEPTH = 10;
const CHECKS = [0.2, 0.4, 0.5, 0.6, 0.8];

export function emit(curve: Curve, { tolerance = 0.1, uniform = false }: EmitOptions = {}): PathData {
  const first = curve.pieces[0]!;
  const start = first.at(first.t0);
  const segments: Segment[] = [];
  let current = start;
  for (const piece of curve.pieces) {
    const p0 = piece.at(piece.t0);
    if (distance(current, p0) > 0.01) segments.push({ type: "L", to: p0 });
    fitPiece(piece, piece.t0, piece.t1, tolerance, uniform, segments);
    current = piece.at(piece.t1);
  }
  return { start, segments: uniform ? segments : mergeLines(start, segments), closed: curve.closed };
}

/** Joins consecutive straight segments that continue in the same direction. */
export function mergeLines(start: Vec, segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  let from = start;
  let prevFrom = start;
  for (const s of segments) {
    const last = out[out.length - 1];
    if (s.type === "L" && last?.type === "L") {
      const a = sub(last.to, prevFrom), b = sub(s.to, last.to);
      const la = Math.hypot(a.x, a.y), lb = Math.hypot(b.x, b.y);
      if (la > 0 && lb > 0 && Math.abs(a.x * b.y - a.y * b.x) / (la * lb) < 1e-6 && a.x * b.x + a.y * b.y > 0) {
        out[out.length - 1] = { type: "L", to: s.to };
        from = s.to;
        continue;
      }
    }
    out.push(s);
    prevFrom = from;
    from = s.to;
  }
  return out;
}

/** Derivative by central differences, one-sided at the piece's ends so corners stay sharp. */
function derivative(piece: Piece, t: number): Vec {
  const h = Math.max(1e-7, Math.min(1e-3, (piece.t1 - piece.t0) / 1000));
  const a = Math.max(piece.t0, t - h), b = Math.min(piece.t1, t + h);
  return scale(sub(piece.at(b), piece.at(a)), 1 / (b - a));
}

function fitPiece(piece: Piece, t0: number, t1: number, tolerance: number, uniform: boolean, out: Segment[]): void {
  const n = Math.max(1, Math.ceil((t1 - t0) / piece.maxStep - 1e-9));
  let a = t0;
  let pa = piece.at(a), da = derivative(piece, a);
  for (let i = 1; i <= n; i++) {
    const b = i === n ? t1 : t0 + ((t1 - t0) * i) / n;
    const pb = piece.at(b), db = derivative(piece, b);
    if (uniform) {
      // Always a cubic, never simplified to a line, so every frame has the same commands.
      const k = (b - a) / 3;
      out.push({ type: "C", c1: add(pa, scale(da, k)), c2: sub(pb, scale(db, k)), to: pb });
    } else {
      fit(piece, a, b, pa, pb, da, db, 0, tolerance, out);
    }
    a = b;
    pa = pb;
    da = db;
  }
}

function fit(piece: Piece, a: number, b: number, pa: Vec, pb: Vec, da: Vec, db: Vec, depth: number, tolerance: number, out: Segment[]): void {
  const k = (b - a) / 3;
  const seg: Segment = { type: "C", c1: add(pa, scale(da, k)), c2: sub(pb, scale(db, k)), to: pb };
  if (depth < MAX_DEPTH) {
    let worst = 0;
    for (const u of CHECKS) worst = Math.max(worst, distance(segmentAt(pa, seg, u), piece.at(a + u * (b - a))));
    if (worst > tolerance && b - a > 1e-4) {
      const m = (a + b) / 2;
      const pm = piece.at(m), dm = derivative(piece, m);
      fit(piece, a, m, pa, pm, da, dm, depth + 1, tolerance, out);
      fit(piece, m, b, pm, pb, dm, db, depth + 1, tolerance, out);
      return;
    }
  }
  // A cubic whose control points lie on its chord is a straight line.
  out.push(isStraight(pa, seg) ? { type: "L", to: pb } : seg);
}

function isStraight(from: Vec, s: Extract<Segment, { type: "C" }>): boolean {
  const len = distance(from, s.to);
  if (len < 1e-9) return false;
  const off = (p: Vec) => Math.abs((s.to.x - from.x) * (from.y - p.y) - (from.x - p.x) * (s.to.y - from.y)) / len;
  const within = (p: Vec) => {
    const t = ((p.x - from.x) * (s.to.x - from.x) + (p.y - from.y) * (s.to.y - from.y)) / (len * len);
    return t >= -1e-6 && t <= 1 + 1e-6;
  };
  return off(s.c1) < 0.01 && off(s.c2) < 0.01 && within(s.c1) && within(s.c2);
}

/** Total length of path data, measured by sampling its curves. */
export function pathLength(path: PathData): number {
  let total = 0;
  let from = path.start;
  const segments = path.closed ? [...path.segments, { type: "L" as const, to: path.start }] : path.segments;
  for (const s of segments) {
    if (s.type === "L") {
      total += distance(from, s.to);
    } else {
      let prev = from;
      for (let i = 1; i <= 24; i++) {
        const p = segmentAt(from, s, i / 24);
        total += distance(prev, p);
        prev = p;
      }
    }
    from = s.to;
  }
  return total;
}

/**
 * Fits cubic segments to any function on [t0, t1] (positions only; derivatives
 * are taken numerically) and appends them to `out`. The function must be
 * smooth inside the range.
 */
export function fitFunction(at: (t: number) => Vec, t0: number, t1: number, maxStep: number, tolerance: number, out: Segment[]): void {
  fitPiece({ t0, t1, at, maxStep }, t0, t1, tolerance, false, out);
}
