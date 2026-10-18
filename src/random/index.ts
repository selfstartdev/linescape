/**
 * Seeded randomness. Every value comes from a sub-stream keyed by its context,
 * e.g. random.fork("band", 3, "blob", 1).value("rotation"), so adding a new
 * property or blob never shifts the values of existing ones.
 */

/** cyrb53 string hash: fast, well distributed, 53-bit result. */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32: small, fast 32-bit generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type KeyPart = string | number;

export interface Random {
  /** The full key of this stream (seed plus fork path). */
  readonly key: string;
  /** Next float in [0, 1) from this stream. */
  next(): number;
  /** Next float in [min, max). */
  range(min: number, max: number): number;
  /** Next integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** An independent sub-stream. Does not consume values from this stream. */
  fork(...path: KeyPart[]): Random;
  /** Shorthand for fork(...path).next(): one independent value for a named property. */
  value(...path: KeyPart[]): number;
}

// Separates key parts so seed "a/b" can never collide with seed "a" + fork "b".
const SEP = "\u0000";

export function createRandom(seed: KeyPart): Random {
  return fromKey(String(seed));
}

function fromKey(key: string): Random {
  const gen = mulberry32(hashString(key));
  const random: Random = {
    key,
    next: gen,
    range: (min, max) => min + gen() * (max - min),
    int: (min, max) => min + Math.floor(gen() * (max - min + 1)),
    fork: (...path) => fromKey(key + SEP + path.join(SEP)),
    value: (...path) => random.fork(...path).next(),
  };
  return random;
}

/** Accepts either a Random or a seed, so simple calls can pass a string. */
export function toRandom(random: Random | KeyPart): Random {
  return typeof random === "object" ? random : createRandom(random);
}
