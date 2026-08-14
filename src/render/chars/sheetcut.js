/**
 * グリーンバックのスプライトシートから「1ポーズぶんの絵」を切り出す共通処理。
 *
 * ■ なぜ共通化したか(2026-08-14)
 *   ユーザー支給のキャラ素材は
 *     assets/chars/luna.png(5列×4行=20ポーズ / 1254×1254)
 *     assets/chars/hero.png(5列×3行=15ポーズ / 1536×1024)
 *   のように **どれも同じ作り**(緑背景 + セル境界の細い罫線)で届く。
 *   最初に書いた切り出しは render/chars/lunachan.js の中にあったが、
 *   3人目・4人目が来るたびに同じ80行を写経するのは事故のもとなので、
 *   「画素をいじる部分」だけをここへ出した。
 *   キャラらしさ(ポーズ表・芝居・エフェクト)は各キャラのファイルに残す。
 *
 * ■ 切り出しの流れ(呼び出し側は初回だけ実行してキャッシュすること)
 *   1. セル矩形を切る … 呼び出し側が inset 済みの矩形を渡す(罫線をまたがない)
 *   2. 緑抜き        … 緑度 = G - max(R,B) で判定(render/cabinet.js と同じ考え方)
 *   3. 低アルファ落とし … 抜き残りの点を消す
 *   4. 薄い罫線消し   … 行/列まるごと薄い画素なら素材の線とみなす
 *   5. 外接矩形でトリム … 描画コストを下げる(位置はセル内オフセットとして返す)
 *
 * ■ 返り値の ox/oy(構図を壊さないための要)
 *   トリムで捨てた余白のぶんを覚えておくと、切り詰めたあとでも
 *   「頭上の!マークがセルのどのへんに描かれていたか」を再現できる。
 *   呼び出し側は cellW/cellH を箱に合わせて縮小し、ox/oy で位置を戻す。
 */

/**
 * 緑抜きのしきい値。緑度 = G - max(R,B) で判定する。
 *   hard  … これ以上は完全に透明
 *   soft  … これ以下は完全に不透明(絵の一部として残す)
 *   minG  … そもそも G が暗い画素は背景ではない(黒服・影を守る)
 *   spill … 輪郭に残る緑かぶりを G ≦ max(R,B)+spill まで抑える
 *
 * 実測(luna.png / hero.png とも):
 *   背景 … 緑度 155〜239 / 髪・黒服 … 緑度 0 前後 / 肌 … 負の値
 * なので hard=90 は背景と絵のあいだに十分な余裕がある(誤爆しない)。
 */
export const GREENBACK_CHROMA = { hard: 90, soft: 30, minG: 60, spill: 20 };

/** 抜き残りとみなすアルファ(これ未満は完全透過にする) */
const ALPHA_FLOOR = 42;

/** 罫線とみなす条件(george.js の実測値と同じ) */
const LINE = { fillRatio: 0.7, solidRatio: 0.06, solidAlpha: 150 };

/**
 * グリーンバックの緑を透明にする(ImageData の画素配列を直接書き換える)。
 * @param {Uint8ClampedArray} px
 * @param {typeof GREENBACK_CHROMA} [opt]
 */
export function keyOutGreen(px, opt = GREENBACK_CHROMA) {
  const span = Math.max(1, opt.hard - opt.soft);
  for (let o = 0; o < px.length; o += 4) {
    const g = px[o + 1];
    if (g < opt.minG) continue;          // 暗い画素は背景ではない(黒服・影を守る)
    const r = px[o];
    const b = px[o + 2];
    const max = r > b ? r : b;
    const green = g - max;
    if (green <= opt.soft) continue;     // 緑くない = 絵の一部
    if (green >= opt.hard) {
      px[o] = 0;
      px[o + 1] = 0;
      px[o + 2] = 0;
      px[o + 3] = 0;
      continue;
    }
    // 中間は輪郭のアンチエイリアス。半透明にしつつ緑かぶりを抑える
    const a = Math.round((255 * (opt.hard - green)) / span);
    if (a < px[o + 3]) px[o + 3] = a;
    const cap = max + opt.spill;
    if (g > cap) px[o + 1] = cap;
  }
}

