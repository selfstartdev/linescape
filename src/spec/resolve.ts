/**
 * resolve(): LineInput → Line. Fills every default and validates, so the rest of
 * the pipeline never deals with missing values. The result is plain data and can
 * be printed as code: it's the "frozen" form of a line.
 */
import type {
  Animate,
  AnimateInput,
  Band,
  Feature,
  FeatureInput,
  Line,
  LineInput,
  Paint,
  PathInput,
  Pattern,
  PatternInput,
  PatternType,
  ResolvedPath,
} from "./types";

export const LINE_DEFAULTS = {
  width: 40,
  cap: "round",
  join: "round",
  opacity: 1,
  paint: "currentColor",
} as const;

/** Default amplitude and wavelength per pattern, in px. */
export const PATTERN_DEFAULTS: Record<PatternType, { amplitude: number; wavelength: number }> = {
  wave: { amplitude: 24, wavelength: 160 },
  ridges: { amplitude: 24, wavelength: 96 },
  steps: { amplitude: 24, wavelength: 120 },
  sawtooth: { amplitude: 24, wavelength: 120 },
  scallop: { amplitude: 24, wavelength: 96 },
  bumps: { amplitude: 24, wavelength: 160 },
  coil: { amplitude: 40, wavelength: 90 },
};

export const FEATURE_DEFAULTS = {
  loop: { radius: 40, turns: 1, side: "left" },
  spiral: { radius: 120, turns: 2, inner: 0.2, side: "left" },
  kink: { length: 80, angle: 40, side: "left" },
} as const;

export const ANIMATE_DEFAULTS = {
  draw: { duration: 1200, delay: 0, easing: "ease-in-out", from: "start" },
  flow: { speed: 60 },
  undulate: { speed: 40 },
  trigger: "load",
  repeat: 1,
} as const;

const fail = (message: string): never => {
  throw new TypeError(`linescape: ${message}`);
};

