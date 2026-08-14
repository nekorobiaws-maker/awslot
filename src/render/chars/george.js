/**
 * キャラ描画: サメの「ジョージ」。DESIGN.md 6.8
 *
 * ■ 2026-08-14 v4 画像ベースへ全面移行(ユーザー支給素材)
 *
 *   これまで v3 は Canvas のパス描画でサメを作り込んでいたが、
 *   「手描きサメが可愛くない」というユーザー判断により
 *   **assets/chars/shark.png(1536×1024 / 5列×4行=20ポーズのスプライトシート)**
 *   から drawImage で描く方式へ全面的に置き換えた。
 *   同時に、権利上の理由でお化けキャラ(Kiro)は表示から全廃し、
 *   その役どころもこのサメの別ポーズで演じる(chars/kiro.js を参照)。
 *
 * ■ スプライトシートの扱い
 *   1セル = 1536/5 × 1024/4 = 307.2 × 256。素材は既に背景が透過済み(RGBA)なので
 *   セル矩形を切り出すだけで使えるが、
 *     - セル境界に薄いグリッド線が残っている  → 内側へ数px inset して切る
 *     - 背景除去の残りかす(alpha が数%の点)   → 低アルファを 0 に落とす
 *     - ポーズごとに絵の大きさ・余白がまちまち → 不透明部の外接矩形でトリミング
 *   の3点を初回切り出し時に1回だけ行い、ポーズ単位でキャッシュする。
 *   毎フレームは drawImage 1回 + 変形だけで済む(DESIGN.md 注意事項11 と同じ方針)。
 *
 * ■ 動き
 *   静止画なので「絵は替えず ctx の変形で芝居をつける」。
 *   ポーズごとに既定のアニメ(ぷかぷか/スイング/ぴょんぴょん/ぷるぷる 等)を持たせ、
 *   炎・ジェット・コインなど一部のポーズには追加のエフェクト(発光/スピードライン/
 *   きらめき)を重ねる。呼び出し側は pose を指定するだけで芝居が付く。
 *
 * ■ API 互換
 *   旧 v3 の { x, y, scale, pose, mouthOpen, tailAngle, brow, t, dir, alpha } を
 *   そのまま受け付ける。mouthOpen は「噛みつきの伸び」、tailAngle は「体のうねり」へ
 *   読み替えるので、既存のモーション定義(render/chars/index.js)も無改造で動く。
 */

import { charAssets, loadCharAssets } from '../../engine/assets.js';

/** 旧 v3 の配色。フォールバック描画とヒレ予告で使う(素材のオレンジに合わせてある) */
export const GEORGE_COLORS = {
  bodyDark: '#d9611a',
  body: '#f5822a',
  bodyLight: '#ffa347',
  shade: '#c9500f',
  fin: '#ee7620',
  finDark: '#c2540f',
  belly: '#fdf2de',
  bellyShade: '#f3ddba',
  outline: '#2e1206',
  eyeWhite: '#ffffff',
  pupil: '#1a0c04',
  tooth: '#fffdf7',
  mouth: '#8c1f24',
  mouthDeep: '#671017',
  tongue: '#d95a63',
};

/* ────────────────────────────────────────────────────────────
 * スプライトシート
 * ──────────────────────────────────────────────────────────── */

export const SHARK_SHEET = {
  id: 'shark',
  file: 'assets/chars/shark.png',
  imgW: 1536,
  imgH: 1024,
  cols: 5,
  rows: 4,
  /** セル境界の線と隣のセルのにじみを避けるための内側マージン(px) */
  inset: 5,
};

const CELL_W = SHARK_SHEET.imgW / SHARK_SHEET.cols;  // 307.2
const CELL_H = SHARK_SHEET.imgH / SHARK_SHEET.rows;  // 256

