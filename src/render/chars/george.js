/**
 * キャラ描画: ジョージ・ジョーズ・ユージー(サメ)。DESIGN.md 6.8
 *
 * ユーザー確定カラー: 体はオレンジ、腹はクリーム色。
 * 「口を開けて噛みつく」モーションが上乗せ演出の核になるため、
 * mouthOpen(0.0〜1.0) と tailAngle を必ずパラメータで持つ。
 */

export const GEORGE_COLORS = {
  body: '#f2822a',
  bodyDark: '#c25c11',
  bodyLight: '#ffab5c',
  belly: '#ffeecf',
  fin: '#e0701c',
  eye: '#1a0d05',
  tooth: '#fffdf5',
  gum: '#a8302a',
};

export const GEORGE_POSES = {
  normal:  { mouthOpen: 0.12, tailAngle: 0.0,  brow: 0.0 },
  grin:    { mouthOpen: 0.35, tailAngle: 0.15, brow: -0.15 },
  bite:    { mouthOpen: 1.0,  tailAngle: 0.35, brow: -0.3 },
  angry:   { mouthOpen: 0.55, tailAngle: 0.25, brow: -0.45 },
  chill:   { mouthOpen: 0.05, tailAngle: -0.1, brow: 0.1 },
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {number} [state.mouthOpen=0] 0=閉じ 1=全開
 * @param {number} [state.tailAngle=0] 尾びれの角度(rad)
 * @param {number} [state.brow=0] 目つき(負で怒り顔)
 * @param {number} [state.t=0] 経過秒(遊泳アニメ用)
 * @param {number} [state.dir=1] 1=右向き -1=左向き
 * @param {number} [state.alpha=1]
 */
export function drawGeorge(ctx, state) {
  const {
    x, y, scale = 1, t = 0, dir = 1, alpha = 1,
    mouthOpen = 0, tailAngle = 0, brow = 0,
  } = state;
  if (alpha <= 0) return;

  const C = GEORGE_COLORS;
  const swim = Math.sin(t * 2.2) * 4;          // 上下の遊泳
  const bodyWave = Math.sin(t * 3.4) * 0.06;   // 体のうねり

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y + swim);
  ctx.scale(scale * dir, scale);
  ctx.rotate(bodyWave);

  drawTail(ctx, C, tailAngle + Math.sin(t * 3.4) * 0.12);
  drawPectoralFin(ctx, C, t);
  drawBody(ctx, C);
  drawDorsalFin(ctx, C);
  drawMouth(ctx, C, Math.max(0, Math.min(1, mouthOpen)));
  drawEye(ctx, C, brow);
  drawGills(ctx, C);

  ctx.restore();
}

/** 体(オレンジ)+ 腹(クリーム) */
function drawBody(ctx, C) {
  const g = ctx.createLinearGradient(0, -32, 0, 34);
  g.addColorStop(0, C.bodyLight);
  g.addColorStop(0.45, C.body);
  g.addColorStop(1, C.bodyDark);

  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.quadraticCurveTo(-40, -30, 6, -28);   // 背中
  ctx.quadraticCurveTo(44, -26, 62, -4);    // 鼻先へ
  ctx.quadraticCurveTo(48, 26, 4, 30);      // 腹側
  ctx.quadraticCurveTo(-38, 30, -58, 0);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // 腹のクリーム色
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-52, 12);
  ctx.quadraticCurveTo(-10, 34, 52, 6);
  ctx.lineTo(58, 34);
  ctx.lineTo(-58, 34);
  ctx.closePath();
  ctx.fillStyle = C.belly;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(120, 55, 8, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-58, 0);
  ctx.quadraticCurveTo(-40, -30, 6, -28);
  ctx.quadraticCurveTo(44, -26, 62, -4);
  ctx.stroke();
}

/** 背びれ */
function drawDorsalFin(ctx, C) {
  ctx.beginPath();
  ctx.moveTo(-6, -26);
  ctx.quadraticCurveTo(2, -54, 22, -50);
  ctx.quadraticCurveTo(14, -34, 16, -24);
  ctx.closePath();
  ctx.fillStyle = C.fin;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 55, 8, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 胸びれ */
function drawPectoralFin(ctx, C, t) {
  ctx.save();
  ctx.translate(14, 20);
  ctx.rotate(Math.sin(t * 3) * 0.14 + 0.25);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-8, 20, -26, 24);
  ctx.quadraticCurveTo(-14, 8, -4, 2);
  ctx.closePath();
  ctx.fillStyle = C.fin;
  ctx.fill();
  ctx.restore();
}

