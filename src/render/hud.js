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

/**
 * 桁数の扱い(2026-08-14 しおん指摘 S1)。
 *
 * 以前は全ブロック3桁固定で `Math.min(value, 999)` していたため、
 * 1281枚のクレジットが 999 と表示されていた。
 * スコアアタックは RANK S = 1000枚以上が基準なので、
 * **勝ったセッションほど表示が嘘になる**という致命的な見せ方だった。
 *
 * いまは「最低3桁・値が伸びたら自動で桁を増やす(最大5桁)」に変更し、
 * 増えた桁は横スケールでブロック幅へ収める(7セグの見た目は維持)。
 */
const MIN_DIGITS = 3;
const MAX_DIGITS = 5;
/** 桁あふれ(99999超)を示す表示。ここまで来ることは通常ないが、嘘をつかないための保険 */
const OVERFLOW_MAX = 10 ** MAX_DIGITS - 1;

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
      /**
       * 残り回転数のカウントダウン(100→0)。
       * ラベルの主語 GAME はユーザー指示(2026-08-13)なので変えず、
       * 「消化数ではなく残り」であることが読めるよう副題だけ添える
       * (2026-08-14 しおん指摘 S9「今何ゲーム目かと誤読する」)。
       * 下部デバッグ表示(main.js)も同じ「残り」で用語を揃えてある。
       */
      { label: 'GAME 残り', value: values.count },
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

      // 数字はブロック幅に収まる範囲で桁を伸ばす(4桁以上は自動で少し縮む)
      this._drawNumber(ctx, b.value, cx, 22, bw - 16);

      if (i > 0) {
        ctx.fillStyle = 'rgba(180,150,255,0.2)';
        ctx.fillRect(bw * i, 6, 1, this.h - 12);
      }
    });
  }

  /**
   * 7セグの数値をブロック中央へ描く。
   * @param {number} cx ブロックの中心X
   * @param {number} maxW 使ってよい横幅(はみ出す場合は横スケールで詰める)
   */
  _drawNumber(ctx, value, cx, y, maxW) {
    const v = Math.max(0, Math.min(Math.floor(value ?? 0), OVERFLOW_MAX));
    const text = String(v).padStart(MIN_DIGITS, ' ');
    const digits = text.length;
    const naturalW = DIGIT_W * digits + DIGIT_GAP * (digits - 1);
    const scale = Math.min(1, maxW / naturalW);

    ctx.save();
    ctx.translate(cx - (naturalW * scale) / 2, y);
    ctx.scale(scale, scale);
    for (let i = 0; i < digits; i++) {
      const ch = text[i];
      this._drawDigit(ctx, ch === ' ' ? null : Number(ch), i * (DIGIT_W + DIGIT_GAP), 0);
    }
    ctx.restore();
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