/**
 * 20ポーズのレジストリ。
 *   col/row … スプライトシート上の位置(左上が 0,0)
 *   facing  … 素材が向いている方向(1=右 / -1=左)。dir=1 で右を向くよう自動で反転する
 *   anim    … 既定のアニメ(ANIMS のキー)
 *   fx      … 追加エフェクト(FX のキー)
 *   use     … どのシチュエーションで使うか(人間向けメモ)
 */
export const SHARK_POSES = {
  // ── 1行目 ──
  smile:     { col: 0, row: 0, facing: -1, anim: 'idle',    use: '通常登場・待機' },
  thumbsUp:  { col: 1, row: 0, facing: -1, anim: 'bounce',  use: '成功・OK・ミッション達成' },
  jump:      { col: 2, row: 0, facing: -1, anim: 'hop',     use: '噛みつき・飛び込み・入賞' },
  cool:      { col: 3, row: 0, facing:  1, anim: 'swagger', use: 'クールキメ・上位モード' },
  love:      { col: 4, row: 0, facing: -1, anim: 'throb',   use: '大勝利・惚れ惚れ' },
  // ── 2行目 ──
  angry:     { col: 0, row: 1, facing: -1, anim: 'tremble', use: '怒り・強制終了・ペナルティ' },
  panic:     { col: 1, row: 1, facing:  1, anim: 'jitter',  use: '驚き・焦り・中断通知' },
  sleep:     { col: 2, row: 1, facing: -1, anim: 'breathe', use: 'ハズレ・脱力・待機退屈' },
  dash:      { col: 3, row: 1, facing:  1, anim: 'dash',    fx: 'speed', use: 'RUSH走行・高速消化' },
  cheer:     { col: 4, row: 1, facing: -1, anim: 'swing',   use: '喜び・煽り・継続' },
  // ── 3行目 ──
  splash:    { col: 0, row: 2, facing:  1, anim: 'hop',     use: '水遊び・軽い当たり' },
  starSwing: { col: 1, row: 2, facing: -1, anim: 'swing',   fx: 'sparkle', use: 'チャンス目・星演出' },
  peek:      { col: 2, row: 2, facing:  1, anim: 'peekUp',  use: '期待煽り・ちょい出し予告' },
  fire:      { col: 3, row: 2, facing: -1, anim: 'pulse',   fx: 'flame',  use: '激アツ・7図柄・確定演出' },
  coin:      { col: 4, row: 2, facing: -1, anim: 'bounce',  fx: 'sparkle', use: '払い出し・獲得枚数' },
  // ── 4行目 ──
  floatRing: { col: 0, row: 3, facing: -1, anim: 'bob',     use: 'CZ・のんびり待機' },
  question:  { col: 1, row: 3, facing: -1, anim: 'wobble',  use: 'クイズ・選択・不明' },
  dive:      { col: 2, row: 3, facing:  1, anim: 'bob',     use: '潜行・撤退・小役ハズレ' },
  jet:       { col: 3, row: 3, facing: -1, anim: 'dash',    fx: 'speed', use: 'RUSH突入・上位移行' },
  party:     { col: 4, row: 3, facing: -1, anim: 'bounce',  fx: 'confetti', use: '大勝利・エンディング' },
};

/**
 * シチュエーション → ポーズの対応表。
 * 演出側は「何の場面か」でポーズを引ける(pose 名の直接指定も従来どおり可)。
 */
export const SHARK_SITUATIONS = {
  idle: 'smile',
  appear: 'smile',
  ok: 'thumbsUp',
  bite: 'jump',
  win: 'coin',
  payout: 'coin',
  bigWin: 'party',
  ending: 'party',
  loveWin: 'love',
  hot: 'fire',
  seven: 'fire',
  rushEntry: 'jet',
  rushRun: 'dash',
  tease: 'peek',
  chance: 'starSwing',
  cz: 'floatRing',
  quiz: 'question',
  lose: 'sleep',
  retreat: 'dive',
  interrupt: 'panic',
  penalty: 'angry',
  cheer: 'cheer',
  cool: 'cool',
  splash: 'splash',
};