/** 尾びれ(角度パラメータで振れる) */
function drawTail(ctx, C, angle) {
  ctx.save();
  ctx.translate(-56, 0);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-30, -30);
  ctx.quadraticCurveTo(-18, 0, -30, 26);
  ctx.closePath();
  ctx.fillStyle = C.fin;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 55, 8, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** 口(mouthOpen 0〜1 で開く。歯列つき) */
function drawMouth(ctx, C, open) {
  const jaw = 26 * open;       // 下顎の下がり
  const hinge = { x: 14, y: 6 };
  const tip = { x: 60, y: -2 };

  // 口内
  ctx.beginPath();
  ctx.moveTo(hinge.x, hinge.y);
  ctx.quadraticCurveTo((hinge.x + tip.x) / 2, hinge.y - 6, tip.x, tip.y);
  ctx.quadraticCurveTo((hinge.x + tip.x) / 2, tip.y + 14 + jaw, hinge.x, hinge.y + jaw * 0.5);
  ctx.closePath();
  ctx.fillStyle = open > 0.08 ? C.gum : 'rgba(120,50,10,0.5)';
  ctx.fill();

  if (open <= 0.08) {
    ctx.strokeStyle = 'rgba(90, 40, 6, 0.8)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.quadraticCurveTo((hinge.x + tip.x) / 2, hinge.y + 4, tip.x, tip.y);
    ctx.stroke();
    return;
  }

  // 上の歯
  ctx.fillStyle = C.tooth;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const tx = hinge.x + (tip.x - hinge.x) * p;
    const ty = hinge.y - 5 + (tip.y - hinge.y + 4) * p;
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty);
    ctx.lineTo(tx + 4, ty);
    ctx.lineTo(tx, ty + 9);
    ctx.closePath();
    ctx.fill();
  }
  // 下の歯
  for (let i = 0; i < n - 1; i++) {
    const p = (i + 0.5) / (n - 1);
    const tx = hinge.x + (tip.x - hinge.x) * p;
    const ty = hinge.y + jaw * (0.5 + 0.5 * Math.sin(p * Math.PI)) + 6;
    ctx.beginPath();
    ctx.moveTo(tx - 4, ty);
    ctx.lineTo(tx + 4, ty);
    ctx.lineTo(tx, ty - 9);
    ctx.closePath();
    ctx.fill();
  }
}

/** 目(brow が負だと怒り顔) */
function drawEye(ctx, C, brow) {
  const ex = 36;
  const ey = -12;
  ctx.beginPath();
  ctx.arc(ex, ey, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex + 1.5, ey, 4, 0, Math.PI * 2);
  ctx.fillStyle = C.eye;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex - 0.5, ey - 2, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  // まぶた / 眉
  if (brow !== 0) {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(brow);
    ctx.fillStyle = C.bodyDark;
    ctx.fillRect(-9, -11, 18, brow < 0 ? 7 : 4);
    ctx.restore();
  }
}

/** エラ */
function drawGills(ctx, C) {
  ctx.strokeStyle = 'rgba(120, 55, 8, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const gx = 4 - i * 8;
    ctx.beginPath();
    ctx.moveTo(gx, -16);
    ctx.quadraticCurveTo(gx - 3, -4, gx, 8);
    ctx.stroke();
  }
}

/** 尾びれチラ見せ予告用(画面下からヒレだけ)。IDEAS.md 2-15 */
export function drawGeorgeFin(ctx, { x, y, scale = 1, t = 0, alpha = 1 }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + Math.sin(t * 1.6) * 14, y);
  ctx.scale(scale, scale);
  ctx.rotate(Math.sin(t * 3) * 0.1);
  ctx.beginPath();
  ctx.moveTo(-18, 30);
  ctx.quadraticCurveTo(-4, 6, 4, -34);
  ctx.quadraticCurveTo(10, 4, 22, 30);
  ctx.closePath();
  ctx.fillStyle = GEORGE_COLORS.fin;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 55, 8, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
