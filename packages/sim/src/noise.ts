/** Seeded 2D value noise with octaves. Good enough for terrain blobs; cheap and deterministic. */
import { Rng } from "./rng.ts";

export class Noise2D {
  private perm: Uint8Array;
  private vals: Float32Array;

  constructor(rng: Rng) {
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = rng.next();
  }

  private lattice(x: number, y: number): number {
    return this.vals[this.perm[(x & 255) + this.perm[y & 255]]];
  }

  /** Smooth value noise in [0, 1]. */
  sample(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = this.lattice(xi, yi), b = this.lattice(xi + 1, yi);
    const c = this.lattice(xi, yi + 1), d = this.lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Fractal noise in [0, 1]. `scale` is the size of the biggest feature in tiles. */
  fbm(x: number, y: number, scale: number, octaves = 4): number {
    let amp = 1, freq = 1 / scale, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.sample(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
