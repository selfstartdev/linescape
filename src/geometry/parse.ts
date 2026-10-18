/**
 * Minimal SVG path parser for the `d` path escape hatch. Supports every path
 * command (absolute and relative). H/V become L, S becomes C, T becomes Q,
 * and arcs are converted to cubic curves, so rotation and scaling can be
 * applied directly to the coordinates.
 *
 * The path must be a single subpath, open or closed (Z).
 */
import type { PathData, Vec as Point, Segment } from "./index";

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

class Scanner {
  private i = 0;
  constructor(private readonly src: string) {}

  private skip(): void {
    while (this.i < this.src.length && /[\s,]/.test(this.src[this.i]!)) this.i++;
  }

  done(): boolean {
    this.skip();
    return this.i >= this.src.length;
  }

  command(): string | undefined {
    this.skip();
    const c = this.src[this.i];
    if (c !== undefined && /[a-zA-Z]/.test(c)) {
      this.i++;
      return c;
    }
    return undefined;
  }

  hasNumber(): boolean {
    this.skip();
    return NUMBER.test(this.src.slice(this.i));
  }

  number(): number {
    this.skip();
    const m = NUMBER.exec(this.src.slice(this.i));
    if (!m) throw new SyntaxError(`linescape: expected a number at position ${this.i} in path "${this.src}"`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  /** Arc flags may be written without separators ("a1 1 0 011 1"), so read a single digit. */
  flag(): boolean {
    this.skip();
    const c = this.src[this.i];
    if (c !== "0" && c !== "1") throw new SyntaxError(`linescape: expected an arc flag at position ${this.i} in path "${this.src}"`);
    this.i++;
    return c === "1";
  }
}

export function parsePath(d: string): PathData {
  const s = new Scanner(d);
  let start: Point | undefined;
  let current: Point = { x: 0, y: 0 };
  let closed = false;
  const segments: Segment[] = [];
  // Reflection points for S and T.
  let lastCubic: Point | undefined;
  let lastQuad: Point | undefined;

  let cmd = s.command();
  if (cmd !== "M" && cmd !== "m") throw new SyntaxError(`linescape: path must start with M, got "${d.slice(0, 20)}"`);

  while (cmd !== undefined) {
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const pt = (): Point => {
      const x = s.number(), y = s.number();
      return rel ? { x: current.x + x, y: current.y + y } : { x, y };
    };

    if (closed && upper !== "Z") throw new SyntaxError("linescape: path.d must be a single subpath (found a second one)");

    let first = true;
    do {
      let cubic: Point | undefined;
      let quad: Point | undefined;
      switch (upper) {
        case "M": {
          const p = pt();
          if (first) {
            if (start) throw new SyntaxError("linescape: path.d must be a single subpath (found a second one)");
            start = p;
          } else {
            segments.push({ type: "L", to: p }); // extra pairs after M are implicit L
          }
          current = p;
          break;
        }
        case "L": {
          current = pt();
          segments.push({ type: "L", to: current });
          break;
        }
        case "H": {
          const x = s.number();
          current = { x: rel ? current.x + x : x, y: current.y };
          segments.push({ type: "L", to: current });
          break;
        }
        case "V": {
          const y = s.number();
          current = { x: current.x, y: rel ? current.y + y : y };
          segments.push({ type: "L", to: current });
          break;
        }
        case "C": {
          const c1 = pt(), c2 = pt(), to = pt();
          segments.push({ type: "C", c1, c2, to });
          cubic = c2;
          current = to;
          break;
        }
        case "S": {
          const c1 = lastCubic ? reflect(lastCubic, current) : current;
          const c2 = pt(), to = pt();
          segments.push({ type: "C", c1, c2, to });
          cubic = c2;
          current = to;
          break;
        }
        case "Q": {
          const control = pt(), to = pt();
          segments.push({ type: "Q", control, to });
          quad = control;
          current = to;
          break;
        }
        case "T": {
          const control = lastQuad ? reflect(lastQuad, current) : current;
          const to = pt();
          segments.push({ type: "Q", control, to });
          quad = control;
          current = to;
          break;
        }
        case "A": {
          const rx = s.number(), ry = s.number(), angle = s.number();
          const large = s.flag(), sweep = s.flag();
          const to = pt();
          segments.push(...arcToCubics(current, to, rx, ry, angle, large, sweep));
          current = to;
          break;
        }
        case "Z": {
          if (!start) throw new SyntaxError("linescape: Z before M");
          closed = true;
          current = start;
          break;
        }
        default:
          throw new SyntaxError(`linescape: unknown path command "${cmd}"`);
      }
      lastCubic = cubic;
      lastQuad = quad;
      first = false;
    } while (upper !== "Z" && s.hasNumber());

    cmd = s.command();
    if (cmd === undefined && !s.done()) throw new SyntaxError(`linescape: could not parse path "${d}"`);
  }

  if (!start) throw new SyntaxError("linescape: empty path");
  // When closed, drop an explicit final segment back to the start; Z closes it.
  const last = segments[segments.length - 1];
  if (closed && last?.type === "L" && last.to.x === start.x && last.to.y === start.y) segments.pop();
  if (segments.length < 1) throw new SyntaxError("linescape: path.d needs at least 2 points");
  return { start, segments, closed };
}

function reflect(p: Point, about: Point): Point {
  return { x: 2 * about.x - p.x, y: 2 * about.y - p.y };
}

/** SVG elliptical arc → cubic Béziers (SVG spec F.6.5 / F.6.6), split into ≤ 90° pieces. */
function arcToCubics(from: Point, to: Point, rxIn: number, ryIn: number, angleDeg: number, large: boolean, sweep: boolean): Segment[] {
  if (from.x === to.x && from.y === to.y) return [];
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ type: "L", to }];

  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  // Scale radii up if they are too small to reach.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2;
  const cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const onEllipse = (t: number): Point => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const derivative = (t: number): Point => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });

  const out: Segment[] = [];
  for (let i = 0; i < pieces; i++) {
    const t0 = theta1 + i * step, t1 = t0 + step;
    const p0 = onEllipse(t0), p1 = i === pieces - 1 ? to : onEllipse(t1);
    const d0 = derivative(t0), d1 = derivative(t1);
    out.push({
      type: "C",
      c1: { x: p0.x + k * d0.x, y: p0.y + k * d0.y },
      c2: { x: p1.x - k * d1.x, y: p1.y - k * d1.y },
      to: p1,
    });
  }
  return out;
}
