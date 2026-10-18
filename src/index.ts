// Main API
export { render, serialize, toSvg, type LinesInput, type RenderedLayer, type RenderOptions, type SvgNode } from "./render";
export { resolve, ANIMATE_DEFAULTS, FEATURE_DEFAULTS, LINE_DEFAULTS, PATTERN_DEFAULTS } from "./spec/resolve";
export { linescapeParentStyle } from "./parent";
export { presets, type PresetName } from "./presets";
export type {
  Animate,
  AnimateInput,
  Band,
  DrawInput,
  Feature,
  FeatureInput,
  GradientBox,
  Length,
  Line,
  LineInput,
  Paint,
  PathInput,
  Pattern,
  PatternInput,
  PatternType,
  Point,
  ResolvedPath,
  Side,
  Stop,
} from "./spec/types";

// Building blocks, for advanced use
export { resolveLength, resolvePoint, type Size } from "./spec/position";
export { buildBackbone, bleedRadius, type Backbone, type Frame } from "./backbone";
export { buildCurve, type Curve, type CurveOptions, type Piece } from "./curve";
export { emit, pathLength, type EmitOptions } from "./emit";
export { bounds, formatNumber, formatPath, type Bounds, type PathData, type Segment, type Vec } from "./geometry";
export { parsePath } from "./geometry/parse";
export { createRandom, hashString, type KeyPart, type Random } from "./random";
