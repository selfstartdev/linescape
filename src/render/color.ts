/**
 * Just enough CSS colour parsing to interpolate `along` gradients: hex, rgb(),
 * hsl() and the named colours. Everything else (currentColor, var(), oklch…)
 * can't be interpolated ahead of time, so it's an error there.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

// CSS named colours, packed as name + 6 hex digits.
const NAMED_SOURCE =
  "aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 " +
  "blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 " +
  "chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b " +
  "darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b " +
  "darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f " +
  "darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 " +
  "deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 " +
  "fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f " +
  "grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa " +
  "lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff " +
  "lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a " +
  "lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 " +
  "lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd " +
  "mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a " +
  "mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 " +
  "navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 " +
  "palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 " +
  "peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f " +
  "royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d " +
  "silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f " +
  "steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 " +
  "white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32";

let named: Map<string, string> | undefined;
function namedColor(name: string): string | undefined {
  if (!named) {
    named = new Map();
    const parts = NAMED_SOURCE.split(" ");
    for (let i = 0; i < parts.length; i += 2) named.set(parts[i]!, parts[i + 1]!);
  }
  return named.get(name);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function hex(h: string): RGBA | null {
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

function channel(token: string, max: number): number {
  return token.endsWith("%") ? (parseFloat(token) / 100) * max : parseFloat(token);
}

function alpha(token: string | undefined): number {
  if (token === undefined) return 1;
  return clamp(token.endsWith("%") ? parseFloat(token) / 100 : parseFloat(token), 0, 1);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

export function parseColor(input: string): RGBA | null {
  const c = input.trim().toLowerCase();
  if (c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (c.startsWith("#")) return hex(c.slice(1));
  const name = namedColor(c);
  if (name) return hex(name);
  const m = /^(rgba?|hsla?)\((.*)\)$/.exec(c);
  if (!m) return null;
  const parts = m[2]!.replace(/\s*\/\s*/, " / ").split(/[\s,]+/).filter((p) => p && p !== "/");
  if (parts.length < 3 || parts.length > 4 || parts.some((p) => !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(%|deg)?$/.test(p))) return null;
  if (m[1]!.startsWith("rgb")) {
    return { r: clamp(channel(parts[0]!, 255), 0, 255), g: clamp(channel(parts[1]!, 255), 0, 255), b: clamp(channel(parts[2]!, 255), 0, 255), a: alpha(parts[3]) };
  }
  const h = ((parseFloat(parts[0]!) % 360) + 360) % 360;
  const [r, g, b] = hslToRgb(h, clamp(parseFloat(parts[1]!) / 100, 0, 1), clamp(parseFloat(parts[2]!) / 100, 0, 1));
  return { r, g, b, a: alpha(parts[3]) };
}

/** Colour at `t` along a list of stops, interpolated in sRGB with premultiplied alpha. */
export function colorAt(stops: readonly { offset: number; color: RGBA }[], t: number): RGBA {
  const first = stops[0]!, last = stops[stops.length - 1]!;
  if (t <= first.offset) return first.color;
  if (t >= last.offset) return last.color;
  let i = 1;
  while (stops[i]!.offset < t) i++;
  const a = stops[i - 1]!, b = stops[i]!;
  const u = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 1;
  const alphaMix = a.color.a + (b.color.a - a.color.a) * u;
  const mix = (x: number, y: number) =>
    alphaMix === 0 ? 0 : (x * a.color.a + (y * b.color.a - x * a.color.a) * u) / alphaMix;
  return { r: mix(a.color.r, b.color.r), g: mix(a.color.g, b.color.g), b: mix(a.color.b, b.color.b), a: alphaMix };
}

export function toHex({ r, g, b }: RGBA): string {
  const h = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
