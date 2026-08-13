/**
 * リールCanvas描画。DESIGN.md 5.3 / 6.4
 *
 * 位置の考え方:
 *   base = floor(position), frac = position - base とし、
 *   j = -2..2 のコマを idx = base - j、y = 60*(j+1) + frac*60 に描く。
 *   これで position が増えるほど絵柄が下へ流れ、中段(y=60)には strip[base] が来る。
 *
 * モーションブラーは速度に応じて ±offset の3枚重ね描き。
 */

import { SYMBOL_W, SYMBOL_H } from '../data/symbols.js';
import { SPIN_SPEED } from '../game/reelctrl.js';
import { uiAssets } from '../engine/assets.js';

const REEL_COUNT = 3;
const VIEW_ROWS = 3;
const BLUR_MAX_OFFSET = 20;

/* ── UI画像の切り出し位置 ──────────────────────
 * 生成画像には余白や別パーツが写り込んでいるので、
 * 使う部分だけを src 矩形で切り出して合成する。 */

/** reel_band.png のうちドラム円筒面だけ */
const BAND_SRC = { x: 322, y: 37, w: 389, h: 475 };
/** reel_separator.png のうち全高の縦バーだけ */
const SEP_SRC = { x: 498, y: 0, w: 24, h: 512 };
/** payline.png のうち横ラインの帯だけ(左端の矢印マーカーを含む) */
const PAYLINE_SRC = { x: 53, y: 240, w: 715, h: 40 };
/** reel_frame.png の枠の太さ(右辺は元絵に無いので左辺のミラーで作る) */
const FRAME_SRC = { left: 96, top: 102, bottom: 49, w: 768, h: 512 };
/** リール窓に描くときの枠の太さ(論理px) */
const FRAME_BORDER = { x: 16, y: 12 };
/** 入賞ラインの描画高さ(論理px) */
const PAYLINE_H = 22;
/** リール間セパレータの幅(論理px)。cabinet2 は絵の柱(実測21px相当)に合わせて太くする */
const SEP_W = 14;
const SEP_W_CAB2 = 21;