/**
 * 旧APIのポーズ名。scenarios/ が参照しているので**キーは絶対に消さない**。
 * 値は「対応するサメのポーズ」+ 旧パラメータ(index.js が base.mouthOpen 等を読む)。
 */
export const GEORGE_POSES = {
  normal: { shark: 'smile', mouthOpen: 0.14, tailAngle: 0.0, brow: 0.0, gaze: 0.0 },
  grin: { shark: 'cheer', mouthOpen: 0.40, tailAngle: 0.15, brow: -0.16, gaze: 0.6 },
  bite: { shark: 'jump', mouthOpen: 1.0, tailAngle: 0.35, brow: -0.34, gaze: 1.0 },
  angry: { shark: 'angry', mouthOpen: 0.55, tailAngle: 0.25, brow: -0.5, gaze: 0.8 },
  chill: { shark: 'sleep', mouthOpen: 0.06, tailAngle: -0.1, brow: 0.14, gaze: -0.4 },
};

// サメのポーズ名も GEORGE_POSES から直接指定できるようにしておく
// (シナリオ側が pose: 'fire' のように書けるようになる)
for (const name of Object.keys(SHARK_POSES)) {
  if (!GEORGE_POSES[name]) {
    GEORGE_POSES[name] = { shark: name, mouthOpen: 0.2, tailAngle: 0, brow: 0, gaze: 0 };
  }
}

/**
 * ポーズ名を解決する。旧ポーズ名・シチュエーション名・サメのポーズ名のどれでも通る。
 * @param {string} [name]
 * @returns {string} SHARK_POSES のキー
 */
export function resolvePose(name) {
  if (!name) return 'smile';
  if (SHARK_POSES[name]) return name;
  if (GEORGE_POSES[name]?.shark) return GEORGE_POSES[name].shark;
  if (SHARK_SITUATIONS[name]) return SHARK_SITUATIONS[name];
  return 'smile';
}

/* ────────────────────────────────────────────────────────────
 * ポーズの切り出し(初回だけ実行してキャッシュ)
 * ──────────────────────────────────────────────────────────── */

/** @type {Map<string, {canvas: HTMLCanvasElement, w:number, h:number}|null>} */
const artCache = new Map();

/** 背景除去の残りかすとみなすアルファ(これ未満は完全透過にする) */
const ALPHA_FLOOR = 42;

// 画像は使う側が何もしなくても揃うように、読み込みだけ先に始めておく。
// (ブラウザ以外の環境=構文チェックやシミュレータでは何もしない)
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  loadCharAssets();
}

/** スプライトシート本体。未ロードなら null */
function sheet() {
  return charAssets.get(SHARK_SHEET.id);
}

/** シートが使える状態か(オフスクリーンにキャッシュする描画のキーに使う) */
export function sharkArtReady() {
  return !!sheet();
}

/**
 * ポーズ1枚ぶんの絵を用意する。
 * @param {string} poseName
 * @returns {{canvas: HTMLCanvasElement, w:number, h:number}|null} 未ロード時は null
 */
export function sharkPoseArt(poseName) {
  const name = resolvePose(poseName);
  if (artCache.has(name)) return artCache.get(name);
  const img = sheet();
  if (!img || typeof document === 'undefined') return null;

  let art = null;
  try {
    art = cutCell(img, SHARK_POSES[name]);
  } catch (e) {
    console.warn('[shark] ポーズの切り出しに失敗しました:', name, e);
    art = null;
  }
  // 失敗は毎フレーム再試行しないようキャッシュへ(null を入れて打ち止め)
  artCache.set(name, art);
  return art;
}

