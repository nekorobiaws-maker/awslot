/**
 * HUD(7セグ表示)。DESIGN.md 5.2 / 5.3
 * CREDIT / GAME(残り回転数) / PAYOUT を実機風の7セグで描く。
 */

const SEG_MAP = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

const DIGIT_W = 18;
const DIGIT_H = 30;
const SEG_T = 4;      // セグメント太さ
const DIGIT_GAP = 5;

const ON_COLOR = '#ff3b30';
const ON_GLOW = 'rgba(255,80,60,0.55)';
const OFF_COLOR = 'rgba(120,20,16,0.35)';

/** セグメント1本の矩形 (x, y, w, h) を返す */
function segRect(seg) {
  const t = SEG_T;
  const w = DIGIT_W;
  const h = DIGIT_H;
  switch (seg) {
    case 'a': return [t * 0.6, 0, w - t * 1.2, t];
    case 'b': return [w - t, t * 0.6, t, h / 2 - t * 0.8];
    case 'c': return [w - t, h / 2 + t * 0.2, t, h / 2 - t * 0.8];
    case 'd': return [t * 0.6, h - t, w - t * 1.2, t];
    case 'e': return [0, h / 2 + t * 0.2, t, h / 2 - t * 0.8];
    case 'f': return [0, t * 0.6, t, h / 2 - t * 0.8];
    case 'g': return [t * 0.6, h / 2 - t / 2, w - t * 1.2, t];
    default: return [0, 0, 0, 0];
  }
}

export class HudView {
  /**
   * @param {object} opts
   * @param {CanvasRenderingContext2D} opts.ctx
   */
  constructor({ ctx, w = 360, h = 60 }) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
  }

  /**
   * @param {{credit:number, count:number, payout:number}} values
   */
  draw(values) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // パネル地
    ctx.fillStyle = '#0a0710';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.strokeStyle = 'rgba(180,150,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.w - 2, this.h - 2);

    const blocks = [
      { label: 'CREDIT', value: values.credit },
      // 残り回転数のカウントダウン(100→0)。ラベルは GAME(2026-08-13 ユーザー指示)
      { label: 'GAME', value: values.count },
      { label: 'PAYOUT', value: values.payout },
    ];
    const bw = this.w / blocks.length;

    blocks.forEach((b, i) => {
      const cx = bw * i + bw / 2;
      ctx.fillStyle = '#8f7fd8';
      ctx.font = '600 10px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, cx, 12);

      const digitsW = DIGIT_W * 3 + DIGIT_GAP * 2;
      this._drawNumber(ctx, b.value, cx - digitsW / 2, 22, 3);

      if (i > 0) {
        ctx.fillStyle = 'rgba(180,150,255,0.2)';
        ctx.fillRect(bw * i, 6, 1, this.h - 12);
      }
    });
  }

  _drawNumber(ctx, value, x, y, digits) {
    const v = Math.max(0, Math.min(Math.floor(value), 10 ** digits - 1));
    const text = String(v).padStart(digits, ' ');
    for (let i = 0; i < digits; i++) {
      const ch = text[i];
      this._drawDigit(ctx, ch === ' ' ? null : Number(ch), x + i * (DIGIT_W + DIGIT_GAP), y);
    }
  }

  _drawDigit(ctx, digit, x, y) {
    const on = digit === null ? '' : SEG_MAP[digit] ?? '';
    ctx.save();
    ctx.translate(x, y);
    for (const seg of 'abcdefg') {
      const [rx, ry, rw, rh] = segRect(seg);
      const lit = on.includes(seg);
      if (lit) {
        ctx.shadowColor = ON_GLOW;
        ctx.shadowBlur = 6;
        ctx.fillStyle = ON_COLOR;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = OFF_COLOR;
      }
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();
  }
}
