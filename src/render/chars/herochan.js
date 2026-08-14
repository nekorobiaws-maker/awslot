/**
 * キャラ描画: ヒーローRUSHの主役「ヒーロー」。DESIGN.md 6.8 / U30
 *
 * ■ 2026-08-14 追加(ユーザー支給素材)
 *   assets/chars/hero.png(1536×1024 / 5列×3行=15ポーズのスプライトシート)。
 *   赤い箱ロゴの「ヒーロー」Tシャツを着た、黒髪眼鏡のちび男性。
 *   ルナ(render/chars/lunachan.js)と同じくグリーンバックのままの素材なので、
 *   切り出しパイプライン(render/chars/sheetcut.js)を共有している。
 *
 * ■ ルナとの役割の違い
 *   ルナ   … 数百ゲームに1回の「出たら嬉しい」カメオ(一瞬だけ出て消える)
 *   ヒーロー … **ヒーローRUSH(5G固定のプレミア)のあいだ画面に常駐する主役**。
 *   毎ゲームの当落(当選率と枚数は data/rushes.js の heroHitLabel() / HERO_RUSH。
 *   U40 で 100 → 50 になったので、ここには数字を書かない)にリアクションを返すのが仕事なので、
 *   ポーズは「喜ぶ / 焦る / ドヤる / へたり込む」が揃っている。
 *
 * ■ セルの取り方が luna と違う点(実測)
 *   このシートは **セル境界が等間隔ではない**。罫線の実測位置は
 *     縦線 x = 308〜309 / 610 / 911 / 1212(等分なら 307.2/614.4/921.6/1228.8)
 *     横線 y = 346〜347 / 683   (等分なら 341.3/682.7)
 *   で、素直に imgW/cols で割ると最終列が 17px ぶん右へずれて絵が欠ける。
 *   そこで **境界を実測値で持つ**(COL_EDGES / ROW_EDGES)。
 *   さらにセルの大きさが列ごとに違う(298〜311px)ので、そのままだと
 *   ポーズごとに身長が変わってしまう。縮小率だけは共通の「基準セル」
 *   (NOMINAL_CELL)で決め、位置はそれぞれのセル中心を基準に置く。
 *
 * ■ 左右反転はしない(既定)
 *   Tシャツに「ヒーロー」と **読める文字** が入っているので、
 *   反転すると鏡文字になって台無しになる。
 *   反転してよいポーズだけ mirror:true を明示する(いまは走りポーズのみ)。
 */

import { charAssets, loadCharAssets } from '../../engine/assets.js';
import { cutSheetCell, GREENBACK_CHROMA } from './sheetcut.js';

/** フォールバック描画とエフェクトで使う配色(素材から拾った値) */
export const HERO_COLORS = {
  hair: '#241f22',
  hairLight: '#4a4046',
  shirt: '#17171b',
  shirtLogo: '#e0243a',
  skin: '#ffe0c6',
  glass: '#dcefff',
  outline: '#1a1216',
  accent: '#ffd166',
  coin: '#ffc42e',
};

/* ────────────────────────────────────────────────────────────
 * スプライトシート
 * ──────────────────────────────────────────────────────────── */

/** セル境界(実測)。左端・右端は画像の端そのもの */
const COL_EDGES = [0, 310, 611, 912, 1213, 1536];
const ROW_EDGES = [0, 348, 684, 1024];

/**
 * セル境界の白い罫線を避けるための内側マージン(px)。
 * 罫線は幅1〜2px、絵の外接矩形は境界から最短でも 11px 内側にあるので、
 * 6 なら罫線を跨がず絵も削らない。
 */
const INSET = 6;

export const HERO_SHEET = {
  id: 'hero',
  file: 'assets/chars/hero.png',
  imgW: 1536,
  imgH: 1024,
  cols: 5,
  rows: 3,
  colEdges: COL_EDGES,
  rowEdges: ROW_EDGES,
  inset: INSET,
};

/** 緑抜きのしきい値(素材は luna.png と同じ作りなので共通値で足りる) */
export const HERO_CHROMA = GREENBACK_CHROMA;

