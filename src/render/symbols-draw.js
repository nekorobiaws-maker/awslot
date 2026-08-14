/**
 * 絵柄のオフスクリーン事前準備。DESIGN.md 6.4 / 注意事項11
 *
 * assets/symbols/*.png があればそれを 120×60 のタイルにリサイズしてキャッシュし、
 * 無い絵柄は「プロシージャル描画のプレースホルダ」を生成する。
 * 毎フレームは drawImage だけで完結させる。
 *
 * プレースホルダの方針:
 *   伝統的なスロット絵柄に見えて、AWSの文字が乗っている。
 *   絵柄の機能(REPLAY / CHANCE / ブランク)が文字から読めるようにする。
 *
 * 画質の要点(「絵柄がドット絵に見える」対策):
 *   1. キャッシュは論理サイズ×DPR の実ピクセルで持つ(120×60 → DPR2 なら 240×120)
 *   2. オフスクリーンの ctx にも imageSmoothingQuality='high' を必ず指定する
 *      (既定の 'low' はバイリニア1回きりで、3倍以上の縮小だと間引きになりジャギる)
 *   3. 418px の原画を一発で 60px まで落とさず、1/2 ずつ段階的に縮める
 *   4. DPR が変わったら(別解像度のディスプレイへ移動など)キャッシュを作り直す
 */

import { SYMBOLS, SYMBOL_IDS, SYMBOL_W, SYMBOL_H } from '../data/symbols.js';

const FONT_STACK = '"Arial Black", "Helvetica Neue", "Hiragino Sans", sans-serif';

/** 角丸矩形パス */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 指定幅に収まるフォントサイズを求めて設定する */
function fitFont(ctx, text, maxW, baseSize, weight = '900') {
  let size = baseSize;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxW || size <= 8) break;
    size -= 1;
  }
  return size;
}

/** 縁取り付きテキスト */
function outlinedText(ctx, text, x, y, fill, stroke, lineWidth = 3) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// ── 個別の絵柄描画 ─────────────────────────────

/** 赤いチェリー(伝統的スロット絵柄) */
function drawCherry(ctx, def, w, h) {
  const cx = 36;
  const cy = h / 2;
  // 茎
  ctx.strokeStyle = '#5b3a1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - 20);
  ctx.quadraticCurveTo(cx - 4, cy - 10, cx - 10, cy + 2);
  ctx.moveTo(cx + 4, cy - 20);
  ctx.quadraticCurveTo(cx + 10, cy - 8, cx + 8, cy + 4);
  ctx.stroke();
  // 葉
  ctx.fillStyle = def.accent2 ?? '#2e9e4f';
  ctx.beginPath();
  ctx.ellipse(cx + 13, cy - 19, 9, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 実
  circle(ctx, cx - 11, cy + 9, 9.5, def.accent);
  circle(ctx, cx + 8, cy + 11, 8.5, def.accent);
  circle(ctx, cx - 13.5, cy + 6, 3, 'rgba(255,255,255,0.65)');
  circle(ctx, cx + 5.5, cy + 8.5, 2.5, 'rgba(255,255,255,0.6)');
}

/** 金色のベル(伝統的スロット絵柄) */
function drawBell(ctx, def, w, h) {
  const cx = 36;
  const cy = h / 2 - 2;
  const grad = ctx.createLinearGradient(cx - 16, cy - 18, cx + 16, cy + 16);
  grad.addColorStop(0, def.accent2 ?? '#ffd75e');
  grad.addColorStop(1, def.accent);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy + 12);
  ctx.quadraticCurveTo(cx - 14, cy - 12, cx, cy - 17);
  ctx.quadraticCurveTo(cx + 14, cy - 12, cx + 15, cy + 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a5a00';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // 下の縁
  roundRect(ctx, cx - 18, cy + 11, 36, 6, 3);
  ctx.fillStyle = def.accent;
  ctx.fill();
  ctx.stroke();
  // 舌
  circle(ctx, cx, cy + 21, 4, def.accent);
  // 取っ手
  circle(ctx, cx, cy - 19, 3.2, def.accent);
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 4, 3, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/** スイカ(伝統的スロット絵柄) */
function drawMelon(ctx, def, w, h) {
  const cx = 34;
  const cy = h / 2;
  const r = 18;
  circle(ctx, cx, cy, r, def.accent);
  // 縞
  ctx.strokeStyle = def.accent2 ?? '#0b3d1b';
  ctx.lineWidth = 2.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 9, cy - r + 2);
    ctx.quadraticCurveTo(cx + i * 13, cy, cx + i * 9, cy + r - 2);
    ctx.stroke();
  }
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 8, 5, 3, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** 幽霊Kiro + 7(GHOST7.png が読めなかったときのフォールバック) */
function drawGhost7(ctx, def, w, h) {
  const gx = 26;
  const gy = h / 2;
  // 幽霊
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(gx, gy - 4, 14, Math.PI, 0);
  ctx.lineTo(gx + 14, gy + 10);
  for (let i = 0; i < 3; i++) {
    const x0 = gx + 14 - i * 9.33;
    ctx.quadraticCurveTo(x0 - 4.6, gy + 18, x0 - 9.33, gy + 10);
  }
  ctx.closePath();
  ctx.fill();
  // 目
  circle(ctx, gx - 5, gy - 5, 2.6, '#2a1040');
  circle(ctx, gx + 5, gy - 5, 2.6, '#2a1040');
  // 7
  const size = fitFont(ctx, '7', 58, 46);
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  outlinedText(ctx, '7', 82, h / 2, def.fg, '#2a0c4d', 4);
}

/** サメ + BAR(SHARKBAR.png が読めなかったときのフォールバック) */
function drawSharkBar(ctx, def, w, h) {
  const cx = 28;
  const cy = h / 2;
  // 背びれ
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy + 14);
  ctx.quadraticCurveTo(cx - 2, cy + 4, cx + 4, cy - 16);
  ctx.quadraticCurveTo(cx + 8, cy + 2, cx + 13, cy + 14);
  ctx.closePath();
  ctx.fill();
  // 波
  ctx.strokeStyle = 'rgba(160,220,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 17);
  ctx.quadraticCurveTo(cx - 8, cy + 13, cx, cy + 17);
  ctx.quadraticCurveTo(cx + 8, cy + 21, cx + 16, cy + 17);
  ctx.stroke();
  // BARプレート
  roundRect(ctx, 50, cy - 13, 62, 26, 5);
  ctx.fillStyle = '#f4f8ff';
  ctx.fill();
  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  const size = fitFont(ctx, 'BAR', 52, 20);
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  outlinedText(ctx, 'BAR', 81, cy, def.bg, null);
}

