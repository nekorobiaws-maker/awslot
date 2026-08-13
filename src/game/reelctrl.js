/**
 * リールの論理状態と停止制御(引き込み)。DESIGN.md 6.4
 *
 * position は「中段に表示されるコマの位置」を表す float。
 * 描画側(render/reelview.js)は position の整数部と小数部からコマを並べる。
 * ここは描画を一切知らない(game/ は render/ を import しない)。
 */

import { REEL_STRIPS, REEL_LENGTH } from '../data/reelstrips.js';
import { TARGET_SYMBOL } from '../data/flags.js';
import { categorizeLine } from '../data/payouts.js';

/** 定速時の回転速度(コマ/秒)。21コマ/0.8秒 ≒ 26.25 */
export const SPIN_SPEED = REEL_LENGTH / 0.8;
/** 加速度(コマ/秒^2)。約0.3秒で定速に達する */
export const ACCEL_RATE = SPIN_SPEED / 0.3;
/** 通常の引き込み上限コマ数 */
export const MAX_SLIP = 4;
/** 停止アニメの基本時間(ms)と1コマあたりの加算 */
export const STOP_BASE_MS = 190;
export const STOP_PER_SLIP_MS = 34;
/**
 * 停止アニメの上限(ms)。
 * レア役絵柄は5コマ窓制約の対象外なので最大20コマ滑ることがあり、
 * 素直に slip に比例させると停止が間延びする。上限を設けて
 * 「大きく滑るほど速く流れて止まる」ロングスベリの見え方にする。
 */
export const STOP_MAX_MS = 520;

export const REEL_STATE = {
  STOPPED: 'STOPPED',
  ACCEL: 'ACCEL',
  SPINNING: 'SPINNING',
  STOPPING: 'STOPPING',
};

/** easeOutBack (DESIGN.md 6.4「ガコン」と止まる質感) */
export function easeOutBack(x, overshoot = 1.35) {
  const c1 = overshoot;
  const c3 = c1 + 1;
  const t = x - 1;
  return 1 + c3 * t * t * t + c1 * t * t;
}

export class Reel {
  /**
   * @param {number} index 0=左 1=中 2=右
   * @param {string[]} strip
   */
  constructor(index, strip) {
    this.index = index;
    this.strip = strip;
    this.len = strip.length;
    // 起動時はゴースト7が中段に揃った状態から始める(2026-08-13 ユーザー指示)。
    // 絵柄が見つからないストリップでも動くよう、無ければ従来のばらつき初期位置。
    const seven = strip.indexOf('GHOST7');
    this.position = seven >= 0 ? seven : index * 3.5 % this.len;
    this.speed = 0;
    this.state = REEL_STATE.STOPPED;
    this.slip = 0;
    this._from = 0;
    this._target = 0;
    this._dur = 0;
    this._elapsed = 0;
    this._overshoot = 1.35;
    this._pending = null;
  }

  get isStopped() { return this.state === REEL_STATE.STOPPED; }
  get isSpinning() { return this.state === REEL_STATE.SPINNING; }
  /** 停止操作を受け付けられるか */
  get canStop() { return this.state === REEL_STATE.ACCEL || this.state === REEL_STATE.SPINNING; }

  start() {
    this.state = REEL_STATE.ACCEL;
    this.speed = 0;
    this.slip = 0;
    this._pending = null;
  }

  /** 中段の絵柄ID */
  centerSymbol() {
    const idx = ((Math.floor(this.position) % this.len) + this.len) % this.len;
    return this.strip[idx];
  }

  /**
   * 停止先が確定している場合の中段絵柄。
   * 停止アニメ中(STOPPING)でも停止位置は決まっているため確定値を返す。
   * まだ回転中なら null。
   * ※ 入賞回避の判定で「アニメ中のリールを未停止扱いしない」ために必要。
   */
  resolvedSymbol() {
    if (this.state === REEL_STATE.STOPPED) return this.centerSymbol();
    if (this.state === REEL_STATE.STOPPING) {
      return this.strip[((this._target % this.len) + this.len) % this.len];
    }
    return null;
  }

  /** 上中下3コマ(表示されている窓の中身) */
  windowSymbols() {
    const base = ((Math.floor(this.position) % this.len) + this.len) % this.len;
    return [
      this.strip[(base - 1 + this.len) % this.len],
      this.strip[base],
      this.strip[(base + 1) % this.len],
    ];
  }

  /**
   * 目標位置へ向けて停止を開始する。
   * @param {number} targetPos position と同じスケールの絶対位置(整数)
   * @param {number} slip 滑りコマ数(演出/ログ用)
   */
  beginStop(targetPos, slip) {
    this.state = REEL_STATE.STOPPING;
    this.slip = slip;
    this._from = this.position;
    this._target = targetPos;
    this._elapsed = 0;
    this._dur = Math.min(STOP_MAX_MS, STOP_BASE_MS + slip * STOP_PER_SLIP_MS);
    // オーバーシュートは移動量に比例するため、大きく滑るときは係数を下げて
    // 「戻り量」が常に 0.3コマ程度に収まるようにする
    this._overshoot = 1.35 * Math.min(1, 3 / Math.max(1, slip));
  }