/**
 * セルを切り出して「不透明部だけ」のキャンバスにする。
 *   1. inset ぶん内側を drawImage で写す(グリッド線対策)
 *   2. 低アルファを 0 に落とす(背景除去の残りかす対策)
 *   3. セル境界の薄い線(素材に残っている罫線)を行/列ごと消す
 *   4. 不透明部の外接矩形でトリミング(ポーズごとの余白差を吸収)
 *
 * 3 が無いと、薄い罫線1本のせいで外接矩形がセル全体に広がり、
 * ポーズによってサメだけ小さく描かれる(= 大きさが揃わない)。
 */
function cutCell(img, pose) {
  const inset = SHARK_SHEET.inset;
  const sx = pose.col * CELL_W + inset;
  const sy = pose.row * CELL_H + inset;
  const sw = CELL_W - inset * 2;
  const sh = CELL_H - inset * 2;
  const w = Math.round(sw);
  const h = Math.round(sh);

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
    // 画素を読めない環境(cross-origin 等)ではセルをそのまま使う
    return { canvas: work, w, h };
  }

  const px = data.data;
  // 1. かすれ(背景除去の残り)を落とす
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < ALPHA_FLOOR) px[i] = 0;
  }
  // 2. 罫線消し: ほぼ全幅(全高)が薄い画素だけで埋まっている行/列は素材の罫線
  stripFaintLines(px, w, h, true);
  stripFaintLines(px, w, h, false);

  // 3. 外接矩形
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;   // 全部透明 = 切り出し位置が違う
  wctx.putImageData(data, 0, 0);

  // 外接矩形 + 余白1px で切り直す
  const pad = 1;
  const tx = Math.max(0, minX - pad);
  const ty = Math.max(0, minY - pad);
  const tw = Math.min(w, maxX + 1 + pad) - tx;
  const th = Math.min(h, maxY + 1 + pad) - ty;

  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const octx = out.getContext('2d');
  if (!octx) return { canvas: work, w, h };
  octx.drawImage(work, tx, ty, tw, th, 0, 0, tw, th);
  return { canvas: out, w: tw, h: th };
}

/** 罫線とみなす条件 */
const LINE = {
  /** その行(列)の何割が「薄く不透明」なら線候補か */
  fillRatio: 0.7,
  /** 濃い画素がこの割合を超えるなら絵の一部とみなして残す */
  solidRatio: 0.06,
  /** 「濃い」の境目 */
  solidAlpha: 150,
};

/**
 * セル境界に残っている薄い罫線を行(または列)ごと透明にする。
 * 絵の一部(濃い画素を含む行)は消さないので、サメ本体やエフェクトは削れない。
 * @param {Uint8ClampedArray} px
 * @param {boolean} horizontal true=行を見る / false=列を見る
 */
