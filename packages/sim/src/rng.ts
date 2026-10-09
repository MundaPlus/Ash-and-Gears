/** Seeded random numbers (sfc32). The state is 4 numbers, so it saves and loads exactly. */

/** Hash a string seed into 4 uint32 values (xmur3). */
export function hashSeed(seed: string): [number, number, number, number] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  return [next(), next(), next(), next()];
}

export class Rng {
  s: [number, number, number, number];

  constructor(seed: string | [number, number, number, number]) {
    this.s = typeof seed === "string" ? hashSeed(seed) : [...seed];
    for (let i = 0; i < 12; i++) this.next(); // mix weak seeds
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let [a, b, c, d] = this.s;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a, b, c, d];
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max] (both included). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }

  /** A child generator with its own stream, so systems do not disturb each other. */
  fork(label: string): Rng {
    return new Rng(`${this.s.join(",")}:${label}`);
  }
}