  update(dtMs) {
    const dt = dtMs / 1000;
    switch (this.state) {
      case REEL_STATE.ACCEL:
        this.speed = Math.min(SPIN_SPEED, this.speed + ACCEL_RATE * dt);
        this.position += this.speed * dt;
        if (this.speed >= SPIN_SPEED) this.state = REEL_STATE.SPINNING;
        break;
      case REEL_STATE.SPINNING:
        this.position += this.speed * dt;
        break;
      case REEL_STATE.STOPPING: {
        this._elapsed += dtMs;
        const p = Math.min(1, this._elapsed / this._dur);
        this.position = this._from + (this._target - this._from) * easeOutBack(p, this._overshoot);
        if (p >= 1) {
          this.position = ((this._target % this.len) + this.len) % this.len;
          this.speed = 0;
          this.state = REEL_STATE.STOPPED;
          return true; // このフレームで停止完了
        }
        break;
      }
      default:
        break;
    }
    return false;
  }
}

/**
 * 停止位置を決める。DESIGN.md 6.4
 *
 * @param {string[]} strip リール配列
 * @param {number} pressedPos 押した瞬間の position(float)
 * @param {string|null} target 引き込みたい絵柄(null なら自由停止)
 * @param {(symbolId:string)=>boolean} isForbidden 中段に来てはいけない絵柄の判定
 * @returns {{pos:number, slip:number, pulled:boolean}}
 */
export function decideStopPosition(strip, pressedPos, target, isForbidden = () => false) {
  const len = strip.length;
  const base = Math.ceil(pressedPos);

  if (target) {
    // まず通常の4コマ以内で引き込む
    for (let slip = 0; slip <= MAX_SLIP; slip++) {
      if (strip[(base + slip) % len] === target) return { pos: base + slip, slip, pulled: true };
    }
    // カジュアル方針として取りこぼしは発生させない(DESIGN.md 6.4)。
    // 4コマで届かないレア役絵柄は滑りコマ数を拡張して必ず引き込む。
    for (let slip = MAX_SLIP + 1; slip < len; slip++) {
      if (strip[(base + slip) % len] === target) return { pos: base + slip, slip, pulled: true };
    }
    return { pos: base, slip: 0, pulled: false };
  }

  // 自由停止: 禁止絵柄を避けられる位置を探す
  for (let slip = 0; slip <= MAX_SLIP; slip++) {
    const sym = strip[(base + slip) % len];
    if (!isForbidden(sym)) return { pos: base + slip, slip, pulled: false };
  }
  return { pos: base, slip: 0, pulled: false };
}

export class ReelController {
  constructor(strips = REEL_STRIPS) {
    this.reels = strips.map((strip, i) => new Reel(i, strip));
    /** 停止順(押された順のリールindex) */
    this.stopOrder = [];
    this.flag = 'LOSE';
    /** 今ゲームの引き込み目標 [左, 中, 右] */
    this.targets = TARGET_SYMBOL.LOSE;
    /** 自由停止時に入賞形を避けるか(ハズレの通常ゲームだけ true) */
    this.avoidWin = true;
  }

  get allStopped() { return this.reels.every((r) => r.isStopped); }
  get stoppedCount() { return this.reels.filter((r) => r.isStopped).length; }

  /**
   * 全リール始動。
   * @param {string} flag 成立フラグ
   * @param {string[]|null} [targetOverride] 引き込み目標の差し替え。
   *   ボーナス入賞待ちのハズレゲームで「ボーナス図柄を揃える」ために使う
   *   (DESIGN.md 3.7 / 6.4)。指定時は入賞回避を行わない。
   */
  startAll(flag, targetOverride = null) {
    this.flag = flag;
    this.targets = targetOverride ?? TARGET_SYMBOL[flag] ?? TARGET_SYMBOL.LOSE;
    this.avoidWin = flag === 'LOSE' && !targetOverride;
    this.stopOrder = [];
    for (const r of this.reels) r.start();
  }

  /**
   * 中段ライン(停止先が未確定のリールは null)。
   * 停止アニメ中のリールも確定値として扱う。
   */
  centerLine() {
    return this.reels.map((r) => r.resolvedSymbol());
  }

  /** 確定した中段ライン(全停止後に使う) */
  centerLineFixed() {
    return this.reels.map((r) => r.centerSymbol());
  }

  /**
   * 指定リールの停止を要求する。
   * @returns {{index:number, slip:number, symbol:string}|null} 受理されなければ null
   */
  requestStop(index) {
    const reel = this.reels[index];
    if (!reel || !reel.canStop || reel.state === REEL_STATE.STOPPING) return null;

    const target = this.targets[index] ?? null;
    const forbidden = this._forbiddenChecker(index);

    const { pos, slip } = decideStopPosition(reel.strip, reel.position, target, forbidden);
    reel.beginStop(pos, slip);
    this.stopOrder.push(index);
    const symbol = reel.strip[((pos % reel.len) + reel.len) % reel.len];
    return { index, slip, symbol };
  }

  /**
   * 自由停止時に中段へ来てはいけない絵柄の判定を作る。
   * ハズレ(LOSE)のときだけ「入賞形を作らない」制約が要る。
   * ボーナス入賞待ちのように目標が差し替わっている場合は、
   * 揃えるのが目的なので回避しない(avoidWin=false)。
   */
  _forbiddenChecker(index) {
    if (!this.avoidWin) return () => false;

    const line = this.centerLine();
    const remaining = line.filter((s, i) => s === null && i !== index).length;

    return (sym) => {
      // 左リール中段の CHERRY / LAMBDA は単独で役になってしまう
      if (index === 0 && (sym === 'CHERRY' || sym === 'LAMBDA')) return true;
      if (remaining > 0) return false;
      // 最後の1リール: 3つ揃いを成立させない
      const test = line.slice();
      test[index] = sym;
      return categorizeLine(test) !== 'LOSE';
    };
  }

  update(dtMs) {
    const justStopped = [];
    this.reels.forEach((r) => {
      if (r.update(dtMs)) justStopped.push(r.index);
    });
    return justStopped;
  }
}