/** λ + CHANCE */
function drawLambda(ctx, def, w, h) {
  const size = fitFont(ctx, 'λ', 40, 42);
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  outlinedText(ctx, 'λ', 32, h / 2 - 1, def.fg, 'rgba(255,255,255,0.6)', 3);
  const s2 = fitFont(ctx, 'CHANCE', 62, 16);
  ctx.font = `900 ${s2}px ${FONT_STACK}`;
  outlinedText(ctx, 'CHANCE', 82, h / 2, def.fg, 'rgba(255,255,255,0.55)', 2.5);
}

/** REPLAY(DynamoDB の拡縮矢印を背景に) */
function drawReplay(ctx, def, w, h) {
  const cy = h / 2;
  // 背景の拡縮矢印
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(18, cy - 16);
  ctx.lineTo(102, cy - 16);
  ctx.moveTo(18, cy + 16);
  ctx.lineTo(102, cy + 16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const [x, dir] of [[16, -1], [104, 1]]) {
    for (const y of [cy - 16, cy + 16]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * 7, y - 5);
      ctx.lineTo(x - dir * 7, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
  const size = fitFont(ctx, 'REPLAY', 100, 22);
  ctx.font = `900 ${size}px ${FONT_STACK}`;
  outlinedText(ctx, 'REPLAY', w / 2, cy, def.fg, 'rgba(10,30,80,0.85)', 3.5);
}

/** ブランク(SQS)。ハズレ埋めと分かる地味なタイル */
function drawBlank(ctx, def, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.strokeStyle = def.accent;
  ctx.lineWidth = 1.6;
  // 封筒の輪郭をごく控えめに
  roundRect(ctx, cx - 21, cy - 12, 42, 24, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 21, cy - 12);
  ctx.lineTo(cx, cy + 2);
  ctx.lineTo(cx + 21, cy - 12);
  ctx.stroke();
}

const SHAPE_DRAWERS = {
  cherry: drawCherry,
  bell: drawBell,
  melon: drawMelon,
  ghost: drawGhost7,
  shark: drawSharkBar,
  lambda: drawLambda,
  scale: drawReplay,
  queue: drawBlank,
};

/**
 * 1絵柄ぶんのプレースホルダタイルを描く
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawPlaceholder(ctx, def, w = SYMBOL_W, h = SYMBOL_H) {
  ctx.save();
  // タイル地
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, def.bg2 ?? def.bg);
  g.addColorStop(1, def.bg);
  roundRect(ctx, 1.5, 1.5, w - 3, h - 3, 8);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 図柄
  const drawer = SHAPE_DRAWERS[def.shape];
  ctx.save();
  if (drawer) drawer(ctx, def, w, h);
  ctx.restore();

  // AWS文字(図柄の右側)。GHOST7/SHARKBAR/LAMBDA/REPLAY は図柄側で描画済み
  if (def.label && ['cherry', 'bell', 'melon'].includes(def.shape)) {
    const size = fitFont(ctx, def.label, 52, 24);
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    outlinedText(ctx, def.label, 84, h / 2, def.fg, 'rgba(255,255,255,0.85)', 3);
  }
  ctx.restore();
}

/** いま使うべきデバイスピクセル比(1〜3に丸める) */
function deviceDpr() {
  if (typeof window === 'undefined') return 1;
  return Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
}

/**
 * 大きな原画を目標サイズ付近まで 1/2 ずつ段階的に縮めて返す。
 *
 * 418px の原画を一度の drawImage で 60px まで落とすと、ブラウザの補間が
 * 「間引き」に近い挙動になり、輪郭がガタガタ(=ドット絵のよう)に見える。
 * 半分ずつなら常に隣接ピクセルが平均されるので、細部が潰れずに縮む。
 *
 * @returns {CanvasImageSource} 目標サイズの2倍以内まで縮めた画像
 */
export function downscaleInSteps(img, iw, ih, targetW, targetH) {
  let src = img;
  let w = iw;
  let h = ih;
  // 念のため上限を付ける(1/2ずつなので実際は数回で終わる)
  for (let i = 0; i < 8; i++) {
    if (w < targetW * 2 || h < targetH * 2) break;
    const nw = Math.max(1, Math.round(w / 2));
    const nh = Math.max(1, Math.round(h / 2));
    const step = document.createElement('canvas');
    step.width = nw;
    step.height = nh;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
    src = step;
    w = nw;
    h = nh;
  }
  return src;
}

/**
 * 絵柄タイルのキャッシュ。
 */
export class SymbolCache {
  /**
   * @param {object} opts
   * @param {import('../engine/assets.js').AssetStore|null} opts.assets
   * @param {number} [opts.dpr] 省略時は devicePixelRatio
   */
  constructor({ assets = null, dpr = 0 } = {}) {
    this.assets = assets;
    this.dpr = Math.max(1, Math.min(dpr || deviceDpr(), 3));
    /** @type {Map<string, HTMLCanvasElement>} */
    this.tiles = new Map();
    this.usedPlaceholder = [];
    /** 縮小途中の画像を絵柄IDごとに使い回す(再ビルド時の再計算を避ける) */
    this._scaled = new Map();
    this._onResize = this._onResize.bind(this);
    this._watching = false;
  }

  build() {
    this.tiles.clear();
    this.usedPlaceholder = [];
    for (const id of SYMBOL_IDS) {
      const def = SYMBOLS[id];
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(SYMBOL_W * this.dpr);
      canvas.height = Math.round(SYMBOL_H * this.dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // 既定の 'low' だと縮小がジャギるので必ず 'high' にする
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const img = this.assets?.get(id) ?? null;
      if (img) {
        this._drawAsset(ctx, def, img, id);
      } else {
        drawPlaceholder(ctx, def, SYMBOL_W, SYMBOL_H);
        this.usedPlaceholder.push(id);
      }
      this.tiles.set(id, canvas);
    }
    this._watchDpr();
    return this;
  }

  /** キャッシュ1枚あたりの実ピクセル数(デバッグ表示・確認用) */
  get tilePixelSize() {
    return { w: Math.round(SYMBOL_W * this.dpr), h: Math.round(SYMBOL_H * this.dpr) };
  }

  /**
   * PNGアセットをタイルへ contain で配置する。
   * 原画は正方形(418×418)でセルは横長(120×60)なので、
   * 潰さずに高さ基準で収め、左右は余白のままにする。
   */
  _drawAsset(ctx, def, img, id) {
    const g = ctx.createLinearGradient(0, 0, 0, SYMBOL_H);
    g.addColorStop(0, def.bg2 ?? def.bg);
    g.addColorStop(1, def.bg);
    roundRect(ctx, 1.5, 1.5, SYMBOL_W - 3, SYMBOL_H - 3, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const iw = img.width || SYMBOL_W;
    const ih = img.height || SYMBOL_H;
    const scale = Math.min(SYMBOL_W / iw, SYMBOL_H / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    // 実ピクセルでの最終サイズまで段階縮小してから貼る
    const targetW = Math.max(1, Math.round(dw * this.dpr));
    const targetH = Math.max(1, Math.round(dh * this.dpr));
    const key = `${id}@${targetW}x${targetH}`;
    let source = this._scaled.get(key);
    if (!source) {
      source = downscaleInSteps(img, iw, ih, targetW, targetH);
      this._scaled.set(key, source);
    }
    ctx.drawImage(source, (SYMBOL_W - dw) / 2, (SYMBOL_H - dh) / 2, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1.5, 1.5, SYMBOL_W - 3, SYMBOL_H - 3, 8);
    ctx.stroke();
  }

  /**
   * DPRが変わったらキャッシュを作り直す。
   * 別解像度のディスプレイへウィンドウを移すと、作り置きのタイルだけ
   * 解像度が足りずに拡大されてジャギる(=ドット絵に見える)ため。
   */
  _watchDpr() {
    if (this._watching || typeof window === 'undefined') return;
    this._watching = true;
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  _onResize() {
    const dpr = deviceDpr();
    if (Math.abs(dpr - this.dpr) < 0.001) return;
    this.dpr = dpr;
    this.build();
  }

  /** @returns {HTMLCanvasElement|null} */
  get(id) {
    return this.tiles.get(id) ?? null;
  }
}
