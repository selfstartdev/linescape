/**
 * Positions: CSS background-position syntax, or [x, y] lengths, resolved against
 * the element's size.
 */
import type { Length, Point } from "./types";

export interface Size {
  width: number;
  height: number;
}

export interface Vec {
  x: number;
  y: number;
}

/** A length resolved against one dimension: px, or % of `total`. */
export function resolveLength(length: Length, total: number): number {
  if (typeof length === "number") {
    if (!Number.isFinite(length)) throw new TypeError(`linescape: expected a finite length, got ${length}`);
    return length;
  }
  const value = parseLengthToken(length);
  if (value === null) throw new SyntaxError(`linescape: expected a length like 40 or "25%", got ${JSON.stringify(length)}`);
  return value.unit === "%" ? (value.n / 100) * total : value.n;
}

interface LengthToken {
  n: number;
  unit: "%" | "px";
}

function parseLengthToken(token: string): LengthToken | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|px)?$/i.exec(token.trim());
  if (!m) return null;
  return { n: Number(m[1]), unit: m[2] === "%" ? "%" : "px" };
}

const KEYWORDS = { left: "x", right: "x", top: "y", bottom: "y", center: "both" } as const;
type Keyword = keyof typeof KEYWORDS;

const isKeyword = (t: string): t is Keyword => t in KEYWORDS;

/** Fraction of the axis a keyword stands for. */
const KEYWORD_FRACTION: Record<Keyword, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

/** Resolves a Point to px in an element of the given size. */
export function resolvePoint(point: Point, size: Size): Vec {
  if (typeof point !== "string") {
    if (!Array.isArray(point) || point.length !== 2) throw new TypeError(`linescape: expected a position string or [x, y], got ${JSON.stringify(point)}`);
    return { x: resolveLength(point[0], size.width), y: resolveLength(point[1], size.height) };
  }
  return parsePosition(point, size);
}

/**
 * CSS background-position: 1 to 4 values.
 *   "center" · "left" · "30%" · "left 30%" · "top left" · "30% 40px" · "right 40px top 10%" · "right 40px bottom"
 */
function parsePosition(src: string, size: Size): Vec {
  const tokens = src.trim().split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  const fail = (): never => {
    throw new SyntaxError(`linescape: could not read position ${JSON.stringify(src)}`);
  };
  if (tokens.length === 0 || tokens.length > 4) fail();

  const at = (axis: "x" | "y", fraction: number, offset = 0, fromEnd = false) => {
    const total = axis === "x" ? size.width : size.height;
    const base = fraction * total;
    return fromEnd ? total - offset : base + offset;
  };
  const len = (t: string, axis: "x" | "y"): number => {
    const v = parseLengthToken(t);
    if (!v) return fail();
    return v.unit === "%" ? (v.n / 100) * (axis === "x" ? size.width : size.height) : v.n;
  };

  if (tokens.length === 1) {
    const t = tokens[0]!;
    if (isKeyword(t)) {
      const axis = KEYWORDS[t];
      if (axis === "y") return { x: size.width / 2, y: at("y", KEYWORD_FRACTION[t]) };
      return { x: at("x", KEYWORD_FRACTION[t]), y: size.height / 2 };
    }
    return { x: len(t, "x"), y: size.height / 2 };
  }

  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    const ka = isKeyword(a), kb = isKeyword(b);
    if (ka && kb) {
      // Two keywords may come in either order, as long as they name different axes.
      let x: Keyword | undefined, y: Keyword | undefined;
      for (const k of [a, b] as Keyword[]) {
        const axis = KEYWORDS[k];
        if (axis === "x") {
          if (x !== undefined) fail();
          x = k;
        } else if (axis === "y") {
          if (y !== undefined) fail();
          y = k;
        }
      }
      for (const k of [a, b] as Keyword[]) {
        if (KEYWORDS[k] !== "both") continue;
        if (x === undefined) x = k;
        else if (y === undefined) y = k;
      }
      return { x: at("x", KEYWORD_FRACTION[x ?? "center"]), y: at("y", KEYWORD_FRACTION[y ?? "center"]) };
    }
    // With a length, the first value is x and the second y.
    if (ka && KEYWORDS[a as Keyword] === "y") fail();
    if (kb && KEYWORDS[b as Keyword] === "x") fail();
    const x = ka ? at("x", KEYWORD_FRACTION[a as Keyword]) : len(a, "x");
    const y = kb ? at("y", KEYWORD_FRACTION[b as Keyword]) : len(b, "y");
    return { x, y };
  }

  // 3 or 4 values: keywords, each optionally followed by an offset from that edge.
  const result: Partial<Vec> = {};
  let i = 0;
  while (i < tokens.length) {
    const k = tokens[i++]!;
    if (!isKeyword(k)) fail();
    const next = tokens[i];
    const offset = next !== undefined && !isKeyword(next) ? next : undefined;
    if (offset !== undefined) i++;
    let axis = KEYWORDS[k as Keyword];
    if (axis === "both") {
      if (offset !== undefined) fail();
      axis = result.x === undefined && tokens.slice(i).every((t) => !isKeyword(t) || KEYWORDS[t as Keyword] !== "x") ? "x" : "y";
    }
    if (result[axis] !== undefined) fail();
    const o = offset === undefined ? 0 : len(offset, axis);
    const fromEnd = k === "right" || k === "bottom";
    result[axis] = offset === undefined ? at(axis, KEYWORD_FRACTION[k as Keyword]) : at(axis, fromEnd ? 1 : 0, o, fromEnd);
  }
  return { x: result.x ?? size.width / 2, y: result.y ?? size.height / 2 };
}