/**
 * 縮小率を決めるための基準セル(inset 込みの平均サイズ)。
 * 列ごとの実寸(298〜311 × 324〜336)の差をここで吸収し、
 * どのポーズでも身長が揃うようにする。
 */
const NOMINAL_CELL = { w: 295, h: 329 };

/**
 * 15ポーズのレジストリ。
 *   col/row  … スプライトシート上の位置(左上が 0,0)
 *   anim     … 既定の芝居(ANIMS のキー)
 *   fx       … 追加エフェクト(FX のキー)
 *   fxColor  … エフェクトの色
 *   mirror   … true のポーズだけ dir で左右反転してよい(既定は反転しない)
 *   facing   … 素材が向いている方向(mirror:true のポーズでのみ意味を持つ)
 *   use      … どのシチュエーションで使うか(人間向けメモ)
 */
export const HERO_POSES = {
  // ── 1行目 ──
  smile:    { col: 0, row: 0, anim: 'idle',       use: '通常待機・にっこり' },
  guts:     { col: 1, row: 0, anim: 'cheerJump',  fx: 'sparkle', fxColor: '#ffd166', use: 'ガッツポーズ・当選' },
  glasses:  { col: 2, row: 0, anim: 'swagger',    fx: 'sparkle', fxColor: '#8fd8ff', use: '眼鏡くいっ・キメ' },
  think:    { col: 3, row: 0, anim: 'ponder',     use: 'うーん?・思案' },
  banzai:   { col: 4, row: 0, anim: 'hop',        fx: 'sparkle', fxColor: '#ffe9a8', use: '両拳バンザイ・突入' },
  // ── 2行目 ──
  surprise: { col: 0, row: 1, anim: 'jitter',     use: '驚き(!)・急変' },
  sweat:    { col: 1, row: 1, anim: 'fluster',    fx: 'sweat', use: '汗焦り・ハズレ' },
  wink:     { col: 2, row: 1, anim: 'pointing',   fx: 'stars', fxColor: '#ffd166', use: '星ウインク指差し・レア役' },
  doya:     { col: 3, row: 1, anim: 'breathe',    use: '腕組みドヤ・余裕' },
  coin:     { col: 4, row: 1, anim: 'coinShow',   fx: 'coins', use: '金コイン・払い出し' },
  // ── 3行目 ──
  party:    { col: 0, row: 2, anim: 'hop',        fx: 'confetti', use: '紙吹雪お祝い・完走' },
  dizzy:    { col: 1, row: 2, anim: 'slump',      use: '目回りへたり込み・力尽きた' },
  wave:     { col: 2, row: 2, anim: 'waveArm',    use: '手を振る・挨拶/退場' },
  coding:   { col: 3, row: 2, anim: 'typing',     use: 'ノートPCで作業・処理中' },
  run:      { col: 4, row: 2, anim: 'dash',       fx: 'speed', mirror: true, facing: -1, use: '走る・横切り' },
};

/**
 * シチュエーション → ポーズの対応表。
 * 演出側は「何の場面か」でも引ける(ポーズ名の直接指定も可)。
 */
export const HERO_SITUATIONS = {
  normal: 'smile',
  idle: 'smile',
  appear: 'banzai',
  entry: 'banzai',
  premium: 'banzai',
  cheer: 'guts',
  win: 'guts',
  hit: 'coin',
  payout: 'coin',
  bigWin: 'party',
  ending: 'party',
  miss: 'sweat',
  panic: 'sweat',
  lose: 'dizzy',
  exhausted: 'dizzy',
  rare: 'wink',
  bonusRole: 'wink',
  cool: 'doya',
  keme: 'glasses',
  quiz: 'think',
  interrupt: 'surprise',
  bye: 'wave',
  work: 'coding',
  dash: 'run',
};

/**
 * ポーズ名を解決する。ポーズ名でもシチュエーション名でも通る。
 * @param {string} [name]
 * @returns {string} HERO_POSES のキー
 */
