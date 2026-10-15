/**
 * 決定的な乱数。乱数だけで理不尽さを出さないため、
 * 弾幕のランダム要素は「シード固定 + 毎回同じ」を基本にする。
 */
export class RNG {
  constructor(seed = 0x2545f491) {
    this.s = seed >>> 0;
  }
  /** 0..1 */
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  /** -1..1 */
  signed() { return this.next() * 2 - 1; }
  /** min..max */
  range(a, b) { return a + this.next() * (b - a); }
  /** 0..n-1 */
  int(n) { return Math.floor(this.next() * n) % n; }
  /** 配列から1つ選ぶ */
  pick(arr) { return arr[this.int(arr.length)]; }
  /** true を p の確率で返す */
  chance(p) { return this.next() < p; }
  /** 0..1 の揺らぎ (中心 c、幅 w) */
  jitter(c, w) { return c + this.signed() * w; }
  reset(seed) { this.s = seed >>> 0; }
}

export const rng = new RNG(20261015);

/** 0..1 の軽量乱数 (見た目用。再現性が不要な場所で使う) */
export const frand = () => Math.random();
