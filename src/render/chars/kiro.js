/**
 * キャラ描画: Kiro(白い幽霊)。DESIGN.md 6.8
 *
 * 外部画像を使わず Canvas 2D のパス描画で構成し、
 * 表情・傾き・裾の波打ちをパラメータで連続的に変化させる。
 */

/** ポーズ定義。表情はパラメータの差し替えだけで表現する */
export const KIRO_POSES = {
  normal:    { eyeH: 12, eyeW: 8,  mouth: 'none',  tilt: 0,     blush: false },
  surprised: { eyeH: 18, eyeW: 14, mouth: 'o',     tilt: -0.1,  blush: false },
  happy:     { eyeH: 4,  eyeW: 12, mouth: 'smile', tilt: 0.05,  blush: true },
  panic:     { eyeH: 20, eyeW: 6,  mouth: 'wavy',  tilt: 0.2,   blush: false },
  premium:   { eyeH: 12, eyeW: 8,  mouth: 'smile', tilt: 0,     blush: true, aura: 'rainbow' },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose='normal']
 * @param {number} [state.t=0] 経過秒(浮遊アニメ用)
 * @param {number} [state.alpha=1]
 */
export function drawKiro(ctx, state) {
  const { x, y, scale = 1, pose = 'normal', t = 0, alpha = 1 } = state;
  const p = KIRO_POSES[pose] ?? KIRO_POSES.normal;
  if (alpha <= 0) return;

  // 裾の波打ちを sin 波でプロシージャル生成
  const wave = (i) => Math.sin(t * 3 + i * 1.2) * 4;

  ctx.save();
  ctx.globalAlpha = alpha;
  // ふわふわ浮遊
  ctx.translate(x, y + Math.sin(t * 1.5) * 6);
  ctx.scale(scale, scale);
  ctx.rotate(p.tilt);

  if (p.aura === 'rainbow') drawAura(ctx, t);

  // 体(ドーム + 波打つ裾)
  ctx.beginPath();
  ctx.arc(0, 0, 40, Math.PI, 0);
  ctx.lineTo(40, 40);
  for (let i = 0; i <= 6; i++) {
    const x0 = 40 - i * 13.3;
    const x1 = 40 - (i + 1) * 13.3;
    ctx.quadraticCurveTo(x0 - 6.65, 48 + wave(i), x1, 40 + wave(i + 1));
  }
  ctx.closePath();

  const body = ctx.createLinearGradient(0, -40, 0, 50);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(1, '#dfe4f5');
  ctx.fillStyle = body;
  ctx.shadowColor = 'rgba(180, 200, 255, 0.85)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  /*
   * 輪郭線(2026-08-13)。assets/ui/bottom_panel.png の幽霊は暗色の縁取りがあり、
   * ジョージ側をセル塗りへ寄せた結果こちらだけ線が無いのが浮いていたので合わせた。
   * サメより細い線にして「ふわっとした幽霊」の質感は保つ。
   */
  ctx.strokeStyle = 'rgba(42,16,64,0.85)';
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  ctx.stroke();

  drawFace(ctx, p, t);
  ctx.restore();
}

function drawFace(ctx, p, t) {
  // 目
  ctx.fillStyle = '#2a1040';
  for (const ex of [-15, 15]) {
    ctx.beginPath();
    ctx.ellipse(ex, -6, p.eyeW / 2, p.eyeH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const ex of [-17, 13]) {
    ctx.beginPath();
    ctx.arc(ex, -9, Math.max(1.2, p.eyeW / 6), 0, Math.PI * 2);
    ctx.fill();
  }

  // ほっぺ
  if (p.blush) {
    ctx.fillStyle = 'rgba(255, 140, 170, 0.45)';
    for (const bx of [-26, 26]) {
      ctx.beginPath();
      ctx.ellipse(bx, 6, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 口
  ctx.strokeStyle = '#2a1040';
  ctx.fillStyle = '#2a1040';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  switch (p.mouth) {
    case 'o':
      ctx.beginPath();
      ctx.ellipse(0, 14, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'smile':
      ctx.beginPath();
      ctx.arc(0, 8, 10, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    case 'wavy': {
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const wx = -10 + i * (20 / 12);
        const wy = 14 + Math.sin(i * 1.4 + t * 10) * 2.4;
        if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** プレミア用の虹色オーラ */
function drawAura(ctx, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 62 + Math.sin(t * 4) * 5;
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r);
  const hue = (t * 120) % 360;
  g.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.5)`);
  g.addColorStop(0.6, `hsla(${(hue + 120) % 360}, 100%, 60%, 0.28)`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** ミニ幽霊(リール脇のちょい出し予告用)。IDEAS.md 2-14 */
export function drawMiniKiro(ctx, { x, y, scale = 1, t = 0, alpha = 1 }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + Math.sin(t * 4) * 4);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.arc(0, 0, 12, Math.PI, 0);
  ctx.lineTo(12, 12);
  for (let i = 0; i < 3; i++) {
    const x0 = 12 - i * 8;
    ctx.quadraticCurveTo(x0 - 4, 17 + Math.sin(t * 6 + i) * 2, x0 - 8, 12);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(190, 210, 255, 0.9)';
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#2a1040';
  ctx.beginPath();
  ctx.arc(-4.5, -2, 2.2, 0, Math.PI * 2);
  ctx.arc(4.5, -2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