export function resolveHeroPose(name) {
  if (!name) return 'smile';
  if (HERO_POSES[name]) return name;
  if (HERO_SITUATIONS[name]) return HERO_SITUATIONS[name];
  return 'smile';
}

/* ────────────────────────────────────────────────────────────
 * ポーズの切り出し(初回だけ実行してキャッシュ)
 * ──────────────────────────────────────────────────────────── */

/**
 * @type {Map<string, {canvas:HTMLCanvasElement, w:number, h:number,
 *   ox:number, oy:number, cellW:number, cellH:number}|null>}
 */
const artCache = new Map();

// 画像は使う側が何もしなくても揃うように、読み込みだけ先に始めておく。
// (ブラウザ以外の環境=構文チェックやシミュレータでは何もしない)
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  loadCharAssets();
}

/** スプライトシート本体。未ロードなら null */
function sheet() {
  return charAssets.get(HERO_SHEET.id);
}

/** シートが使える状態か(カットインのキャッシュキーにも使う) */
export function heroArtReady() {
  return !!sheet();
}

/**
 * ポーズ1枚ぶんの絵を用意する。
 * @param {string} poseName
 * @returns {{canvas:HTMLCanvasElement, w:number, h:number, ox:number, oy:number,
 *   cellW:number, cellH:number}|null} 未ロード時は null
 */
export function heroPoseArt(poseName) {
  const name = resolveHeroPose(poseName);
  if (artCache.has(name)) return artCache.get(name);
  const img = sheet();
  if (!img || typeof document === 'undefined') return null;

  let art = null;
  try {
    const pose = HERO_POSES[name];
    const x0 = COL_EDGES[pose.col] + INSET;
    const y0 = ROW_EDGES[pose.row] + INSET;
    art = cutSheetCell(img, {
      sx: x0,
      sy: y0,
      sw: COL_EDGES[pose.col + 1] - INSET - x0,
      sh: ROW_EDGES[pose.row + 1] - INSET - y0,
    }, { chroma: HERO_CHROMA });
  } catch (e) {
    console.warn('[hero] ポーズの切り出しに失敗しました:', name, e);
    art = null;
  }
  // 失敗は毎フレーム再試行しないようキャッシュへ(null を入れて打ち止め)
  artCache.set(name, art);
  return art;
}

