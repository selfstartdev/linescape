/**
 * Outlines: a centerline with a varying width turned into a filled shape. Used
 * for tapered lines, which a stroke can't draw. Each side is an offset curve,
 * fitted with cubics; corners get round joins on the outside, ends get caps.
 */
import { add, cross, scale, sub, type PathData, type Segment, type Vec } from "../geometry";
import { fitFunction } from "./index";
import { cornersOf, frameAt, type MeasuredPath } from "./slice";

export type Cap = "round" | "butt" | "square";

export interface OutlineOptions {
  /** Width at arc length s. */
  width: (s: number) => number;
  capStart: Cap;
  capEnd: Cap;
  closed: boolean;
  tolerance?: number;
}

const left = (t: Vec): Vec => ({ x: t.y, y: -t.x });

/** Cubic approximation of a circular arc from angle a0 to a1 (radians, either direction). */
function arc(center: Vec, r: number, a0: number, a1: number, out: Segment[]): void {
  if (r <= 1e-9) return;
  const pieces = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2) - 1e-9));
  const step = (a1 - a0) / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (a: number): Vec => ({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  const d = (a: number): Vec => ({ x: -r * Math.sin(a), y: r * Math.cos(a) });
  for (let i = 0; i < pieces; i++) {
    const t0 = a0 + i * step, t1 = t0 + step;
    out.push({ type: "C", c1: add(at(t0), scale(d(t0), k)), c2: sub(at(t1), scale(d(t1), k)), to: at(t1) });
  }
}

const angleOf = (v: Vec) => Math.atan2(v.y, v.x);

/** The outline of the centerline between arc lengths s0 and s1. */
export function outline(m: MeasuredPath, s0: number, s1: number, { width, capStart, capEnd, closed, tolerance = 0.15 }: OutlineOptions): PathData {
  const corners = cornersOf(m, closed).filter((s) => s > s0 + 1e-6 && s < s1 - 1e-6);
  const knots = [s0, ...corners, s1];
  const eps = 1e-4;
  const side = (sign: 1 | -1) => (s: number) => {
    const f = frameAt(m, s);
    return add(f.p, scale(left(f.t), (sign * width(s)) / 2));
  };
  const maxStep = 40;

  const segments: Segment[] = [];
  const lineTo = (p: Vec) => segments.push({ type: "L", to: p });

  // One side: the left from start to end (sign 1), or the right from end to start (sign -1).
  const run = (sign: 1 | -1) => {
    const f = side(sign);
    const ranges = knots.slice(1).map((b, i): [number, number] => [knots[i]!, b]);
    const order = sign === 1 ? ranges : ranges.reverse();
    order.forEach(([a, b], i) => {
      // Stop just short of corners, where the offset direction jumps.
      const lo = a === s0 ? a : a + eps, hi = b === s1 ? b : b - eps;
      if (sign === 1) {
        lineTo(f(lo));
        fitFunction(f, lo, hi, maxStep, tolerance, segments);
      } else {
        // Fit forwards, then reverse, so the right side is travelled end to start.
        const part: Segment[] = [];
        fitFunction(f, lo, hi, maxStep, tolerance, part);
        lineTo(f(hi));
        segments.push(...reverseSegments(f(lo), part));
      }
      if (i === order.length - 1) return;
      // Corner join: an arc on the outside of the turn, a straight connection inside.
      const c = sign === 1 ? b : a;
      const before = frameAt(m, c - eps), after = frameAt(m, c + eps);
      const turnLeft = cross(before.t, after.t) < 0; // y points down on screen
      const outside = (sign === 1) === !turnLeft;
      const r = width(c) / 2;
      const n1 = scale(left(sign === 1 ? before.t : after.t), sign), n2 = scale(left(sign === 1 ? after.t : before.t), sign);
      if (outside) {
        const a1 = angleOf(n1);
        let a2 = angleOf(n2);
        // The short way round.
        while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
        while (a1 - a2 > Math.PI) a2 += 2 * Math.PI;
        arc(before.p, r, a1, a2, segments);
      } else {
        lineTo(add(before.p, scale(n2, r)));
      }
    });
  };

  const startFrame = frameAt(m, s0), endFrame = frameAt(m, s1);
  const start = side(1)(s0);
  run(1);
  cap(endFrame.p, endFrame.t, width(s1) / 2, capEnd, segments);
  run(-1);
  cap(startFrame.p, scale(startFrame.t, -1), width(s0) / 2, capStart, segments);
  return { start, segments: segments.filter((seg, i) => seg.type !== "L" || i === 0 || distanceSq(seg.to, segments[i - 1]!.to) > 1e-8), closed: true };
}

/** A cap from the left edge to the right edge at an end heading along t. */
function cap(p: Vec, t: Vec, r: number, kind: Cap, out: Segment[]): void {
  if (r <= 1e-6) {
    out.push({ type: "L", to: p });
    return;
  }
  const l = left(t);
  const from = add(p, scale(l, r)), to = sub(p, scale(l, r));
  if (kind === "round") {
    const a = angleOf(l);
    // From the left edge, forward through the tip, to the right edge (clockwise on screen).
    arc(p, r, a, a + Math.PI, out);
  } else if (kind === "square") {
    out.push({ type: "L", to: add(from, scale(t, r)) }, { type: "L", to: add(to, scale(t, r)) }, { type: "L", to });
  } else {
    out.push({ type: "L", to });
  }
}

const distanceSq = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function reverseSegments(start: Vec, segments: Segment[]): Segment[] {
  const points: Vec[] = [start, ...segments.map((s) => s.to)];
  const out: Segment[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i]!, to = points[i]!;
    if (s.type === "L") out.push({ type: "L", to });
    else if (s.type === "Q") out.push({ type: "Q", control: s.control, to });
    else out.push({ type: "C", c1: s.c2, c2: s.c1, to });
  }
  return out;
}
