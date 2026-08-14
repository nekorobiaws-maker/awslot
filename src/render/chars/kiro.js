/**
 * キャラ描画: 相棒サメ(旧「Kiro(白い幽霊)」枠)。DESIGN.md 6.8
 *
 * ■ 2026-08-14 お化けキャラの全廃(ユーザー指示)
 *   権利上の理由で幽霊キャラは画面に一切出さないことになった。
 *   ただし呼び出し側(シナリオ 100箇所以上・カットイン・液晶キャラ層)は
 *   char:'kiro' / pose:'happy' のような指定で書かれているため、
 *   **API はそのまま残し、中身をサメ(george.js)の別ポーズ描画へ委譲**する。
 *   幽霊のパス描画はこのファイルから完全に削除済み(もう一切描かれない)。
 *
 * ■ ジョージとの描き分け
 *   同じ画面に2体出ることがあるので、こちら側は
 *   「小物付き(サングラス/サムズアップ/浮き輪…)のポーズ」を割り当て、
 *   既定の向きも左向き(dir=-1)にして、左のジョージと向かい合うようにしている。
 */

import { drawShark } from './george.js';

/**
 * ポーズ定義。**キーは既存シナリオが参照しているので消さないこと**。
 *   shark … 実際に描くサメのポーズ(render/chars/george.js の SHARK_POSES)
 *   aura  … 追加のオーラ表現
 */
export const KIRO_POSES = {
  normal:    { shark: 'cool',     aura: null },
  surprised: { shark: 'panic',    aura: null },
  happy:     { shark: 'thumbsUp', aura: null },
  panic:     { shark: 'dash',     aura: null },
  premium:   { shark: 'party',    aura: 'rainbow' },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose='normal']
 * @param {number} [state.t=0] 経過秒
 * @param {number} [state.alpha=1]
 * @param {number} [state.dir=-1] 1=右向き -1=左向き(既定は左)
 */
export function drawKiro(ctx, state) {
  const { x, y, scale = 1, pose = 'normal', t = 0, alpha = 1, dir = -1 } = state;
  if (alpha <= 0) return;
  const p = KIRO_POSES[pose] ?? KIRO_POSES.normal;

  if (p.aura === 'rainbow') {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawAura(ctx, t);
    ctx.restore();
  }

  drawShark(ctx, { ...state, pose: p.shark, dir, alpha, scale, t });
}

/** プレミア用の虹色オーラ(旧幽霊のプレミア表現を引き継いだもの) */
function drawAura(ctx, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 92 + Math.sin(t * 4) * 8;
  const g = ctx.createRadialGradient(0, 0, 12, 0, 0, r);
  const hue = (t * 120) % 360;
  g.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.42)`);
  g.addColorStop(0.6, `hsla(${(hue + 120) % 360}, 100%, 60%, 0.24)`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * ミニサメ(リール脇のちょい出し予告用)。IDEAS.md 2-14
 * 旧「ミニ幽霊」。ひょっこり覗きポーズで小さく出す。
 */
export function drawMiniKiro(ctx, { x, y, scale = 1, t = 0, alpha = 1, dir = 1 }) {
  if (alpha <= 0) return;
  drawShark(ctx, { x, y, scale: scale * 0.42, t, alpha, dir, pose: 'peek' });
}