function stripFaintLines(px, w, h, horizontal) {
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

/* ────────────────────────────────────────────────────────────
 * アニメーション(絵は替えず、変形だけで芝居をつける)
 *
 * 返り値: { dx, dy, rot, sx, sy } … 位置オフセット/回転/スケール
 * すべて「scale=1 のときの画面px」基準。
 * ──────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

const ANIMS = {
  /** ふつうに漂う */
  idle: (t) => ({ dy: Math.sin(t * 2.0) * 3, rot: Math.sin(t * 1.1) * 0.045 }),

  /** ぷかぷか浮遊(浮き輪・潜水) */
  bob: (t) => ({ dy: Math.sin(t * 1.5) * 6, rot: Math.sin(t * 0.9 + 1) * 0.07 }),

  /** ゆらゆらスイング(喜び・星) */
  swing: (t) => ({
    dy: Math.sin(t * 3.2) * 4,
    rot: Math.sin(t * 2.6) * 0.13,
    sx: 1 + Math.sin(t * 2.6) * 0.02,
  }),

  /** ぴょんぴょん + 着地の squash & stretch(コイン・お祝い) */
  bounce: (t) => {
    const ph = (t * 1.7) % 1;
    const jump = Math.sin(ph * Math.PI);
    const land = Math.max(0, 1 - jump * 6);
    return {
      dy: -14 * jump,
      sx: 1 + 0.10 * land - 0.045 * jump,
      sy: 1 - 0.10 * land + 0.065 * jump,
      rot: Math.sin(t * 3.4) * 0.05,
    };
  },

  /** 大きめの一発ジャンプ(噛みつき・飛び込み) */
  hop: (t) => {
    const ph = (t * 1.15) % 1;
    const jump = Math.sin(Math.min(1, ph / 0.62) * Math.PI);
    const land = Math.max(0, 1 - jump * 7);
    return {
      dy: -22 * jump,
      dx: 5 * Math.sin(ph * Math.PI),
      rot: -0.16 * jump,
      sx: 1 + 0.12 * land - 0.05 * jump,
      sy: 1 - 0.12 * land + 0.08 * jump,
    };
  },

  /** ぷるぷる震え(怒り) */
  tremble: (t) => ({
    dx: Math.sin(t * 34) * 2.6,
    dy: Math.cos(t * 29) * 1.8,
    rot: Math.sin(t * 31) * 0.02,
    sx: 1 + Math.sin(t * 9) * 0.03,
  }),

  /** 焦ってバタバタ(驚き・中断) */
  jitter: (t) => ({
    dx: Math.sin(t * 22) * 4,
    dy: Math.sin(t * 7) * 5 - 3,
    rot: Math.sin(t * 11) * 0.1,
  }),

  /** すやすや(呼吸だけ) */
  breathe: (t) => ({
    dy: Math.sin(t * 1.1) * 2.5,
    sx: 1 + Math.sin(t * 1.1) * 0.022,
    sy: 1 - Math.sin(t * 1.1) * 0.018,
    rot: Math.sin(t * 0.5) * 0.02,
  }),

  /** 泳ぎ突進(前傾 + 前後にシュッ) */
  dash: (t) => ({
    dx: Math.sin(t * 5.5) * 7,
    dy: Math.sin(t * 3.1) * 3,
    rot: -0.1 + Math.sin(t * 5.5) * 0.04,
    sx: 1 + Math.sin(t * 5.5) * 0.03,
  }),

  /** 明滅しながら迫る(激アツ) */
  pulse: (t) => {
    const k = 1 + Math.sin(t * 7.5) * 0.055;
    return { dy: Math.sin(t * 3.6) * 3, sx: k, sy: k, rot: Math.sin(t * 13) * 0.018 };
  },

  /** キメ顔(ゆっくり構える) */
  swagger: (t) => ({
    dy: Math.sin(t * 1.6) * 4,
    rot: Math.sin(t * 0.8) * 0.06 + 0.03,
    sx: 1 + Math.sin(t * 1.6) * 0.015,
  }),

  /** ときめき(心拍) */
  throb: (t) => {
    const beat = Math.max(0, Math.sin(t * 4.4)) ** 2;
    return { dy: -4 * beat, sx: 1 + beat * 0.07, sy: 1 + beat * 0.05, rot: Math.sin(t * 2.2) * 0.05 };
  },

  /** 下からひょっこり(覗き) */
  peekUp: (t) => {
    const ph = (t * 0.75) % 1;
    // 0.15〜0.75 のあいだだけ顔を出し、あとは沈んでいる
    const up = ph < 0.15 ? ph / 0.15 : ph < 0.75 ? 1 : Math.max(0, 1 - (ph - 0.75) / 0.25);
    return { dy: (1 - up) * 42, dx: Math.sin(t * 4) * 3, rot: Math.sin(t * 3) * 0.05 };
  },

  /** 首をかしげる(はてな) */
  wobble: (t) => ({
    rot: Math.sin(t * 1.9) * 0.16,
    dy: Math.sin(t * 3.8) * 3,
  }),
};

