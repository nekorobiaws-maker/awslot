/**
 * 全画面演出Canvas。DESIGN.md 5.3 (z=8) / 5.5
 *
 * 液晶(z=2)とリール(z=4)は物理的に別領域にあるため、
 * 筐体全体を覆う演出はこのレイヤーだけが担当する。
 *
 * 自前で持つのはフラッシュ・画面揺れ・役ラベルの3つ。
 * カットインとパーティクルは staging 側の実装を描画するだけに留める。
 */

const FONT = '"Helvetica Neue", "Hiragino Sans", "Noto Sans JP", sans-serif';

export class OverlayView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   * @param {import('../staging/anims/cutins.js').Cutins} [opts.cutins]
   * @param {import('../staging/anims/particles.js').Particles} [opts.particles]
   * @param {HTMLElement} [opts.shakeTarget] 画面揺れを適用するDOM(筐体ルート)
   */
  constructor({ ctx, w = 720, h = 1080, cutins = null, particles = null, shakeTarget = null }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
    this.cutins = cutins;
    this.particles = particles;
    this.shakeTarget = shakeTarget;

    this.flashColor = null;
    this.flashLeft = 0;
    this.flashDur = 1;

    this.flagLabel = null;
    this.flagRare = false;
    this.flagLeft = 0;

    this.shakeLeft = 0;
    this.shakeDur = 1;
    this.shakePower = 0;
    this._shakeApplied = false;
  }

  flash(color = '#ffffff', ms = 220) {
    this.flashColor = color;
    this.flashDur = Math.max(1, ms);
    this.flashLeft = this.flashDur;
  }

  /** 筐体を揺らす(CSS transform に上乗せせず、専用の変数で制御) */
  shake(power = 12, ms = 400) {
    this.shakePower = power;
    this.shakeDur = Math.max(1, ms);
    this.shakeLeft = this.shakeDur;
  }

  /** 成立役ラベルを一定時間表示する */
  showFlag(label, rare = false, ms = 1500) {
    this.flagLabel = label;
    this.flagRare = rare;
    this.flagLeft = ms;
  }

  update(dt) {
    if (this.flashLeft > 0) this.flashLeft = Math.max(0, this.flashLeft - dt);
    if (this.flagLeft > 0) this.flagLeft = Math.max(0, this.flagLeft - dt);

    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      this._applyShake();
    } else if (this._shakeApplied) {
      this._clearShake();
    }
  }

  _applyShake() {
    if (!this.shakeTarget) return;
    const p = this.shakeLeft / this.shakeDur;
    const amp = this.shakePower * p;
    const dx = (Math.random() * 2 - 1) * amp;
    const dy = (Math.random() * 2 - 1) * amp;
    this.shakeTarget.style.setProperty('--shake-x', `${dx.toFixed(2)}px`);
    this.shakeTarget.style.setProperty('--shake-y', `${dy.toFixed(2)}px`);
    this._shakeApplied = true;
  }

  _clearShake() {
    this.shakeTarget?.style.setProperty('--shake-x', '0px');
    this.shakeTarget?.style.setProperty('--shake-y', '0px');
    this._shakeApplied = false;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // カットイン → パーティクル → フラッシュ → 役ラベル の順に重ねる
    this.cutins?.draw(ctx, this.w, this.h);
    this.particles?.draw(ctx);

    if (this.flashLeft > 0 && this.flashColor) {
      ctx.save();
      ctx.globalAlpha = 0.55 * (this.flashLeft / this.flashDur);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }

    if (this.flagLeft > 0 && this.flagLabel) {
      const alpha = Math.min(1, this.flagLeft / 400);
      const x = this.w - 24;
      const y = 402;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `700 17px ${FONT}`;
      const text = this.flagLabel;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = this.flagRare ? 'rgba(190,20,60,0.85)' : 'rgba(20,16,40,0.75)';
      ctx.fillRect(x - tw - 16, y - 15, tw + 20, 30);
      ctx.fillStyle = this.flagRare ? '#ffe066' : '#cfd6ff';
      ctx.fillText(text, x - 6, y);
      ctx.restore();
    }
  }
}