/* ────────────────────────────────────────────────────────────
 * アニメーション(絵は替えず、変形だけで芝居をつける)
 *
 * 返り値: { dx, dy, rot, sx, sy } … 位置オフセット/回転/スケール
 * すべて「scale=1 のときの画面px」基準。
 * ──────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

const ANIMS = {
  /** ふわふわ待機 */
  idle: (t) => ({ dy: Math.sin(t * 1.9) * 3, rot: Math.sin(t * 1.05) * 0.03 }),

  /** ぴょこぴょこ跳ねる(着地で潰れる) */
  hop: (t) => {
    const ph = (t * 1.7) % 1;
    const jump = Math.sin(ph * Math.PI);
    const land = Math.max(0, 1 - jump * 6);
    return {
      dy: -14 * jump,
      sx: 1 + 0.10 * land - 0.045 * jump,
      sy: 1 - 0.10 * land + 0.06 * jump,
      rot: Math.sin(t * 3.4) * 0.04,
    };
  },

  /** 喜びの連続ジャンプ(高め) */
  cheerJump: (t) => {
    const ph = (t * 2.2) % 1;
    const jump = Math.sin(ph * Math.PI);
    const land = Math.max(0, 1 - jump * 7);
    return {
      dy: -21 * jump,
      dx: Math.sin(t * 4.4) * 2.5,
      sx: 1 + 0.12 * land - 0.05 * jump,
      sy: 1 - 0.12 * land + 0.08 * jump,
      rot: Math.sin(t * 6.6) * 0.055,
    };
  },

  /** ビクッと驚く */
  jitter: (t) => ({
    dx: Math.sin(t * 24) * 3.2,
    dy: Math.sin(t * 7.5) * 4 - 3,
    rot: Math.sin(t * 12) * 0.075,
    sy: 1 + Math.max(0, Math.sin(t * 3.1)) * 0.05,
  }),

  /** おろおろ焦る(小刻みに左右へ・ときどき縮こまる) */
  fluster: (t) => {
    const shrink = Math.max(0, Math.sin(t * 2.3)) ** 2;
    return {
      dx: Math.sin(t * 15) * 3,
      dy: 2 + shrink * 3,
      sy: 1 - shrink * 0.04,
      sx: 1 + shrink * 0.03,
      rot: Math.sin(t * 7.5) * 0.03,
    };
  },

  /** 指差しでキメる(ぐっと前に出してから戻す) */
  pointing: (t) => {
    const push = Math.max(0, Math.sin(t * 2.6)) ** 2;
    return { dx: push * 4, dy: -push * 3 + Math.sin(t * 1.7) * 2, rot: -push * 0.03 };
  },

  /** 腕組みで呼吸だけ(ドヤ) */
  breathe: (t) => ({
    dy: Math.sin(t * 1.15) * 2.5,
    sx: 1 + Math.sin(t * 1.15) * 0.018,
    sy: 1 - Math.sin(t * 1.15) * 0.014,
    rot: Math.sin(t * 0.6) * 0.015,
  }),

  /** コインを掲げて見せびらかす(上下に大きめ) */
  coinShow: (t) => {
    const up = (Math.sin(t * 2.8) + 1) / 2;
    return { dy: -9 * up, rot: Math.sin(t * 2.8) * 0.05, sy: 1 + up * 0.035 };
  },

  /** 考え中(ゆっくり首をかしげる) */
  ponder: (t) => ({ rot: Math.sin(t * 1.1) * 0.09 + 0.02, dy: Math.sin(t * 1.6) * 2.5 }),

  /** タイピング(前傾で小刻み) */
  typing: (t) => ({ dy: Math.sin(t * 13) * 1.4, rot: 0.02 + Math.sin(t * 6.5) * 0.012 }),

  /** 手を振る(体ごと左右へ) */
  waveArm: (t) => ({ rot: Math.sin(t * 3.4) * 0.12, dx: Math.sin(t * 3.4) * 4, dy: Math.sin(t * 6.8) * 2 }),

  /** へたり込んで小さく揺れる(目回り) */
  slump: (t) => ({
    dy: 4 + Math.sin(t * 1.4) * 2,
    rot: Math.sin(t * 0.9) * 0.07,
    sy: 0.99 + Math.sin(t * 1.4) * 0.012,
  }),

  /** 走る(前傾 + 前後にシュッ) */
  dash: (t) => ({
    dx: Math.sin(t * 6.4) * 6,
    dy: Math.abs(Math.sin(t * 6.4)) * -5,
    rot: Math.sin(t * 6.4) * 0.035,
    sx: 1 + Math.sin(t * 6.4) * 0.025,
  }),

  /** キメ(ゆっくり構える) */
  swagger: (t) => ({
    dy: Math.sin(t * 1.7) * 3,
    rot: Math.sin(t * 0.85) * 0.045 - 0.015,
    sx: 1 + Math.sin(t * 1.7) * 0.015,
  }),
};

/* ── 追加エフェクト(キャラの後ろに重ねる)─────────────
 *
 * エフェクトの濃さは **呼び出し時点の globalAlpha に掛け算** すること
 * (代入で上書きすると、退場フェード中にキャラだけ薄くなって
 *  コインや紙吹雪だけ濃いまま取り残される)。
 */