function finite(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name} must be a finite number, got ${JSON.stringify(v)}`);
  return v as number;
}

function positive(name: string, v: unknown): number {
  const n = finite(name, v);
  if (n <= 0) fail(`${name} must be greater than 0, got ${n}`);
  return n;
}

function nonNegative(name: string, v: unknown): number {
  const n = finite(name, v);
  if (n < 0) fail(`${name} must be 0 or more, got ${n}`);
  return n;
}

function fraction(name: string, v: unknown): number {
  const n = finite(name, v);
  if (n < 0 || n > 1) fail(`${name} must be between 0 and 1, got ${n}`);
  return n;
}

function oneOf<T extends string>(name: string, v: unknown, options: readonly T[]): T {
  if (!options.includes(v as T)) fail(`${name} must be one of ${options.map((o) => JSON.stringify(o)).join(", ")}, got ${JSON.stringify(v)}`);
  return v as T;
}

function resolvePath(path: PathInput): ResolvedPath {
  if (!path || typeof path !== "object") return fail(`path is required, got ${JSON.stringify(path)}`);
  if ("through" in path) return { through: path.through, angle: finite("path.angle", path.angle) };
  if ("from" in path) return { from: path.from, to: path.to, bend: finite("path.bend", path.bend ?? 0) };
  if ("points" in path) {
    if (!Array.isArray(path.points) || path.points.length < 2) fail("path.points needs at least 2 points");
    return { points: [...path.points], smooth: fraction("path.smooth", path.smooth ?? 1) };
  }
  if ("arc" in path) {
    const { center, radius, start, end } = path.arc;
    return { arc: { center, radius, start: finite("path.arc.start", start), end: finite("path.arc.end", end) } };
  }
  if ("ring" in path) return { ring: { center: path.ring.center, radius: path.ring.radius } };
  if ("d" in path) {
    if (typeof path.d !== "string") fail("path.d must be a string");
    return path.viewBox ? { d: path.d, viewBox: path.viewBox } : { d: path.d };
  }
  return fail(`unknown path ${JSON.stringify(path)}`);
}

const PATTERN_TYPES = Object.keys(PATTERN_DEFAULTS) as PatternType[];
const SIDES = ["left", "right"] as const;

function resolvePattern(p: PatternInput, i: number): Pattern {
  const name = `patterns[${i}]`;
  const type = oneOf(`${name}.type`, p.type, PATTERN_TYPES);
  const d = PATTERN_DEFAULTS[type];
  const range = p.range ?? [0, 1];
  const start = fraction(`${name}.range[0]`, range[0]);
  const end = fraction(`${name}.range[1]`, range[1]);
  if (end <= start) fail(`${name}.range must go forwards, got [${start}, ${end}]`);
  return {
    type,
    amplitude: nonNegative(`${name}.amplitude`, p.amplitude ?? d.amplitude),
    wavelength: positive(`${name}.wavelength`, p.wavelength ?? d.wavelength),
    range: [start, end],
    ease: nonNegative(`${name}.ease`, p.ease ?? 0),
    phase: finite(`${name}.phase`, p.phase ?? 0),
    side: oneOf(`${name}.side`, p.side ?? "left", SIDES),
  };
}

function resolveFeature(f: FeatureInput, i: number): Feature {
  const name = `features[${i}]`;
  const side = oneOf(`${name}.side`, f.side ?? "left", SIDES);
  switch (f.type) {
    case "loop":
      return {
        type: "loop",
        at: fraction(`${name}.at`, f.at),
        radius: positive(`${name}.radius`, f.radius ?? FEATURE_DEFAULTS.loop.radius),
        turns: positive(`${name}.turns`, f.turns ?? FEATURE_DEFAULTS.loop.turns),
        side,
      };
    case "spiral": {
      const turns = positive(`${name}.turns`, f.turns ?? FEATURE_DEFAULTS.spiral.turns);
      return {
        type: "spiral",
        at: oneOf(`${name}.at`, f.at, ["start", "end"] as const),
        radius: positive(`${name}.radius`, f.radius ?? FEATURE_DEFAULTS.spiral.radius),
        turns,
        inner: fraction(`${name}.inner`, f.inner ?? FEATURE_DEFAULTS.spiral.inner),
        side,
      };
    }
    case "kink": {
      const angle = finite(`${name}.angle`, f.angle ?? FEATURE_DEFAULTS.kink.angle);
      if (angle <= 0 || angle >= 180) fail(`${name}.angle must be between 0 and 180, got ${angle}`);
      return {
        type: "kink",
        at: fraction(`${name}.at`, f.at),
        length: positive(`${name}.length`, f.length ?? FEATURE_DEFAULTS.kink.length),
        angle,
        side,
      };
    }
    default:
      return fail(`unknown feature type ${JSON.stringify((f as { type: unknown }).type)}`);
  }
}

function resolvePaint(name: string, paint: Paint): Paint {
  if (typeof paint === "string") return paint;
  if (!paint || typeof paint !== "object") return fail(`${name} must be a colour or a gradient, got ${JSON.stringify(paint)}`);
  const stops = (list: unknown, at: string) => {
    if (!Array.isArray(list) || list.length === 0) fail(`${at} needs at least one stop`);
    return (list as { offset: unknown; color: unknown }[]).map((s, i) => {
      if (typeof s.color !== "string") fail(`${at}[${i}].color must be a string`);
      return { offset: finite(`${at}[${i}].offset`, s.offset), color: s.color as string };
    });
  };
  const box = (b: unknown) => oneOf(`${name}.box`, b ?? "line", ["line", "element"] as const);
  if ("linear" in paint) return { linear: { angle: finite(`${name}.linear.angle`, paint.linear.angle), stops: stops(paint.linear.stops, `${name}.linear.stops`) }, box: box(paint.box) };
  if ("radial" in paint) return { radial: { stops: stops(paint.radial.stops, `${name}.radial.stops`) }, box: box(paint.box) };
  if ("along" in paint) return { along: stops(paint.along, `${name}.along`) };
  return fail(`${name}: unknown paint ${JSON.stringify(paint)}`);
}

function resolveAnimate(a: AnimateInput | undefined): Animate | null {
  if (!a) return null;
  // null is how a resolved Line spells "off", so resolving a Line again keeps it off.
  const pick = <T extends object>(v: T | boolean | null | undefined, defaults: Required<T>): Required<T> | null =>
    v === undefined || v === null || v === false ? null : { ...defaults, ...(v === true ? {} : v) };
  const draw = pick(a.draw, ANIMATE_DEFAULTS.draw as Required<NonNullable<Exclude<AnimateInput["draw"], boolean>>>);
  if (draw) {
    nonNegative("animate.draw.duration", draw.duration);
    nonNegative("animate.draw.delay", draw.delay);
    oneOf("animate.draw.from", draw.from, ["start", "end", "center"] as const);
    if (typeof draw.easing !== "string") fail("animate.draw.easing must be a CSS easing string");
  }
  const flow = pick(a.flow, ANIMATE_DEFAULTS.flow);
  if (flow) positive("animate.flow.speed", flow.speed);
  const undulate = pick(a.undulate, ANIMATE_DEFAULTS.undulate);
  if (undulate) positive("animate.undulate.speed", undulate.speed);
  if (!draw && !flow && !undulate) return null;
  const repeat = a.repeat ?? ANIMATE_DEFAULTS.repeat;
  if (repeat !== "infinite") positive("animate.repeat", repeat);
  return {
    draw,
    flow,
    undulate,
    trigger: oneOf("animate.trigger", a.trigger ?? ANIMATE_DEFAULTS.trigger, ["load", "visible", "scroll"] as const),
    repeat,
  };
}

/** Fills every default and validates. Resolving a resolved line returns an equal line. */
export function resolve(input: LineInput | Line): Line {
  if (!input || typeof input !== "object") return fail(`expected a line, got ${JSON.stringify(input)}`);
  const i = input as LineInput;

  const bands: Band[] | null = i.bands && i.bands.length > 0
    ? i.bands.map((b, n) => ({ width: positive(`bands[${n}].width`, b.width), paint: resolvePaint(`bands[${n}].paint`, b.paint) }))
    : null;
  const width = positive("width", i.width ?? (bands ? Math.max(...bands.map((b) => b.width)) : LINE_DEFAULTS.width));

  let dash: number[] | null = null;
  let cap = oneOf("cap", i.cap ?? LINE_DEFAULTS.cap, ["round", "butt", "square"] as const);
  if (i.dash) {
    if (Array.isArray(i.dash)) {
      if (i.dash.length === 0) fail("dash needs at least one length");
      dash = i.dash.map((n, k) => nonNegative(`dash[${k}]`, n));
      if (dash.every((n) => n === 0)) fail("dash lengths can't all be 0");
    } else {
      // Dots are zero-length dashes with round caps, `dots` px apart.
      dash = [0, positive("dash.dots", (i.dash as { dots: number }).dots)];
      cap = "round";
    }
  }

  let taper: Line["taper"] = null;
  if (i.taper && (i.taper.start || i.taper.end)) {
    taper = { start: nonNegative("taper.start", i.taper.start ?? 0), end: nonNegative("taper.end", i.taper.end ?? 0) };
  }

  let outline: Line["outline"] = null;
  if (i.outline) {
    const w = positive("outline.width", i.outline.width);
    outline = { width: w };
  }

  return {
    path: resolvePath(i.path),
    patterns: (i.patterns ?? []).map(resolvePattern),
    features: (i.features ?? []).map(resolveFeature),
    width,
    cap,
    join: oneOf("join", i.join ?? LINE_DEFAULTS.join, ["round", "miter", "bevel"] as const),
    dash,
    taper,
    opacity: fraction("opacity", i.opacity ?? LINE_DEFAULTS.opacity),
    blend: i.blend ?? null,
    paint: resolvePaint("paint", i.paint ?? LINE_DEFAULTS.paint),
    bands,
    outline,
    animate: resolveAnimate((i.animate ?? undefined) as AnimateInput | undefined),
  };
}