/**
 * セル境界に残っている薄い罫線を行(または列)ごと透明にする。
 * 濃い画素を含む行は絵の一部なので消さない。
 * @param {Uint8ClampedArray} px
 * @param {number} w
 * @param {number} h
 * @param {boolean} horizontal true=行を見る / false=列を見る
 */
export function stripFaintLines(px, w, h, horizontal) {
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  for (let o = 0; o < outer; o++) {
    let n = 0;
    let solid = 0;
    for (let i = 0; i < inner; i++) {
      const idx = ((horizontal ? o * w + i : i * w + o) * 4) + 3;
      const a = px[idx];
      if (a === 0) continue;
      n++;
      if (a >= LINE.solidAlpha) solid++;
    }
    if (n < inner * LINE.fillRatio) continue;
    if (solid > inner * LINE.solidRatio) continue;
    for (let i = 0; i < inner; i++) {
      px[((horizontal ? o * w + i : i * w + o) * 4) + 3] = 0;
    }
  }
}

/**
 * スプライトシートの1セルを切り出して「緑を抜いた不透明部だけ」のキャンバスにする。
 *
 * @param {CanvasImageSource} img スプライトシート本体
 * @param {{sx:number, sy:number, sw:number, sh:number}} rect
 *   シート上の切り出し矩形。**罫線を避けた内側の矩形** を渡すこと。
 * @param {object} [opts]
 * @param {typeof GREENBACK_CHROMA} [opts.chroma]
 * @param {number} [opts.alphaFloor] 抜き残りとみなすアルファ
 * @param {number} [opts.pad] トリム時に残す余白(px)
 * @returns {{canvas:HTMLCanvasElement, w:number, h:number, ox:number, oy:number,
 *   cellW:number, cellH:number}|null}
 *   描けない環境(document 無し / 画素を読めない)や全部透明なら null
 */
export function cutSheetCell(img, rect, {
  chroma = GREENBACK_CHROMA,
  alphaFloor = ALPHA_FLOOR,
  pad = 1,
} = {}) {
  if (!img || typeof document === 'undefined') return null;
  const { sx, sy, sw, sh } = rect;
  const w = Math.max(1, Math.round(sw));
  const h = Math.max(1, Math.round(sh));

  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  if (!wctx) return null;
  wctx.imageSmoothingEnabled = true;
  wctx.imageSmoothingQuality = 'high';
  wctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

  let data = null;
  try {
    data = wctx.getImageData(0, 0, w, h);
  } catch {
    // 画素を読めない環境(cross-origin 等)では緑背景のまま出すしかないので諦める
    return null;
  }

  const px = data.data;
  // 1. グリーンバックを抜く
  keyOutGreen(px, chroma);
  // 2. 抜き残り(アルファが数%だけ残った点)を落とす
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < alphaFloor) px[i] = 0;
  }
  // 3. 罫線消し: ほぼ全幅(全高)が薄い画素で埋まっている行/列は素材の線
  stripFaintLines(px, w, h, true);
  stripFaintLines(px, w, h, false);

  // 4. 外接矩形
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;   // 全部透明 = 切り出し位置かしきい値が違う
  wctx.putImageData(data, 0, 0);

  const tx = Math.max(0, minX - pad);
  const ty = Math.max(0, minY - pad);
  const tw = Math.min(w, maxX + 1 + pad) - tx;
  const th = Math.min(h, maxY + 1 + pad) - ty;

  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.drawImage(work, tx, ty, tw, th, 0, 0, tw, th);
  return { canvas: out, w: tw, h: th, ox: tx, oy: ty, cellW: w, cellH: h };
}