const FX = {
  /** きらめき(喜び・キメ) */
  sparkle(ctx, t, box, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.85 + i * 0.2) % 1);
      const ang = i * 1.7 + t * 0.5;
      const rx = Math.cos(ang) * box.w * 0.44;
      const ry = Math.sin(ang * 1.25) * box.h * 0.34 - box.h * 0.08;
      const s = (5 + (i % 2) * 4) * Math.sin(ph * Math.PI);
      if (s <= 0.2) continue;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ph * 1.4);
      ctx.fillStyle = i % 2 ? color : 'rgba(255,255,255,0.9)';
      star4(ctx, s);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 星がぽんぽん跳ねる(レア役の +α) */
  stars(ctx, t, box, color) {
    ctx.save();
    const base = ctx.globalAlpha;
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.7 + i * 0.25) % 1);
      const x = (i % 2 ? 1 : -1) * box.w * (0.2 + (i % 3) * 0.09);
      const y = box.h * 0.18 - ph * box.h * 0.55;
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.9;
      ctx.translate(x, y);
      ctx.rotate(ph * 2.4);
      ctx.fillStyle = color;
      star5(ctx, 7 + (i % 2) * 3);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 金貨が舞い上がる(払い出し) */
  coins(ctx, t, box) {
    ctx.save();
    const base = ctx.globalAlpha;
    for (let i = 0; i < 6; i++) {
      const ph = ((t * 0.8 + i * 0.167) % 1);
      const x = (i % 2 ? 1 : -1) * box.w * (0.16 + (i % 3) * 0.11) + Math.sin(ph * 5 + i) * 4;
      const y = box.h * 0.26 - ph * box.h * 0.7;
      const spin = Math.abs(Math.cos((ph * 4 + i) * Math.PI));
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.95;
      ctx.translate(x, y);
      ctx.scale(0.3 + spin * 0.7, 1);
      coin(ctx, 7);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 汗が飛ぶ(焦り) */
  sweat(ctx, t, box) {
    ctx.save();
    const base = ctx.globalAlpha;
    ctx.fillStyle = '#9fd8ff';
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 1.5 + i * 0.33) % 1);
      const x = (i % 2 ? 1 : -1) * box.w * (0.26 + i * 0.05);
      const y = -box.h * 0.2 + ph * box.h * 0.3;
      ctx.save();
      ctx.globalAlpha = base * (1 - ph) * 0.85;
      ctx.translate(x + (i % 2 ? 1 : -1) * ph * 8, y);
      drop(ctx, 5);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 紙吹雪(お祝い) */
  confetti(ctx, t, box) {
    ctx.save();
    const base = ctx.globalAlpha;
    const COLORS = ['#ffd54a', '#ff6b9a', '#6be7ff', '#8cf07a', '#c78bff'];
    for (let i = 0; i < 12; i++) {
      const ph = ((t * 0.6 + i * 0.083) % 1);
      const x = ((i * 37) % 100) / 100 * box.w - box.w / 2;
      const y = -box.h * 0.55 + ph * box.h * 1.2;
      ctx.save();
      ctx.globalAlpha = base * Math.sin(ph * Math.PI) * 0.9;
      ctx.translate(x + Math.sin(ph * 8 + i) * 6, y);
      ctx.rotate(ph * 7 + i);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(-2.5, -4, 5, 8);
      ctx.restore();
    }
    ctx.restore();
  },

  /**
   * 進行方向と反対へ流れるスピードライン。
   * dirSign は「画面上でキャラが向いている方向」(1=右 / -1=左)なので、
   * 線は必ず背中側に出る(素材を反転した場合も正しい側になる)。
   */
  speed(ctx, t, box, color, dirSign = 1) {
    const back = dirSign >= 0 ? -1 : 1;
    ctx.save();
    const base = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 1.8 + i * 0.2) % 1);
      const len = box.w * (0.3 + (i % 3) * 0.16);
      const y = -box.h * 0.25 + (i / 4) * box.h * 0.5;
      const x = back * (box.w * 0.3 + ph * box.w * 0.45);
      ctx.globalAlpha = base * 0.45 * Math.sin(ph * Math.PI);
      ctx.strokeStyle = 'rgba(255,224,166,0.9)';
      ctx.lineWidth = 3 - (i % 3) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + back * len, y);
      ctx.stroke();
    }
    ctx.restore();
  },
};

