/**
 * Renderer: lines → a small tree of SVG nodes (paths, gradients, masks, CSS),
 * which serialize() writes as a string and linescape/react maps to elements, so
 * both always draw the same thing.
 */
import { buildCurve } from "../curve";
import { emit } from "../emit";
import { outline, type Cap } from "../emit/outline";
import { cornersOf, frameAt, measurePath, slicePath, type MeasuredPath } from "../emit/slice";
import { add, bounds, formatNumber, formatPath, scale, sub, type Bounds, type PathData } from "../geometry";
import { hashString } from "../random";
import type { Size } from "../spec/position";
import { resolve } from "../spec/resolve";
import type { Line, LineInput, Paint, Stop } from "../spec/types";
import { colorAt, parseColor, toHex, type RGBA } from "./color";

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: (SvgNode | string)[];
}

export interface RenderOptions {
  /** Element width in px. */
  width: number;
  /** Element height in px. */
  height: number;
  /** Prefix for ids, class names and keyframes. React passes useId() here. Default "linescape". */
  idPrefix?: string;
  /** Decimal places for coordinates. Default 2, which keeps output byte-stable. */
  precision?: number;
  /** false leaves out animations that CSS can't switch off for reduced motion (undulate). Default true. */
  motion?: boolean;
}

export interface RenderedLayer {
  width: number;
  height: number;
  /** Class for the root <svg>; the CSS in the layer is scoped to it. */
  className: string;
  /** Children of the root <svg>. */
  children: SvgNode[];
  /** Whether any line waits until it's visible (`trigger: "visible"`) before drawing. */
  waitsForVisibility: boolean;
}

export type LinesInput = LineInput | Line | readonly (LineInput | Line)[];

/** Frames per undulate cycle. */
const UNDULATE_FRAMES = 12;

const node = (tag: string, attrs: Record<string, string> = {}, children: (SvgNode | string)[] = []): SvgNode => ({ tag, attrs, children });

export function render(lines: LinesInput, { width, height, idPrefix = "linescape", precision = 2, motion = true }: RenderOptions): RenderedLayer {
  if (!(width > 0) || !(height > 0)) throw new RangeError(`linescape: width and height must be greater than 0, got ${width} × ${height}`);
  const list = (Array.isArray(lines) ? lines : [lines]) as (LineInput | Line)[];
  const ctx: Context = { size: { width, height }, prefix: idPrefix, precision, motion, defs: new Map(), css: [], waitsForVisibility: false };
  const groups = list.map((input, i) => renderLine(resolve(input), i, ctx));

  const children: SvgNode[] = [];
  if (ctx.css.length > 0) {
    // Named view timeline for scroll-linked drawing; harmless when unused.
    children.push(node("style", {}, [`.${idPrefix}{view-timeline:--${idPrefix}-tl block}` + ctx.css.join("")]));
  }
  if (ctx.defs.size > 0) children.push(node("defs", {}, [...ctx.defs.values()]));
  children.push(...groups);
  return { width, height, className: idPrefix, children, waitsForVisibility: ctx.waitsForVisibility };
}

interface Context {
  size: Size;
  prefix: string;
  precision: number;
  motion: boolean;
  /** Deduplicated by id. */
  defs: Map<string, SvgNode>;
  css: string[];
  waitsForVisibility: boolean;
}

interface Geometry {
  path: PathData;
  d: string;
  /** d for each undulate frame (the first is d), or null. */
  frames: string[] | null;
  measured: MeasuredPath;
  length: number;
  bounds: Bounds;
  closed: boolean;
}

function geometry(line: Line, ctx: Context): Geometry {
  // Undulating morphs one path through frames; outlines (taper, offset bands) and slices can't keep their commands fixed.
  const undulate = ctx.motion && line.animate?.undulate && line.patterns.length > 0 && !line.taper && !isAlong(line) && !hasOffsets(line);
  const curve = buildCurve(line, ctx.size, { uniform: !!undulate });
  const path = emit(curve, { uniform: !!undulate });
  const d = formatPath(path, ctx.precision);
  let frames: string[] | null = null;
  if (undulate) {
    frames = [d];
    for (let k = 1; k <= UNDULATE_FRAMES; k++) {
      frames.push(formatPath(emit(buildCurve(line, ctx.size, { shift: k / UNDULATE_FRAMES, uniform: true }), { uniform: true }), ctx.precision));
    }
  }
  const measured = measurePath(path);
  return { path, d, frames, measured, length: measured.length, bounds: bounds(path), closed: path.closed };
}