export class ReelView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx      reels レイヤー
   * @param {CanvasRenderingContext2D} opts.fxCtx    reelfx レイヤー
   * @param {import('./symbols-draw.js').SymbolCache} opts.symbols
   * @param {import('../game/reelctrl.js').ReelController} opts.reels
   */
  constructor({ ctx, fxCtx, symbols, reels }) {
    this.ctx = ctx;
    this.fxCtx = fxCtx;
    this.symbols = symbols;
    this.reels = reels;
    this.w = SYMBOL_W * REEL_COUNT;
    this.h = SYMBOL_H * VIEW_ROWS;
    // 写真素材の縮小は既定の 'low' だとジャギるので明示的に上げる
    for (const c of [ctx, fxCtx]) {
      if (!c) continue;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }
    /** @type {HTMLCanvasElement|null} ドラム地の作り置き(毎フレームの大縮小を避ける) */
    this._drumTile = null;
    this._drumDpr = 0;
    /** 入賞ライン発光の残り時間(ms) */
    this.winFlash = 0;
    this.winRare = false;
    /** リールごとの停止フラッシュ残り時間(ms) */
    this.stopFlash = [0, 0, 0];
  }

  /** 入賞時に呼ぶ */
  onJudge(result) {
    if (!result || result.win === 'LOSE') return;
    this.winFlash = 900;
    this.winRare = ['GHOST', 'SHARK', 'MELON', 'CHANCE', 'WEAK_CHERRY', 'STRONG_CHERRY'].includes(result.win);
  }

  /** リール停止時に呼ぶ */
  onReelStop(index) {
    this.stopFlash[index] = 180;
  }

  /** 演出システム(reelfx.highlight)から呼ばれるリール窓の発光 */
  highlight(ms = 600, color = null) {
    this.winFlash = Math.max(this.winFlash, ms);
    if (color) this.winRare = true;
  }

  onLever() {
    this.winFlash = 0;
    this.winRare = false;
  }

  update(dt) {
    if (this.winFlash > 0) this.winFlash = Math.max(0, this.winFlash - dt);
    for (let i = 0; i < REEL_COUNT; i++) {
      if (this.stopFlash[i] > 0) this.stopFlash[i] = Math.max(0, this.stopFlash[i] - dt);
    }
  }

  /** cabinet2.png を使っているか(枠やセパレータの見せ方を絵に合わせる) */
  get _isCab2() {
    return uiAssets.has('cabinet2');
  }

  /**
   * ドラム地(reel_band.png の円筒面)を1コマ幅で作り置きする。
   * 389×475 → 120×180 の縮小を毎フレーム3回やると重いうえ、
   * 既定の補間品質だと縞が出るため、DPR実ピクセルで一度だけ焼く。
   */
  _getDrumTile(bandImg) {
    const dpr = Math.max(1, this.ctx.getTransform?.().a || 1);
    if (this._drumTile && Math.abs(dpr - this._drumDpr) < 0.001) return this._drumTile;
    const c = document.createElement('canvas');
    c.width = Math.round(SYMBOL_W * dpr);
    c.height = Math.round(this.h * dpr);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(bandImg, BAND_SRC.x, BAND_SRC.y, BAND_SRC.w, BAND_SRC.h,
      0, 0, c.width, c.height);
    this._drumTile = c;
    this._drumDpr = dpr;
    return c;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const bandImg = uiAssets.get('reel_band');
    const sepW = this._isCab2 ? SEP_W_CAB2 : SEP_W;

    for (let i = 0; i < REEL_COUNT; i++) {
      const reel = this.reels.reels[i];
      const x = i * SYMBOL_W;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, SYMBOL_W, this.h);
      ctx.clip();

      // ドラム地。reel_band.png があれば円筒面の画像、無ければグラデーション
      if (bandImg) {
        ctx.drawImage(this._getDrumTile(bandImg), x, 0, SYMBOL_W, this.h);
      } else {
        const bg = ctx.createLinearGradient(x, 0, x, this.h);
        bg.addColorStop(0, '#151021');
        bg.addColorStop(0.5, '#241a38');
        bg.addColorStop(1, '#151021');
        ctx.fillStyle = bg;
        ctx.fillRect(x, 0, SYMBOL_W, this.h);
      }

      this._drawStrip(ctx, reel, x);
      this._drawDrumShade(ctx, x);

      // 停止フラッシュ
      if (this.stopFlash[i] > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.22 * (this.stopFlash[i] / 180)})`;
        ctx.fillRect(x, 0, SYMBOL_W, this.h);
      }
      ctx.restore();

      // リール境界。セパレータ画像は使用廃止(2026-08-13 ユーザー指示)。
      // cabinet2 は絵の柱幅ぶんを無地の暗部で仕切り、3窓の見た目だけ保つ
      if (i > 0) {
        const w2 = this._isCab2 ? sepW : 2;
        ctx.fillStyle = this._isCab2 ? 'rgba(8,6,14,0.92)' : 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - w2 / 2, 0, w2, this.h);
      }
    }

    this._drawPayline(ctx);
    this._drawFrame(ctx);
    this._drawFx();
  }

  /** 中段の入賞ライン(常設)。画像が無ければ描かない(従来どおり入賞時のみ発光) */
  _drawPayline(ctx, alpha = 0.75) {
    const img = uiAssets.get('payline');
    if (!img) return;
    const y = SYMBOL_H + SYMBOL_H / 2 - PAYLINE_H / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, PAYLINE_SRC.x, PAYLINE_SRC.y, PAYLINE_SRC.w, PAYLINE_SRC.h,
      0, y, this.w, PAYLINE_H);
    ctx.restore();
  }

  /**
   * リール窓の金フチ枠。
   * reel_frame.png には右辺が入っていない(元絵で切れている)ので、
   * 左辺・左上角・左下角を水平反転して右側を作る9スライス合成にしている。
   *
   * cabinet2.png は窓のフレーム(紫の7セグ風)が筐体の絵に描かれていて、
   * リールCanvasがその開口部にぴったり収まる。金フチを重ねると枠が二重に
   * なるので描かない。
   */
  _drawFrame(ctx) {
    if (this._isCab2) return;
    const img = uiAssets.get('reel_frame');
    if (!img) return;
    const { left: SL, top: ST, bottom: SB, w: SW, h: SH } = FRAME_SRC;
    const bx = FRAME_BORDER.x;
    const by = FRAME_BORDER.y;
    const W = this.w;
    const H = this.h;
    const midW = W - bx * 2;
    const midH = H - by * 2;
    const srcMidW = SW - SL;      // 右辺が無いので中央帯は右端まで
    const srcMidH = SH - ST - SB;

    // 上辺・下辺
    ctx.drawImage(img, SL, 0, srcMidW, ST, bx, 0, midW, by);
    ctx.drawImage(img, SL, SH - SB, srcMidW, SB, bx, H - by, midW, by);
    // 左辺・左角
    ctx.drawImage(img, 0, ST, SL, srcMidH, 0, by, bx, midH);
    ctx.drawImage(img, 0, 0, SL, ST, 0, 0, bx, by);
    ctx.drawImage(img, 0, SH - SB, SL, SB, 0, H - by, bx, by);
    // 右辺・右角(左辺のミラー)
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, ST, SL, srcMidH, 0, by, bx, midH);
    ctx.drawImage(img, 0, 0, SL, ST, 0, 0, bx, by);
    ctx.drawImage(img, 0, SH - SB, SL, SB, 0, H - by, bx, by);
    ctx.restore();
  }

  _drawStrip(ctx, reel, x) {
    const len = reel.len;
    const base = Math.floor(reel.position);
    const frac = reel.position - base;
    const speedRatio = Math.min(1, reel.speed / SPIN_SPEED);
    const blurring = speedRatio > 0.12;
    const offset = BLUR_MAX_OFFSET * speedRatio;

    for (let j = -2; j <= 2; j++) {
      const idx = (((base - j) % len) + len) % len;
      const tile = this.symbols.get(reel.strip[idx]);
      if (!tile) continue;
      const y = SYMBOL_H * (j + 1) + frac * SYMBOL_H;

      if (blurring) {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(tile, x, y - offset, SYMBOL_W, SYMBOL_H);
        ctx.drawImage(tile, x, y + offset, SYMBOL_W, SYMBOL_H);
        ctx.globalAlpha = 1 - speedRatio * 0.3;
        ctx.drawImage(tile, x, y, SYMBOL_W, SYMBOL_H);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(tile, x, y, SYMBOL_W, SYMBOL_H);
      }
    }
  }

  /** ドラムの丸み(上下の陰) */
  _drawDrumShade(ctx, x) {
    const shade = ctx.createLinearGradient(x, 0, x, this.h);
    shade.addColorStop(0, 'rgba(0,0,0,0.55)');
    shade.addColorStop(0.18, 'rgba(0,0,0,0.05)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    shade.addColorStop(0.82, 'rgba(0,0,0,0.05)');
    shade.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, SYMBOL_W, this.h);
  }

  /** reelfx レイヤー: 入賞ライン発光 */
  _drawFx() {
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.winFlash <= 0) return;

    const t = this.winFlash / 900;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(this.winFlash / 90));
    const color = this.winRare ? '255,90,90' : '255,214,102';
    const y = SYMBOL_H + SYMBOL_H / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(0, y - 34, 0, y + 34);
    grad.addColorStop(0, `rgba(${color},0)`);
    grad.addColorStop(0.5, `rgba(${color},${0.5 * t * pulse})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 34, this.w, 68);

    const payImg = uiAssets.get('payline');
    if (payImg) {
      // 常設ラインの画像をそのまま加算合成して光らせる
      ctx.globalAlpha = 0.85 * t * pulse;
      ctx.drawImage(payImg, PAYLINE_SRC.x, PAYLINE_SRC.y, PAYLINE_SRC.w, PAYLINE_SRC.h,
        0, y - PAYLINE_H / 2, this.w, PAYLINE_H);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = `rgba(${color},${0.9 * t * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