/** 4方向のきらめき */
function star4(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.18, -s * 0.18, s, 0);
  ctx.quadraticCurveTo(s * 0.18, s * 0.18, 0, s);
  ctx.quadraticCurveTo(-s * 0.18, s * 0.18, -s, 0);
  ctx.quadraticCurveTo(-s * 0.18, -s * 0.18, 0, -s);
  ctx.closePath();
  ctx.fill();
}

/** 五芒星 */
function star5(ctx, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.44;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** 金貨(★入り) */
function coin(ctx, s) {
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, TAU);
  ctx.fillStyle = HERO_COLORS.coin;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.strokeStyle = '#a86a00';
  ctx.stroke();
  ctx.fillStyle = '#fff2b8';
  star5(ctx, s * 0.5);
}

/** 汗の雫 */
function drop(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.9, s * 0.25, 0, s);
  ctx.quadraticCurveTo(-s * 0.9, s * 0.25, 0, -s);
  ctx.closePath();
  ctx.fill();
}

/* ────────────────────────────────────────────────────────────
 * 描画
 * ──────────────────────────────────────────────────────────── */

/**
 * scale=1 のときにキャラ(=セル1枚)を収める箱。
 * 基準セルが 295×329 なので、箱も同じ比率にして歪ませない。
 * 高さはジョージ(150)・ルナ(165)と同じ感覚で使えるよう 165 に揃えてある。
 */