/* ── 追加エフェクト(キャラの後ろ/手前に重ねる) ───────────── */

const FX = {
  /** 炎の後光。激アツポーズの周りで明滅する */
  flame(ctx, t, dir, box) {
    const k = 0.72 + Math.sin(t * 7.5) * 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = box.h * (0.62 + Math.sin(t * 5) * 0.04);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, `rgba(255,210,120,${0.45 * k})`);
    g.addColorStop(0.55, `rgba(255,120,20,${0.3 * k})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  /** 進行方向と反対へ流れるスピードライン */
  speed(ctx, t, dir, box) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ph = ((t * 1.8 + i * 0.2) % 1);
      const len = box.w * (0.35 + (i % 3) * 0.18);
      const y = -box.h * 0.3 + (i / 4) * box.h * 0.6;
      const x = -dir * (box.w * 0.35 + ph * box.w * 0.5);
      ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
      ctx.strokeStyle = 'rgba(190,235,255,0.9)';
      ctx.lineWidth = 3 - (i % 3) * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dir * len, y);
      ctx.stroke();
    }
    ctx.restore();
  },

  /** きらめき(コイン・星) */
  sparkle(ctx, t, dir, box) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.9 + i * 0.25) % 1);
      const ang = i * 1.9 + t * 0.6;
      const rx = Math.cos(ang) * box.w * 0.42;
      const ry = Math.sin(ang * 1.3) * box.h * 0.38;
      const s = (6 + (i % 2) * 4) * Math.sin(ph * Math.PI);
      if (s <= 0.2) continue;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(ph * 1.6);
      ctx.fillStyle = i % 2 ? 'rgba(255,240,170,0.95)' : 'rgba(255,255,255,0.9)';
      star4(ctx, s);
      ctx.restore();
    }
    ctx.restore();
  },

  /** 紙吹雪(お祝い) */
  confetti(ctx, t, dir, box) {
    ctx.save();
    const COLORS = ['#ffd54a', '#ff6b9a', '#6be7ff', '#8cf07a', '#c78bff'];
    for (let i = 0; i < 10; i++) {
      const ph = ((t * 0.55 + i * 0.1) % 1);
      const x = ((i * 37) % 100) / 100 * box.w - box.w / 2;
      const y = -box.h * 0.6 + ph * box.h * 1.25;
      ctx.save();
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      ctx.translate(x + Math.sin(ph * 8 + i) * 6, y);
      ctx.rotate(ph * 7 + i);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fillRect(-3, -4.5, 6, 9);
      ctx.restore();
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

/* ────────────────────────────────────────────────────────────
 * 描画
 * ──────────────────────────────────────────────────────────── */

/**
 * scale=1 のときにキャラを収める箱。
 * 旧 v3 のサメが x -82〜86 / y -70〜58 だったので、そこへ寄せてある
 * (液晶の定位置 chars/index.js とカットインの倍率を作り直さずに済む)。
 */
const BOX = { w: 186, h: 150 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * サメを1体描く。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} state.x
 * @param {number} state.y
 * @param {number} [state.scale=1]
 * @param {string} [state.pose] ポーズ名/旧ポーズ名/シチュエーション名
 * @param {string} [state.anim] 既定アニメの上書き(ANIMS のキー / 'none' で静止)
 * @param {number} [state.t=0] 経過秒
 * @param {number} [state.dir=1] 1=右向き -1=左向き
 * @param {number} [state.alpha=1]
 * @param {number} [state.mouthOpen] 旧API。噛みつきの伸び(前へ伸びて潰れる)へ読み替える
 * @param {number} [state.tailAngle] 旧API。体のうねり(回転)へ読み替える
 * @param {number} [state.brow] 旧API。前傾の強さへ読み替える
 * @param {boolean} [state.fx=true] 追加エフェクトを描くか
 */
export function drawShark(ctx, state) {
  const {
    x, y, scale = 1, t = 0, dir = 1, alpha = 1,
    mouthOpen = 0, tailAngle = 0, brow = 0, fx = true,
  } = state;
  if (alpha <= 0 || scale <= 0) return;

  const name = resolvePose(state.pose);
  const pose = SHARK_POSES[name];
  const art = sharkPoseArt(name);

  // 芝居(ポーズ既定 → state.anim で上書き)
  const animName = state.anim ?? pose.anim ?? 'idle';
  const anim = ANIMS[animName] ?? ANIMS.idle;
  const m = animName === 'none' ? {} : anim(t, state);
  const dx = m.dx ?? 0;
  const dy = m.dy ?? 0;
  let rot = m.rot ?? 0;
  let sx = m.sx ?? 1;
  let sy = m.sy ?? 1;

  // 旧APIの読み替え
  const open = clamp01(mouthOpen);
  sx *= 1 + open * 0.06;         // 噛みつきは前へ伸びて
  sy *= 1 - open * 0.045;        // 少し潰れる
  rot += tailAngle * 0.22 - brow * 0.06;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + dx * scale, y + dy * scale);
  ctx.scale(scale, scale);

  const box = { w: BOX.w, h: BOX.h };
  if (fx && pose.fx && FX[pose.fx]) {
    // エフェクトは反転させない(左右どちら向きでも同じ見え方にする)
    FX[pose.fx](ctx, t, dir >= 0 ? 1 : -1, box);
  }

  ctx.rotate(rot);
  // 素材の向きを打ち消して dir=1 が必ず右向きになるようにする
  ctx.scale(sx * (dir >= 0 ? 1 : -1) * (pose.facing >= 0 ? 1 : -1), sy);

  if (art) {
    const fit = Math.min(BOX.w / art.w, BOX.h / art.h);
    const dw = art.w * fit;
    const dh = art.h * fit;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art.canvas, -dw / 2, -dh / 2 - 2, dw, dh);
  } else {
    drawLoadingShark(ctx);
  }
  ctx.restore();
}

/** 旧名。既存の呼び出し(カットイン・液晶キャラ層)はこちらを使う */
export const drawGeorge = drawShark;

/**
 * 画像が来るまでのつなぎ。
 * 一瞬しか出ないので、シルエットで「サメが居る」ことだけ伝える。
 */
function drawLoadingShark(ctx) {
  ctx.save();
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = GEORGE_COLORS.body;
  ctx.strokeStyle = GEORGE_COLORS.outline;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  const p = new Path2D(
    'M -54 -8 C -46 -32, -16 -50, 12 -51 C 46 -52, 71 -36, 79 -14 ' +
    'C 84 -4, 82 7, 74 13 C 72 23, 58 33, 38 38 C 6 46, -30 35, -48 15 ' +
    'C -54 9, -58 1, -54 -8 Z',
  );
  ctx.fill(p);
  ctx.stroke(p);
  ctx.restore();
}

/**
 * 尾びれチラ見せ予告用(画面下からヒレだけ)。IDEAS.md 2-15
 * ヒレだけの絵はシートに無いので、ここは従来どおりパス描画のまま。
 */
export function drawGeorgeFin(ctx, { x, y, scale = 1, t = 0, alpha = 1 }) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + Math.sin(t * 1.6) * 14, y);
  ctx.scale(scale, scale);
  ctx.rotate(Math.sin(t * 3) * 0.1);
  const fin = new Path2D(
    'M -30 36 C -16 14, -4 -14, 4 -46 C 18 -12, 28 12, 36 36 C 12 27, -8 27, -30 36 Z',
  );
  ctx.fillStyle = GEORGE_COLORS.fin;
  ctx.fill(fin);
  ctx.strokeStyle = GEORGE_COLORS.outline;
  ctx.lineWidth = 5.5;
  ctx.lineJoin = 'round';
  ctx.stroke(fin);
  ctx.restore();
}
