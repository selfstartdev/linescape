/**
 * The line spec. `LineInput` is what you write; `Line` is the same thing with
 * every default filled in (see resolve()). Both are plain, JSON-serialisable data.
 */

/** px, or a percentage of the element's width (x) or height (y). */
export type Length = number | `${number}%`;

/**
 * A point in the element: CSS background-position syntax ("center", "left 30%",
 * "right 40px top 10%"), or an [x, y] pair of lengths.
 */
export type Point = string | readonly [x: Length, y: Length];

export type Side = "left" | "right";

export type PathInput =
  /** A straight line through a point at an angle, from edge to edge. 0° is horizontal; positive angles turn clockwise. */
  | { through: Point; angle: number }
  /** A straight line, or one smooth curve. `bend` is the sideways bulge as a fraction of the length; positive bulges left of the direction of travel. */
  | { from: Point; to: Point; bend?: number }
  /** A smooth curve through points. `smooth` 0 gives straight segments with corners, 1 (default) a fully smooth curve. */
  | { points: readonly Point[]; smooth?: number }
  /** Part of a circle. Angles in degrees: 0° points right, positive turns clockwise. */
  | { arc: { center: Point; radius: Length; start: number; end: number } }
  /** A closed circle or ellipse. */
  | { ring: { center: Point; radius: Length | readonly [Length, Length] } }
  /** Your own SVG path data. With a viewBox it's stretched to the element; without one, coordinates are px. */
  | { d: string; viewBox?: readonly [number, number, number, number] };

export type PatternType = "wave" | "ridges" | "steps" | "sawtooth" | "scallop" | "bumps" | "coil";

export interface PatternInput {
  type: PatternType;
  /** Sideways size in px (for `coil`, the loop radius). */
  amplitude?: number;
  /** Length of one repeat along the line, in px. */
  wavelength?: number;
  /** The part of the line it covers, as fractions of the path. Default [0, 1]. */
  range?: readonly [start: number, end: number];
  /** px over which the amplitude ramps in and out at the ends of the range. Default 0. */
  ease?: number;
  /** Offset along the pattern, 0–1 of a wavelength. Default 0. */
  phase?: number;
  /** Which side one-sided patterns (scallop, bumps, coil) sit on; flips the others. Default "left". */
  side?: Side;
}

export type FeatureInput =
  | { type: "loop"; at: number; radius?: number; turns?: number; side?: Side }
  | { type: "spiral"; at: "start" | "end"; radius?: number; turns?: number; inner?: number; side?: Side }
  | { type: "kink"; at: number; length?: number; angle?: number; side?: Side };

export interface Stop {
  offset: number;
  color: string;
}

export type GradientBox = "line" | "element";

export type Paint =
  | string
  | { linear: { angle: number; stops: readonly Stop[] }; box?: GradientBox }
  | { radial: { stops: readonly Stop[] }; box?: GradientBox }
  /** Colour changes along the line, from its start (offset 0) to its end (offset 1). */
  | { along: readonly Stop[] };

export interface Band {
  width: number;
  paint: Paint;
}

export interface DrawInput {
  /** ms. Default 1200. Ignored for trigger "scroll". */
  duration?: number;
  /** ms. Default 0. */
  delay?: number;
  /** CSS easing. Default "ease-in-out". */
  easing?: string;
  /** Where drawing starts. Default "start". */
  from?: "start" | "end" | "center";
}

export interface AnimateInput {
  draw?: DrawInput | boolean;
  /** Dashes march along the line (needs `dash`). Speed in px per second, default 60. */
  flow?: { speed?: number } | boolean;
  /** Patterns travel along the line. Speed in px per second, default 40. */
  undulate?: { speed?: number } | boolean;
  /** When `draw` runs: on load (default), when the line scrolls into view, or following the scroll position. */
  trigger?: "load" | "visible" | "scroll";
  /** How many times `draw` runs. Default 1. */
  repeat?: number | "infinite";
}

export interface LineInput {
  path: PathInput;
  patterns?: readonly PatternInput[];
  features?: readonly FeatureInput[];
  /** Stroke width in px. Default 40, or the widest band. */
  width?: number;
  cap?: "round" | "butt" | "square";
  join?: "round" | "miter" | "bevel";
  /** Dash and gap lengths in px, or round dots `dots` px apart. */
  dash?: readonly number[] | { dots: number };
  /** px over which the line narrows to a point at each end. */
  taper?: { start?: number; end?: number };
  opacity?: number;
  /** CSS mix-blend-mode. */
  blend?: string;
  /** Default "currentColor". */
  paint?: Paint;
  /** Concentric stripes on the same centerline, drawn in order (widest first). */
  bands?: readonly Band[];
  /** Hollow line: only an edge this many px wide is painted. */
  outline?: { width: number };
  animate?: AnimateInput;
}

// ── Resolved ─────────────────────────────────────────────────────────────

export type ResolvedPath =
  | { through: Point; angle: number }
  | { from: Point; to: Point; bend: number }
  | { points: readonly Point[]; smooth: number }
  | { arc: { center: Point; radius: Length; start: number; end: number } }
  | { ring: { center: Point; radius: Length | readonly [Length, Length] } }
  | { d: string; viewBox?: readonly [number, number, number, number] };

export type Pattern = Required<PatternInput>;

export type Feature =
  | { type: "loop"; at: number; radius: number; turns: number; side: Side }
  | { type: "spiral"; at: "start" | "end"; radius: number; turns: number; inner: number; side: Side }
  | { type: "kink"; at: number; length: number; angle: number; side: Side };

export interface Animate {
  draw: Required<DrawInput> | null;
  flow: { speed: number } | null;
  undulate: { speed: number } | null;
  trigger: "load" | "visible" | "scroll";
  repeat: number | "infinite";
}

export interface Line {
  path: ResolvedPath;
  patterns: Pattern[];
  features: Feature[];
  width: number;
  cap: "round" | "butt" | "square";
  join: "round" | "miter" | "bevel";
  dash: number[] | null;
  taper: { start: number; end: number } | null;
  opacity: number;
  blend: string | null;
  paint: Paint;
  bands: Band[] | null;
  outline: { width: number } | null;
  animate: Animate | null;
}