const BOX = { w: 148, h: 165 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ────────────────────────────────────────────────────────────
 * 「出ている間は透けない」ための不透明化
 *
 * ルナと同じ考え方(render/chars/lunachan.js の LUNA_SOLID_AT のコメント参照)。
 * ヒーローは **ヒーローRUSH の主役** で、しかも定位置は右下寄り。
 * 演出テキスト帯(中心 y194)と正面衝突しない位置関係なので、
 * 「テキスト帯が出ているあいだキャラを沈める」減光の対象から外している。
 * 減光の除外そのものは呼び出し側(render/chars/index.js)で行うが、
 * 万一そこを通らない経路から薄い alpha が届いても
 * **見えていると判断できる濃さなら不透明として描く**ようにしておく。
 * 入場/退場のフェードは 0〜HERO_SOLID_AT の区間に圧縮されて残る。
 * ──────────────────────────────────────────────────────────── */
const HERO_SOLID_AT = 0.5;

/** 呼び出し側の alpha を「見えている=不透明」に寄せる */
const solidify = (a) => clamp01(a / HERO_SOLID_AT);

/**
 * ヒーローを1体描く。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose] ポーズ名 / シチュエーション名
 * @param {string} [state.anim] 既定アニメの上書き(ANIMS のキー / 'none' で静止)
 * @param {number} [state.t=0] 経過秒
 * @param {number} [state.dir=1] 1=右向き -1=左向き(mirror:true のポーズだけ効く)
 * @param {number} [state.alpha=1] 0〜1(上の HERO_SOLID_AT 参照)
 * @param {boolean} [state.fx=true] 追加エフェクトを描くか
 * @param {boolean} [state.aura=true] 足元のスポットライトを描くか
 */
export function drawHero(ctx, state) {
  const {
    x, y, scale = 1, t = 0, dir = 1, alpha = 1, fx = true, aura = true,
  } = state;
  const solid = solidify(alpha);
  if (solid <= 0 || scale <= 0) return;

  const name = resolveHeroPose(state.pose);
  const pose = HERO_POSES[name];
  const art = heroPoseArt(name);

  // 芝居(ポーズ既定 → state.anim で上書き)
  const animName = state.anim ?? pose.anim ?? 'idle';
  const anim = ANIMS[animName] ?? ANIMS.idle;
  const m = animName === 'none' ? {} : anim(t, state);
  const dx = m.dx ?? 0;
  const dy = m.dy ?? 0;
  const rot = m.rot ?? 0;
  const sx = m.sx ?? 1;
  const sy = m.sy ?? 1;

  // 画面上でキャラが向く方向。反転を許したポーズだけ dir に従い、
  // それ以外は素材のまま(Tシャツの文字を鏡文字にしないため)
  const screenDir = pose.mirror ? (dir >= 0 ? 1 : -1) : (pose.facing ?? 1);
  const flip = pose.mirror && screenDir * (pose.facing ?? 1) < 0 ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = solid;

  // 足元のスポットライト。位置がぶれると気持ち悪いので芝居のオフセットは掛けない
  if (aura) drawSpot(ctx, x, y, scale, t);

  ctx.translate(x + dx * scale, y + dy * scale);
  ctx.scale(scale, scale);

  if (fx && pose.fx && FX[pose.fx]) {
    // エフェクト自体は反転させない(向きが要るものは screenDir を見る)
    FX[pose.fx](ctx, t, BOX, pose.fxColor ?? HERO_COLORS.accent, screenDir);
  }

  ctx.rotate(rot);
  ctx.scale(sx * flip, sy);

  if (art) {
    // 縮小率は基準セルで決める(セル幅が列ごとに違っても身長が揃う)。
    // 位置はそれぞれのセル内の関係を保ったまま置く
    const k = Math.min(BOX.w / NOMINAL_CELL.w, BOX.h / NOMINAL_CELL.h);
    const dw = art.w * k;
    const dh = art.h * k;
    const cx = (art.ox + art.w / 2 - art.cellW / 2) * k;
    const cy = (art.oy + art.h / 2 - art.cellH / 2) * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.canvas, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    drawLoadingHero(ctx);
  }
  ctx.restore();
}

/**
 * 足元のスポットライト(「主役が立っている」感を出すためのもの)。
 * 液晶が暗いRUSH画面でキャラが浮いて見えないのを防ぐ。
 */
function drawSpot(ctx, x, y, scale, t) {
  const rx = BOX.w * 0.62 * scale;
  const ry = BOX.h * 0.14 * scale;
  const cy = y + BOX.h * 0.42 * scale;
  const k = 0.8 + Math.sin(t * 2.2) * 0.2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, `rgba(255,209,102,${0.34 * k})`);
  g.addColorStop(0.6, `rgba(255,164,0,${0.14 * k})`);
  g.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * 画像が来るまでのつなぎ。
 * 一瞬しか出ないので「黒Tシャツに赤ロゴの眼鏡くんが居る」ことだけ伝わればよい。
 */
function drawLoadingHero(ctx) {
  ctx.save();
  ctx.globalAlpha *= 0.9;
  // 髪
  ctx.fillStyle = HERO_COLORS.hair;
  ctx.strokeStyle = HERO_COLORS.outline;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.ellipse(0, -34, 33, 34, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // 体(黒Tシャツ)
  ctx.fillStyle = HERO_COLORS.shirt;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-25, -6, 50, 54, 10);
  else ctx.rect(-25, -6, 50, 54);
  ctx.fill();
  ctx.stroke();
  // 胸の赤い箱ロゴ
  ctx.fillStyle = HERO_COLORS.shirtLogo;
  ctx.fillRect(-16, 10, 32, 14);
  // 眼鏡のハイライト
  ctx.fillStyle = HERO_COLORS.glass;
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.ellipse(-11, -32, 9, 7, 0, 0, TAU);
  ctx.ellipse(11, -32, 9, 7, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ────────────────────────────────────────────────────────────
 * chars/index.js へ登録するデータ
 * ──────────────────────────────────────────────────────────── */

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

/**
 * ヒーロー専用のモーション。chars/index.js の MOTIONS へマージされる。
 * 「登場 → 当たった → 外した → 終わった」の4拍がここで完結する。
 */
export const HERO_MOTIONS = {
  /** デビュー(下からせり上がって、着地でドンと構える) */
  heroDebut: { ms: 900, apply: (c, p) => {
    const rise = easeOutBack(Math.min(1, p / 0.55));
    c.offsetY = (1 - rise) * 90;
    c.scaleMul = 0.72 + 0.28 * Math.min(1, easeOutCubic(p / 0.5));
    c.alphaMul = Math.min(1, p / 0.14);
    const land = Math.max(0, 1 - Math.abs(p - 0.58) / 0.16);
    c.squashX = 1 + land * 0.1;
    c.squashY = 1 - land * 0.1;
    c.tilt = Math.sin(p * Math.PI * 3) * 0.05 * (1 - p);
  } },
  /** 当たった!(ぴょんぴょん2回跳ねる) */
  heroHop: { ms: 900, apply: (c, p) => {
    const ph = (p * 2) % 1;
    const up = Math.sin(ph * Math.PI);
    c.offsetY = -up * 28;
    c.squashX = 1 + (1 - up) * 0.08 - up * 0.04;
    c.squashY = 1 - (1 - up) * 0.08 + up * 0.06;
    c.tilt = Math.sin(p * Math.PI * 5) * 0.07;
  } },
  /** コインを掲げる(ぐいっと上げて、ゆっくり戻す) */
  heroCoinUp: { ms: 700, apply: (c, p) => {
    const up = Math.sin(Math.min(1, p / 0.45) * Math.PI * 0.5);
    c.offsetY = -up * 18 * (1 - Math.max(0, (p - 0.55) / 0.45) * 0.8);
    c.scaleMul = 1 + up * 0.1;
    c.tilt = -up * 0.05;
  } },
  /** 外した…(縮こまってから戻る) */
  heroShrink: { ms: 700, apply: (c, p) => {
    const k = Math.sin(Math.min(1, p / 0.4) * Math.PI * 0.5) * (1 - Math.max(0, (p - 0.6) / 0.4));
    c.offsetY = k * 8;
    c.squashX = 1 + k * 0.07;
    c.squashY = 1 - k * 0.09;
    c.tilt = Math.sin(p * Math.PI * 8) * 0.03;
  } },
  /** 力尽きる(がくっと沈む) */
  heroFlop: { ms: 1100, apply: (c, p) => {
    const e = easeOutCubic(Math.min(1, p / 0.4));
    c.offsetY = e * 16;
    c.tilt = e * 0.12;
    c.squashX = 1 + e * 0.06;
    c.squashY = 1 - e * 0.06;
  } },
  /** 完走の万歳(3回跳ねる) */
  heroFinale: { ms: 1400, apply: (c, p) => {
    const ph = (p * 3) % 1;
    const up = Math.sin(ph * Math.PI);
    c.offsetY = -up * 32;
    c.squashX = 1 + (1 - up) * 0.08 - up * 0.05;
    c.squashY = 1 - (1 - up) * 0.08 + up * 0.07;
    c.tilt = Math.sin(p * Math.PI * 7) * 0.08;
  } },
  /** 右へ走り去る(退場) */
  heroRunOut: { ms: 900, apply: (c, p) => {
    c.offsetX = easeInCubic(p) * 240;
    c.alphaMul = 1 - Math.max(0, (p - 0.45) / 0.5);
    c.tilt = -0.08;
  } },
};

/**
 * モード別の定位置(LCD 440×300 の論理座標)。
 *
 * ヒーローRUSH の盤面は
 *   y52 見出し / y72〜126 5つの枠 / y152 ロゴ / y176 補足 / y232〜262 結論行
 * なので、右側の空き(x300〜410)に立たせる。
 * ここに無いモードは default が使われる(= 前のモードの座標が残らない)。
 */
export const HERO_HOMES = {
  default:   { x: 350, y: 188, scale: 0.54 },
  /*
   * 立ち位置は「5枠(〜y126)より下」「結論行の座布団(y230〜)より上」。
   *   中心 y180 / 高さ 165×0.58 ≒ 96px → 体は y132〜228 に収まる。
   *   横は x309〜395 で、ロゴ(x94〜294)とも右下の合計枚数とも取り合わない。
   */
  HERO_RUSH: { x: 352, y: 180, scale: 0.58 },
  // 通常時に顔を出すとき(デバッグ・お祝い)は少し小さく
  FREE_TIER: { x: 344, y: 190, scale: 0.52 },
};
