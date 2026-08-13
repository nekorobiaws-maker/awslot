/**
 * シード付き乱数(mulberry32)。デバッグ再現用。DESIGN.md 6.9
 * URLパラメータ ?seed=12345 で固定できる。
 */

export class Rng {
  /** @param {number|null} seed 未指定なら時刻ベースのランダムシード */
  constructor(seed = null) {
    this.seed = (seed === null || Number.isNaN(seed))
      ? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
      : seed >>> 0;
    this._s = this.seed;
    this.calls = 0;
  }

  /** [0, 1) の浮動小数 */
  next() {
    this.calls++;
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 確率 p (0〜1) で true */
  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  /** 1/denom で true */
  chanceDenom(denom) {
    if (!denom || denom <= 0) return false;
    return this.next() < 1 / denom;
  }

  /** 0以上 n未満の整数 */
  int(n) {
    return Math.floor(this.next() * n);
  }

  /** min以上 max以下の整数 */
  range(min, max) {
    return min + this.int(max - min + 1);
  }

  /** 配列から1つ選ぶ */
  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /**
   * 重み付き抽選。{ key: weight } を受け取りキーを返す。
   * 重みの合計が1未満でも合計で正規化する。
   */
  weighted(table) {
    const entries = Object.entries(table).filter(([, w]) => w > 0);
    if (entries.length === 0) return null;
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = this.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries[entries.length - 1][0];
  }
}