const hasOffsets = (line: Line) => !!line.bands?.some((b) => b.offset);
const isAlong = (line: Line) => [line.paint, ...(line.bands ?? []).map((b) => b.paint)].some((p) => typeof p === "object" && "along" in p);

function renderLine(line: Line, index: number, ctx: Context): SvgNode {
  const g = geometry(line, ctx);
  // Names for this line's masks and animations. They depend on the spec, not the element's size,
  // so re-rendering after a resize keeps the same elements and animations don't restart.
  const key = hashString(JSON.stringify([index, line])).toString(36);
  const fmt = (n: number) => formatNumber(n, ctx.precision);
  const half = line.width / 2;
  const lineBox: Bounds = { minX: g.bounds.minX - half, minY: g.bounds.minY - half, maxX: g.bounds.maxX + half, maxY: g.bounds.maxY + half };

  // Width along the line, for tapered lines (drawn as filled outlines).
  const taper = line.taper;
  // Eased (1 − (1 − u)²) so the taper meets the full width without a kink.
  const ease = (u: number) => (u >= 1 ? 1 : u <= 0 ? 0 : 1 - (1 - u) * (1 - u));
  const widthAt = (w: number) => (s: number) => {
    if (!taper) return w;
    let k = 1;
    if (taper.start > 0) k = Math.min(k, ease(s / taper.start));
    if (taper.end > 0) k = Math.min(k, ease((g.length - s) / taper.end));
    return w * k;
  };

  const undulate = (frames: string[] | null): SvgNode[] =>
    frames && line.animate?.undulate
      ? [node("animate", { attributeName: "d", values: frames.join(";"), dur: `${fmt((line.patterns[0]!.wavelength / line.animate.undulate.speed) * 1000)}ms`, repeatCount: "indefinite" })]
      : [];

  const strokeAttrs = (w: number): Record<string, string> => ({
    fill: "none",
    "stroke-width": fmt(w),
    "stroke-linecap": line.cap,
    "stroke-linejoin": line.join,
  });

  let flowClass: string | null = null;
  if (line.animate?.flow && line.dash && !taper && !isAlong(line)) {
    const period = line.dash.reduce((a, b) => a + b, 0) * (line.dash.length % 2 === 1 ? 2 : 1);
    flowClass = cssName(ctx, "flow", key);
    ctx.css.push(
      `@keyframes ${flowClass}{to{stroke-dashoffset:${fmt(-period)}}}`,
      `.${flowClass}{animation:${flowClass} ${fmt((period / line.animate.flow.speed) * 1000)}ms linear infinite}`,
      `@media (prefers-reduced-motion:reduce){.${flowClass}{animation:none}}`,
    );
  }

  /** The shapes for one paint at one width: a stroke, an outline (tapered or off-centre), or slices for `along`. */
  const shapes = (paint: Paint, w: number, offset = 0): SvgNode[] => {
    if (typeof paint === "object" && "along" in paint) return alongSlices(paint.along, w, offset);
    const ref = paintRef(paint, lineBox, ctx);
    if (taper || offset !== 0) {
      const d = formatPath(outline(g.measured, 0, g.length, { width: widthAt(w), offset: () => offset, capStart: line.cap, capEnd: line.cap, closed: g.closed }), ctx.precision);
      return [node("path", { d, fill: ref })];
    }
    const attrs: Record<string, string> = { d: g.d, ...strokeAttrs(w), stroke: ref };
    if (line.dash) attrs["stroke-dasharray"] = line.dash.map(fmt).join(" ");
    if (flowClass) attrs.class = flowClass;
    return [node("path", attrs, undulate(g.frames))];
  };

  const alongSlices = (stops: readonly Stop[], w: number, offset: number): SvgNode[] => {
    const outlined = !!taper || offset !== 0;
    const parsed = stops.map((s, i) => {
      const color = parseColor(s.color);
      if (!color) throw new TypeError(`linescape: along stop ${i} has colour ${JSON.stringify(s.color)}, which can't be blended; use hex, rgb(), hsl() or a named colour`);
      return { offset: s.offset, color };
    });
    const colour = (s: number) => colorAt(parsed, g.length > 0 ? s / g.length : 0);
    const out: SvgNode[] = [];
    const fill = (c: RGBA, attr: "fill" | "stroke") => ({ [attr]: toHex(c), ...(c.a < 1 ? { [`${attr}-opacity`]: fmt(c.a) } : {}) });
    const n = Math.max(16, Math.min(outlined ? 200 : 600, Math.ceil(g.length / (outlined ? 8 : 4))));
    const step = g.length / n;
    if (!outlined && line.join === "round") {
      // Round joins at corners: slices end square, so fill the outside of each corner with a disc.
      for (const c of cornersOf(g.measured, g.closed)) {
        const p = frameAt(g.measured, c).p;
        out.push(node("circle", { cx: fmt(p.x), cy: fmt(p.y), r: fmt(w / 2), ...fill(colour(c), "fill") }));
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i * step;
      // Each slice overlaps the next by half a pixel to hide seams.
      const b = Math.min(g.length, a + step + 0.5);
      const c = colour(a + step / 2);
      if (outlined) {
        const capStart: Cap = i === 0 ? line.cap : "butt", capEnd: Cap = i === n - 1 ? line.cap : "butt";
        out.push(node("path", { d: formatPath(outline(g.measured, a, b, { width: widthAt(w), offset: () => offset, capStart, capEnd, closed: false }), ctx.precision), ...fill(c, "fill") }));
      } else {
        const attrs: Record<string, string> = { d: formatPath(slicePath(g.measured, a, b), ctx.precision), ...strokeAttrs(w), ...fill(c, "stroke") };
        attrs["stroke-linecap"] = i === 0 || i === n - 1 ? line.cap : "butt";
        if (line.dash) {
          attrs["stroke-dasharray"] = line.dash.map(fmt).join(" ");
          attrs["stroke-dashoffset"] = fmt(a);
        }
        out.push(node("path", attrs));
      }
    }
    return out;
  };

  let content: SvgNode[] = line.bands ? line.bands.flatMap((b) => shapes(b.paint, b.width, b.offset ?? 0)) : shapes(line.paint, line.width);

  // Hollow: mask out the middle, leaving an edge `outline.width` wide.
  if (line.outline) {
    const inner = line.width - 2 * line.outline.width;
    const maskShape = (w: number, colour: string): SvgNode =>
      taper
        ? node("path", { d: formatPath(outline(g.measured, 0, g.length, { width: widthAt(w), capStart: line.cap, capEnd: line.cap, closed: g.closed }), ctx.precision), fill: colour })
        : node("path", { d: g.d, ...strokeAttrs(w), stroke: colour }, undulate(g.frames));
    const shapesInMask = [maskShape(line.width, "#fff")];
    if (inner > 0) shapesInMask.push(maskShape(inner, "#000"));
    content = [maskGroup(ctx, "hollow", key, shapesInMask, content, line.width)];
  }

  // Draw: reveal the line through a mask whose stroke is drawn on with a dash animation.
  const draw = line.animate?.draw;
  if (draw) {
    const pad = g.closed ? 0 : line.width + 4;
    const padded = (p: PathData): PathData => {
      if (g.closed) return p;
      const m = measurePath(p);
      const s = frameAt(m, 0), e = frameAt(m, m.length);
      return { start: sub(s.p, scale(s.t, pad)), segments: [{ type: "L", to: p.start }, ...p.segments, { type: "L", to: add(e.p, scale(e.t, pad)) }], closed: false };
    };
    const total = g.length + 2 * pad + 2;
    const className = cssName(ctx, "draw", key);
    const center = draw.from === "center" || g.closed;
    const from = draw.from === "center"
      ? `stroke-dasharray:0 ${fmt(total)};stroke-dashoffset:${fmt(-total / 2)}`
      : `stroke-dashoffset:${fmt(draw.from === "end" ? -total : total)}`;
    const timing = `${fmt(draw.duration)}ms ${draw.easing} ${fmt(draw.delay)}ms ${line.animate!.repeat === "infinite" ? "infinite" : fmt(line.animate!.repeat)} both`;
    ctx.css.push(`@keyframes ${className}{from{${from}}to{stroke-dasharray:${fmt(total)} ${fmt(total)};stroke-dashoffset:0}}`, `.${className}{animation:${className} ${timing}}`);
    if (line.animate!.trigger === "scroll") {
      ctx.css.push(`@supports (animation-timeline:view()){.${className}{animation:${className} linear both;animation-timeline:--${ctx.prefix}-tl;animation-range:entry 0% exit 0%}}`);
    } else if (line.animate!.trigger === "visible") {
      ctx.waitsForVisibility = true;
      ctx.css.push(`.${ctx.prefix}[data-paused] .${className}{animation-play-state:paused}`);
    }
    ctx.css.push(`@media (prefers-reduced-motion:reduce){.${className}{animation:none}}`);
    // An undulating line needs its mask to undulate with it.
    let maskFrames: string[] | null = null;
    if (g.frames) {
      maskFrames = [formatPath(padded(g.path), ctx.precision)];
      for (let k = 1; k <= UNDULATE_FRAMES; k++) {
        maskFrames.push(formatPath(padded(emit(buildCurve(line, ctx.size, { shift: k / UNDULATE_FRAMES, uniform: true }), { uniform: true })), ctx.precision));
      }
    }
    const maskPath = node(
      "path",
      {
        d: formatPath(padded(g.path), ctx.precision),
        fill: "none",
        stroke: "#fff",
        "stroke-width": fmt(line.width + 4),
        "stroke-linecap": center ? "butt" : "round",
        "stroke-linejoin": "round",
        "stroke-dasharray": `${fmt(total)} ${fmt(total)}`,
        class: className,
      },
      undulate(maskFrames),
    );
    content = [maskGroup(ctx, "draw", key, [maskPath], content, line.width)];
  }

  const attrs: Record<string, string> = {};
  if (line.opacity !== 1) attrs.opacity = fmt(line.opacity);
  if (line.blend) attrs.style = `mix-blend-mode:${line.blend}`;
  return node("g", attrs, content);
}

/** Wraps content in a group masked by `shapes` (white shows, black hides). */
function maskGroup(ctx: Context, kind: string, key: string, shapes: SvgNode[], content: SvgNode[], width: number): SvgNode {
  const pad = width * 2 + 8;
  const attrs = {
    maskUnits: "userSpaceOnUse",
    x: formatNumber(-pad),
    y: formatNumber(-pad),
    width: formatNumber(ctx.size.width + 2 * pad),
    height: formatNumber(ctx.size.height + 2 * pad),
  };
  const id = `${ctx.prefix}-${kind}-${key}`;
  ctx.defs.set(id, node("mask", { id, ...attrs }, shapes));
  return node("g", { mask: `url(#${id})` }, content);
}

function cssName(ctx: Context, kind: string, key: string): string {
  return `${ctx.prefix}-${kind}-${key}`;
}

/** A paint as a stroke/fill value, adding a gradient definition if needed. */
function paintRef(paint: Exclude<Paint, { along: readonly Stop[] }>, lineBox: Bounds, ctx: Context): string {
  if (typeof paint === "string") return paint;
  const box = paint.box === "element" ? { minX: 0, minY: 0, maxX: ctx.size.width, maxY: ctx.size.height } : lineBox;
  const fmt = (n: number) => formatNumber(n, ctx.precision);
  const w = box.maxX - box.minX, h = box.maxY - box.minY;
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  let tag: string;
  let attrs: Record<string, string>;
  let stops: readonly Stop[];
  if ("linear" in paint) {
    // CSS convention: 0deg points up, 90deg right; 0% and 100% land on the box's corners.
    const a = (paint.linear.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const halfLen = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    tag = "linearGradient";
    attrs = { x1: fmt(cx - dx * halfLen), y1: fmt(cy - dy * halfLen), x2: fmt(cx + dx * halfLen), y2: fmt(cy + dy * halfLen) };
    stops = paint.linear.stops;
  } else {
    tag = "radialGradient";
    attrs = { cx: fmt(cx), cy: fmt(cy), r: fmt(Math.max(w, h) / 2) };
    stops = paint.radial.stops;
  }
  const children = [...stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => node("stop", { offset: fmt(Math.min(1, Math.max(0, s.offset))), "stop-color": s.color }));
  // Content-addressed: equal gradients share one definition, and two layers can't clash.
  const id = `${ctx.prefix}-${hashString(JSON.stringify([tag, attrs, children])).toString(36)}`;
  ctx.defs.set(id, node(tag, { id, gradientUnits: "userSpaceOnUse", ...attrs }, children));
  return `url(#${id})`;
}

// ── Serializing ──────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

function serializeNode(n: SvgNode | string): string {
  if (typeof n === "string") return escape(n);
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join("");
  return n.children.length === 0 ? `<${n.tag}${attrs}/>` : `<${n.tag}${attrs}>${n.children.map(serializeNode).join("")}</${n.tag}>`;
}

/** Serializes a rendered layer to a standalone SVG string. */
export function serialize(layer: RenderedLayer): string {
  const w = formatNumber(layer.width), h = formatNumber(layer.height);
  const root = node(
    "svg",
    { xmlns: "http://www.w3.org/2000/svg", width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: layer.className, "aria-hidden": "true", focusable: "false" },
    layer.children,
  );
  return serializeNode(root);
}

/** Renders lines to an SVG string: for static files, emails and servers. */
export function toSvg(lines: LinesInput, options: RenderOptions): string {
  return serialize(render(lines, options));
}
