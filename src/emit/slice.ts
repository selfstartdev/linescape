/**
 * Measuring and slicing emitted path data by arc length: used to colour a line
 * along its length (`along` paint), where each short slice gets its own colour.
 */
import { distance, dot, lerp, segmentAt, segmentTangent, type PathData, type Segment, type Vec } from "../geometry";

interface MeasuredSegment {
  from: Vec;
  segment: Segment;
  s0: number;
  length: number;
  /** Arc length at t = i / SAMPLES. */
  table: number[];
}

export interface MeasuredPath {
  segments: MeasuredSegment[];
  length: number;
}

const SAMPLES = 24;

export function measurePath(path: PathData): MeasuredPath {
  const out: MeasuredSegment[] = [];
  let from = path.start, total = 0;
  const segments = path.closed && distance(path.segments[path.segments.length - 1]!.to, path.start) > 1e-6
    ? [...path.segments, { type: "L" as const, to: path.start }]
    : path.segments;
  for (const segment of segments) {
    const table = [0];
    let prev = from;
    for (let i = 1; i <= SAMPLES; i++) {
      const p = segment.type === "L" ? lerp(from, segment.to, i / SAMPLES) : segmentAt(from, segment, i / SAMPLES);
      table.push(table[i - 1]! + distance(prev, p));
      prev = p;
    }
    const length = table[SAMPLES]!;
    if (length > 1e-9) out.push({ from, segment, s0: total, length, table });
    total += length;
    from = segment.to;
  }
  return { segments: out, length: total };
}

function locate(m: MeasuredPath, s: number): { index: number; t: number } {
  const segs = m.segments;
  let i = 0;
  while (i < segs.length - 1 && segs[i]!.s0 + segs[i]!.length < s) i++;
  const seg = segs[i]!;
  const local = Math.min(seg.length, Math.max(0, s - seg.s0));
  const table = seg.table;
  let k = 1;
  while (k < SAMPLES && table[k]! < local) k++;
  const span = table[k]! - table[k - 1]!;
  const f = span > 0 ? (local - table[k - 1]!) / span : 0;
  return { index: i, t: (k - 1 + f) / SAMPLES };
}

export function frameAt(m: MeasuredPath, s: number): { p: Vec; t: Vec } {
  const { index, t } = locate(m, s);
  const seg = m.segments[index]!;
  return { p: segmentAt(seg.from, seg.segment, t), t: segmentTangent(seg.from, seg.segment, t) };
}

/** The part of a segment between parameters ta and tb, as a segment starting at its own point. */
function splitSegment(from: Vec, s: Segment, ta: number, tb: number): { from: Vec; segment: Segment } {
  const start = segmentAt(from, s, ta);
  if (s.type === "L") return { from: start, segment: { type: "L", to: segmentAt(from, s, tb) } };
  // Blossoming: control points of the sub-curve on [ta, tb].
  if (s.type === "Q") {
    const q = (u: number, v: number): Vec => {
      const a = lerp(from, s.control, u), b = lerp(s.control, s.to, u);
      return lerp(a, b, v);
    };
    return { from: start, segment: { type: "Q", control: q(ta, tb), to: segmentAt(from, s, tb) } };
  }
  const c = (u: number, v: number, w: number): Vec => {
    const l1 = (p: Vec, q: Vec, t: number) => lerp(p, q, t);
    const a = l1(from, s.c1, u), b = l1(s.c1, s.c2, u), d = l1(s.c2, s.to, u);
    const e = l1(a, b, v), f = l1(b, d, v);
    return l1(e, f, w);
  };
  return { from: start, segment: { type: "C", c1: c(ta, ta, tb), c2: c(ta, tb, tb), to: segmentAt(from, s, tb) } };
}

/** The part of the path between arc lengths s0 and s1, as an open path. */
export function slicePath(m: MeasuredPath, s0: number, s1: number): PathData {
  const a = locate(m, s0), b = locate(m, s1);
  const segments: Segment[] = [];
  let start: Vec | undefined;
  for (let i = a.index; i <= b.index; i++) {
    const seg = m.segments[i]!;
    const ta = i === a.index ? a.t : 0, tb = i === b.index ? b.t : 1;
    if (tb - ta < 1e-9 && a.index !== b.index) continue;
    const part = splitSegment(seg.from, seg.segment, ta, tb);
    start ??= part.from;
    segments.push(part.segment);
  }
  return { start: start ?? frameAt(m, s0).p, segments, closed: false };
}

/** Arc lengths where consecutive segments meet at an angle sharper than `minDegrees`. */
export function cornersOf(m: MeasuredPath, closed: boolean, minDegrees = 8): number[] {
  const out: number[] = [];
  const limit = Math.cos((minDegrees * Math.PI) / 180);
  const n = m.segments.length;
  for (let i = closed ? 0 : 1; i < n; i++) {
    const prev = m.segments[(i - 1 + n) % n]!, cur = m.segments[i]!;
    const a = segmentTangent(prev.from, prev.segment, 1), b = segmentTangent(cur.from, cur.segment, 0);
    if (dot(a, b) < limit) out.push(cur.s0);
  }
  return out;
}
