/**
 * The test designs from the plan: the yardstick for the spec. If one of these
 * needs more than a couple of lines to write, the spec is missing a shorthand.
 */
import type { LineInput } from "../src";

export const designs: Record<string, LineInput> = {
  band: {
    path: { through: "center", angle: -12 },
    width: 220,
    paint: { linear: { angle: 90, stops: [{ offset: 0, color: "#ffd6c2" }, { offset: 1, color: "#ffeab8" }] } },
  },
  swoosh: {
    path: { from: "left 80%", to: "right 30%", bend: 0.08 },
    width: 48,
    features: [{ type: "loop", at: 0.55, radius: 50 }],
    paint: "#7c5cff",
  },
  underline: {
    path: { from: "20% 85%", to: "80% 85%" },
    width: 10,
    patterns: [{ type: "wave", amplitude: 8, wavelength: 40 }],
    animate: { draw: { duration: 600 } },
  },
  ridgeline: {
    path: { points: ["70% -5%", "30% 35%", "75% 70%", "40% 105%"] },
    width: 64,
    patterns: [{ type: "ridges", amplitude: 30, wavelength: 120, range: [0.15, 0.85], ease: 200 }],
    animate: { draw: { duration: 1 }, trigger: "scroll" },
  },
  swirl: {
    path: { from: "right -5%", to: "85% 15%" },
    width: 30,
    features: [{ type: "spiral", at: "end", radius: 160, turns: 2.5 }],
  },
  stripes: {
    path: { from: "left 60%", to: "right 40%", bend: -0.15 },
    width: 260,
    bands: [
      { width: 260, paint: "#1d3557" },
      { width: 160, paint: "#f1faee" },
      { width: 60, paint: "#e63946" },
    ],
  },
};
