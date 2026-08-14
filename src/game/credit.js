/**
 * クレジット・差枚管理。
 *
 * AT中の純増(payoutPerGame)は 1.4 枚などの小数になるため、
 * 端数を内部に貯めて整数になったぶんだけ払い出す(addFraction)。
 */

import { BET_PER_GAME } from '../data/payouts.js';

/** クレジット不足時にデバッグ用として自動投入する枚数 */
export const AUTO_INSERT = 50;

export class Credit {
  constructor(initial = 50) {
    this.credit = initial;
    this.totalIn = 0;      // 総投入枚数
    this.totalOut = 0;     // 総払出枚数
    this.inserted = initial; // 手入れ(自動投入含む)枚数
    this._frac = 0;        // 小数払出の端数キャリー
  }

  /** 差枚(出玉)。100回転スコアアタックではこれがそのままスコアになる */
  get diff() {
    return this.totalOut - this.totalIn;
  }

  /**
   * 全カウンタを初期化する(セッションのリスタート用)。
   * 差枚の基準ごと戻すので、新しいセッションのスコアは必ず0から始まる。
   */
  reset(initial = 0) {
    this.credit = initial;
    this.totalIn = 0;
    this.totalOut = 0;
    this.inserted = initial;
    this._frac = 0;
    return this;
  }

  canBet(amount = BET_PER_GAME) {
    return this.credit >= amount;
  }

  /** @returns {boolean} BETできたか */
  bet(amount = BET_PER_GAME) {
    if (!this.canBet(amount)) return false;
    this.credit -= amount;
    this.totalIn += amount;
    return true;
  }

  /** デバッグ用のコイン投入 */
  insert(amount = AUTO_INSERT) {
    this.credit += amount;
    this.inserted += amount;
    return amount;
  }

  /** 整数枚の払出 */
  add(n) {
    const v = Math.max(0, Math.floor(n));
    this.credit += v;
    this.totalOut += v;
    return v;
  }

  /**
   * 端数処理だけ行い、払い出すべき整数枚数を返す(クレジットには加算しない)。
   * 払出アニメで1枚ずつ加算したいときに使う。
   * @returns {number}
   */
  takeFraction(x) {
    if (!Number.isFinite(x) || x <= 0) return 0;
    this._frac += x;
    const n = Math.floor(this._frac);
    this._frac -= n;
    return n;
  }

  /**
   * 小数枚の払出。端数はキャリーして次ゲーム以降に繰り越す。
   * @returns {number} 実際に払い出した整数枚数
   */
  addFraction(x) {
    const n = this.takeFraction(x);
    if (n > 0) this.add(n);
    return n;
  }

  /** 表示用の端数(0〜1) */
  get carry() {
    return this._frac;
  }
}
