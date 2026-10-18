/**
 * Presets: hand-made starting points. Spread one and override what you like:
 *
 *   <Linescape line={{ ...presets.swoosh, paint: "#0a7" }} />
 *
 * They're part of generated output, so they fall under the stability promise.
 */
import type { LineInput } from "../spec/types";

const peach = [
  { offset: 0, color: "#ffd6c2" },
  { offset: 1, color: "#ffeab8" },
];

export const presets = {
  /** A wide diagonal band behind a hero. */
  band: {
    path: { through: "center", angle: -12 },
    width: 220,
    paint: { linear: { angle: 90, stops: peach } },
  },
  /** A sweep across the element with one cursive loop. */
  swoosh: {
    path: { from: "left 80%", to: "right 30%", bend: 0.08 },
    width: 48,
    features: [{ type: "loop", at: 0.55, radius: 90 }],
    paint: "#7c5cff",
  },
  /** A squiggle to put under a heading (inside the heading's wrapper). */
  underline: {
    path: { from: "20% 85%", to: "80% 85%" },
    width: 10,
    patterns: [{ type: "wave", amplitude: 8, wavelength: 40 }],
    animate: { draw: { duration: 600 } },
  },
  /** A page-length S of ridges, drawn as you scroll. */
  ridgeline: {
    path: { points: ["70% -5%", "30% 35%", "75% 70%", "40% 105%"] },
    width: 64,
    patterns: [{ type: "ridges", amplitude: 30, wavelength: 120, range: [0.15, 0.85], ease: 200 }],
    animate: { draw: true, trigger: "scroll" },
  },
  /** A line that curls into a spiral in the top right corner. */
  swirl: {
    path: { from: "right -5%", to: "85% 15%" },
    width: 30,
    features: [{ type: "spiral", at: "end", radius: 160, turns: 2.5 }],
  },
  /** Thick racing stripes. */
  stripes: {
    path: { from: "left 60%", to: "right 40%", bend: -0.15 },
    width: 260,
    bands: [
      { width: 260, paint: "#1d3557" },
      { width: 160, paint: "#f1faee" },
      { width: 60, paint: "#e63946" },
    ],
  },
  /** A broad, slow wave across the element. */
  ribbon: {
    path: { from: "left 65%", to: "right 35%" },
    width: 140,
    patterns: [{ type: "wave", amplitude: 60, wavelength: 900 }],
    paint: { linear: { angle: 90, stops: [{ offset: 0, color: "#a9b8f5" }, { offset: 1, color: "#f9b4c8" }] } },
  },
  /** A telephone cord: loops that grow in and fade out. */
  coil: {
    path: { from: "left 50%", to: "right 50%" },
    width: 8,
    patterns: [{ type: "coil", amplitude: 48, wavelength: 90, range: [0.1, 0.9], ease: 160 }],
  },
  /** A thick zigzag rising across the element. */
  zigzag: {
    path: { from: "left 85%", to: "right 15%" },
    width: 90,
    join: "miter",
    patterns: [{ type: "ridges", amplitude: 70, wavelength: 360 }],
    paint: "#ffd166",
  },
  /** A brush stroke: tapered at both ends, its colour shifting along its length. */
  brush: {
    path: { from: "10% 75%", to: "90% 30%", bend: 0.15 },
    width: 110,
    taper: { start: 260, end: 520 },
    paint: { along: [{ offset: 0, color: "#ef476f" }, { offset: 1, color: "#ffd166" }] },
  },
  /** A dotted ellipse around the content. */
  frame: {
    path: { ring: { center: "center", radius: ["46%", "42%"] } },
    width: 8,
    dash: { dots: 22 },
  },
  /** An arc around a corner. */
  orbit: {
    path: { arc: { center: "right bottom", radius: "32%", start: 180, end: 270 } },
    width: 44,
    outline: { width: 6 },
  },
  /** Three parallel lines sweeping across together. */
  parallel: {
    path: { from: "left 30%", to: "right 25%", bend: 0.12 },
    bands: [
      { width: 10, paint: "#e63946", offset: 30 },
      { width: 10, paint: "#f4a261" },
      { width: 10, paint: "#2a9d8f", offset: -30 },
    ],
  },
  /** Dashes that keep flowing along a gentle curve. */
  current: {
    path: { from: "left 30%", to: "right 70%", bend: -0.1 },
    width: 6,
    dash: [28, 18],
    cap: "round",
    animate: { flow: { speed: 50 } },
  },
  /** A hand-drawn scribble: loops on a winding path. */
  scribble: {
    path: { points: ["left 70%", "30% 40%", "60% 65%", "right 25%"] },
    width: 14,
    features: [{ type: "loop", at: 0.3, radius: 55 }, { type: "loop", at: 0.62, radius: 45, side: "right" }],
    animate: { draw: { duration: 1800 } },
  },
} satisfies Record<string, LineInput>;

export type PresetName = keyof typeof presets;
